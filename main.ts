import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  dialog,
  Menu,
  type IpcMainInvokeEvent,
} from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import http from 'http'
import url from 'url'
import fs from 'fs'
import net from 'net'
import type { SavePngBatchRequest, SavePngBatchResult, SessionData, StartImageGenRequest, StartImageGenResult, ImageGenProgress } from './src/types/ipc'
import { startQueue, cancelQueue, isBusy } from './src/pages/browser/automation/queue-manager'
import { destroyChatWindow } from './src/pages/browser/automation/browser-controller'
import { readImageGenConfig, writeImageGenConfig } from './src/pages/browser/automation/imageGenConfig'

const isDev = !app.isPackaged

const CLEAN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
app.userAgentFallback = CLEAN_UA

// Disable FIDO/caBLE discovery — eliminates the "Cannot start caBLE / not
// self-responsible" macOS security log spam when running from terminal.
app.commandLine.appendSwitch('disable-features', 'WebAuthentication')

// Silence benign navigation noise ─────────────────────────────────────────
// ERR_ABORTED (-3)       : webview redirect chains (chatgpt.com etc.) — harmless
// GUEST_VIEW_MANAGER_CALL: same aborted nav surfaced via internal Electron handler
// FIDO / caBLE errors    : suppressed via --disable-features=WebAuthentication above
function isNoisyError(msg: string): boolean {
  return (
    msg.includes('ERR_ABORTED') ||
    msg.includes('errno: -3') ||
    msg.includes('GUEST_VIEW_MANAGER_CALL') ||
    msg.includes('ERR_INVALID_URL') ||
    msg.includes('net::ERR_')
  )
}
process.on('unhandledRejection', (reason) => {
  if (isNoisyError(String(reason))) return
  console.error('[unhandledRejection]', reason)
})
process.on('uncaughtException', (err) => {
  if (isNoisyError(err.message)) return
  console.error('[uncaughtException]', err)
})

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null

let authPopupWcId: number | null = null  // kept for legacy reference, no longer used in interceptor

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
    tester.once('error', () => resolve(true))
    tester.once('listening', () => { tester.close(); resolve(false) })
    tester.listen(port, '127.0.0.1')
  })
}

let backendRestarts = 0
const MAX_BACKEND_RESTARTS = 3
const backendLogPath = path.join(app.getPath('userData'), 'backend.log')

function notifyBackendStatus(status: 'starting' | 'up' | 'crashed'): void {
  mainWindow?.webContents.send('backend:status', status)
}

async function startBackend(): Promise<void> {
  const inUse = await isPortInUse(8000)
  if (inUse) { console.log('[main] Port 8000 in use — reusing'); return }

  let spawnArgs: { cmd: string; args: string[]; opts: object }

  if (isDev) {
    const backendPath = path.join(__dirname, 'backend')
    spawnArgs = {
      cmd: 'python3',
      args: ['-m', 'uvicorn', 'api:app', '--host', '127.0.0.1', '--port', '8000'],
      opts: { cwd: backendPath, stdio: 'pipe' },
    }
  } else {
    const binaryName = process.platform === 'win32' ? 'api_server.exe' : 'api_server'
    const binaryPath = path.join(process.resourcesPath, 'api_server', binaryName)
    if (!fs.existsSync(binaryPath)) {
      const msg = `[backend] Binary not found: ${binaryPath}\n`
      fs.appendFileSync(backendLogPath, msg)
      console.error(msg)
      notifyBackendStatus('crashed')
      return
    }
    // Ensure executable bit (may be lost during packaging on macOS/Linux)
    if (process.platform !== 'win32') {
      try { fs.chmodSync(binaryPath, 0o755) } catch { /* ignore */ }
    }
    spawnArgs = {
      cmd: binaryPath,
      args: ['--host', '127.0.0.1', '--port', '8000'],
      opts: { stdio: 'pipe' },
    }
  }

  notifyBackendStatus('starting')
  backendProcess = spawn(spawnArgs.cmd, spawnArgs.args, spawnArgs.opts as object)

  backendProcess.stdout?.on('data', (d: Buffer) => {
    const line = d.toString()
    console.log('[backend]', line)
    fs.appendFileSync(backendLogPath, line)
  })
  backendProcess.stderr?.on('data', (d: Buffer) => {
    const line = d.toString()
    console.error('[backend]', line)
    fs.appendFileSync(backendLogPath, line)
  })

  backendProcess.on('exit', (code) => {
    console.log(`[backend] exited with code ${code}`)
    fs.appendFileSync(backendLogPath, `[exit] code=${code}\n`)
    if (code !== 0 && backendRestarts < MAX_BACKEND_RESTARTS) {
      backendRestarts++
      console.log(`[backend] restarting (attempt ${backendRestarts}/${MAX_BACKEND_RESTARTS})…`)
      fs.appendFileSync(backendLogPath, `[restart] attempt ${backendRestarts}\n`)
      setTimeout(() => void startBackend(), 2000)
    } else if (code !== 0) {
      notifyBackendStatus('crashed')
    }
  })
}

function waitForBackend(timeoutMs = 45_000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now()
    function attempt(): void {
      const req = http.get('http://127.0.0.1:8000/api/health', (res) => { res.resume(); resolve() })
      req.on('error', () => {
        if (Date.now() - start >= timeoutMs) { resolve() } else setTimeout(attempt, 200)
      })
      req.setTimeout(300, () => req.destroy())
    }
    attempt()
  })
}

function buildAppMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ label: app.name, submenu: [
      { role: 'about' as const },
      { type: 'separator' as const },
      { role: 'services' as const },
      { type: 'separator' as const },
      { role: 'hide' as const },
      { role: 'hideOthers' as const },
      { role: 'unhide' as const },
      { type: 'separator' as const },
      { role: 'quit' as const },
    ]}] : []),
    { label: 'Edit', submenu: [
      { role: 'undo' as const },
      { role: 'redo' as const },
      { type: 'separator' as const },
      { role: 'cut' as const },
      { role: 'copy' as const },
      { role: 'paste' as const },
      { role: 'selectAll' as const },
    ]},
    { label: 'View', submenu: [
      // Override CmdOrCtrl+R so it reloads the active browser tab, not the Electron window
      { label: 'Reload Tab', accelerator: 'CmdOrCtrl+R',
        click: () => { mainWindow?.webContents.send('browser:reload') } },
      { type: 'separator' as const },
      { role: 'toggleDevTools' as const },
      { role: 'togglefullscreen' as const },
    ]},
    { label: 'Window', submenu: [
      { role: 'minimize' as const },
      { role: 'zoom' as const },
      ...(isMac ? [
        { type: 'separator' as const },
        { role: 'front' as const },
      ] : [{ role: 'close' as const }]),
    ]},
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  buildAppMenu()
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    titleBarStyle: 'hiddenInset', backgroundColor: '#0A0A0A',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      webSecurity: true, webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  if (isDev) void mainWindow.loadURL('http://localhost:5173')
  else void mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'))

  // Re-send backend status once the renderer is ready — prevents the race where
  // 'backend:status: up' fires before React has mounted its IPC listener.
  mainWindow.webContents.once('did-finish-load', () => {
    waitForBackend(10_000)
      .then(() => notifyBackendStatus('up'))
      .catch(() => { /* backend not yet up — frontend checkHealth() fallback will handle it */ })
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Webview new-window → route through our popup handler
  mainWindow.webContents.on('did-attach-webview', (_event, webviewContents) => {
    webviewContents.setWindowOpenHandler(({ url }) => {
      handlePopup(url)
      return { action: 'deny' }
    })
  })
}

// ── IPC ────────────────────────────────────────────────────────────────────
ipcMain.handle('backend:restart', async () => {
  backendProcess?.kill()
  backendProcess = null
  backendRestarts = 0
  await startBackend()
  await waitForBackend(45_000)
  notifyBackendStatus('up')
})

ipcMain.handle('open-auth-popup', (_event, url: string) => { handlePopup(url) })
ipcMain.handle('open-external',   (_event, url: string) => shell.openExternal(url))

// ── First-run setup ────────────────────────────────────────────────────────
ipcMain.handle('setup:check', async (): Promise<{ configured: boolean; missingKeys: string[] }> => {
  try {
    const body = await new Promise<string>((resolve, reject) => {
      const req = http.get('http://127.0.0.1:8000/api/health', (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => resolve(data))
      })
      req.on('error', reject)
      req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')) })
    })
    const json    = JSON.parse(body) as { missing_keys?: string[] }
    const missing = json.missing_keys ?? []
    return { configured: missing.length === 0, missingKeys: missing }
  } catch {
    return { configured: false, missingKeys: ['NVIDIA_API_KEY', 'TAVILY_API_KEY'] }
  }
})

ipcMain.handle('setup:save-config', (_event, req: { nvidiaKey: string; tavilyKey: string }): { ok: boolean; error?: string } => {
  try {
    const configDir = path.join(app.getPath('userData'), 'backend')
    fs.mkdirSync(configDir, { recursive: true })
    const content = [
      `NVIDIA_API_KEY=${req.nvidiaKey.trim()}`,
      `TAVILY_API_KEY=${req.tavilyKey.trim()}`,
      '',
    ].join('\n')
    fs.writeFileSync(path.join(configDir, '.env'), content, 'utf8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('clear-browser-data', async () => {
  const { session: electronSession } = await import('electron')
  const ses = electronSession.fromPartition('persist:ai-browser')
  await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers'] })
  await ses.clearCache()
  console.log('[main] Browser data cleared (all)')
})

ipcMain.handle('clear-site-data', async (_event, domain: string) => {
  const { session: electronSession } = await import('electron')
  const ses = electronSession.fromPartition('persist:ai-browser')
  // Clear cookies for this domain and its subdomains
  const cookies = await ses.cookies.get({})
  const toRemove = cookies.filter(c => {
    const cd = (c.domain ?? '').replace(/^\./, '')
    return cd === domain || cd.endsWith('.' + domain) || domain.endsWith('.' + cd)
  })
  await Promise.all(toRemove.map(c => {
    const url = `http${c.secure ? 's' : ''}://${(c.domain ?? '').replace(/^\./, '')}${c.path ?? '/'}`
    return ses.cookies.remove(url, c.name).catch(() => {})
  }))
  // Clear storage for this origin
  try {
    await ses.clearStorageData({
      origin: `https://${domain}`,
      storages: ['localstorage', 'indexdb', 'cachestorage', 'serviceworkers'],
    })
  } catch {}
  console.log(`[main] Site data cleared: ${domain} (${toRemove.length} cookies)`)
  return { removed: toRemove.length }
})

ipcMain.handle('browser:context-menu', (_event, params: { x: number; y: number; linkUrl?: string; srcUrl?: string; selectionText?: string; isEditable?: boolean; pageURL?: string }) => {
  const { clipboard } = require('electron')
  const template: Electron.MenuItemConstructorOptions[] = []

  if (params.linkUrl) {
    template.push({ label: 'Open Link in New Tab', click: () => { mainWindow?.webContents.send('browser:open-new-tab', params.linkUrl) } })
    template.push({ label: 'Copy Link Address', click: () => { clipboard.writeText(params.linkUrl!) } })
  }
  if (params.srcUrl) {
    template.push({ label: 'Copy Image', click: async () => {
      try {
        const { net, nativeImage, clipboard: cb } = require('electron')
        const res = await net.fetch(params.srcUrl!)
        const buf = Buffer.from(await res.arrayBuffer())
        const img = nativeImage.createFromBuffer(buf)
        if (!img.isEmpty()) cb.writeImage(img)
      } catch {}
    }})
    template.push({ label: 'Open Image in New Tab', click: () => { mainWindow?.webContents.send('browser:open-new-tab', params.srcUrl) } })
    template.push({ label: 'Copy Image Address', click: () => { clipboard.writeText(params.srcUrl!) } })
  }
  if (template.length > 0) template.push({ type: 'separator' })
  if (params.selectionText) {
    template.push({ label: 'Copy', click: () => { clipboard.writeText(params.selectionText!) } })
  }
  if (params.isEditable) {
    template.push({ label: 'Paste', click: () => { mainWindow?.webContents.send('browser:paste') } })
  }
  template.push({ label: 'Reload Page', click: () => { mainWindow?.webContents.send('browser:reload') } })
  template.push({ type: 'separator' })
  template.push({ label: 'Back',    click: () => { mainWindow?.webContents.send('browser:go-back') } })
  template.push({ label: 'Forward', click: () => { mainWindow?.webContents.send('browser:go-forward') } })

  const menu = Menu.buildFromTemplate(template)
  menu.popup({ window: mainWindow! })
})

// ── Loopback callback server ───────────────────────────────────────────────
// Listens on 127.0.0.1:27123 — system browser hits /auth-done after login
const CALLBACK_PORT = 27123
let callbackServer: http.Server | null = null

function ensureCallbackServer(): void {
  if (callbackServer) return
  callbackServer = http.createServer((req, res) => {
    if (!req.url?.startsWith('/auth-done')) { res.end(); return }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Signed in</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;
background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;
height:100vh;text-align:center;padding:32px}.icon{font-size:52px;margin-bottom:16px}
h1{font-size:22px;font-weight:700;margin-bottom:8px}p{color:#888;font-size:14px;line-height:1.6}</style>
</head><body><div><div class="icon">✅</div>
<h1>You're signed in!</h1>
<p>You can close this tab and return to the app.<br>The app has been notified.</p>
</div></body></html>`)
    mainWindow?.show(); mainWindow?.focus()
    mainWindow?.webContents.send('auth-complete')
    ipcMain.emit('_auth-done-internal')
  })
  callbackServer.listen(CALLBACK_PORT, '127.0.0.1', () =>
    console.log(`[main] Auth callback server on port ${CALLBACK_PORT}`))
  callbackServer.on('error', () => { callbackServer = null })
}

// ── Waiting window (shown while user signs in via system browser) ──────────
let waitingWin: BrowserWindow | null = null

function openWaitingWindow(provider: string, reopenUrl: string): void {
  if (waitingWin && !waitingWin.isDestroyed()) { waitingWin.focus(); return }

  waitingWin = new BrowserWindow({
    width: 460, height: 320,
    resizable: false, minimizable: false, maximizable: false,
    autoHideMenuBar: true, title: `Sign in — ${provider}`,
    backgroundColor: '#0a0a0a',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })

  const safeUrl = reopenUrl.replace(/'/g, '%27')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;
  color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;
  height:100vh;padding:28px;text-align:center;-webkit-app-region:drag}
.icon{font-size:36px;margin-bottom:14px}
h2{font-size:16px;font-weight:700;margin-bottom:6px;letter-spacing:-.02em}
p{font-size:12px;color:#666;line-height:1.65;margin-bottom:18px}
.status{font-size:12px;color:#555;background:#111;border:1px solid #1e1e1e;
  border-radius:8px;padding:10px 14px;width:100%;margin-bottom:18px;text-align:left;line-height:1.9}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#0bda76;
  margin-right:7px;animation:pulse 1.4s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.btn{-webkit-app-region:no-drag;background:#0bda76;color:#000;border:none;padding:9px 20px;
  border-radius:7px;font-size:12px;font-weight:700;cursor:pointer}
.btn:hover{opacity:.85}
.cancel{-webkit-app-region:no-drag;background:none;border:none;color:#444;
  font-size:11px;cursor:pointer;margin-top:8px}
.cancel:hover{color:#888}
</style></head><body>
<div class="icon">🔑</div>
<h2>Sign in with ${provider}</h2>
<p>Complete sign-in in your browser window.<br>This app will update automatically.</p>
<div class="status">
  <div><span class="dot"></span>Waiting for ${provider} sign-in…</div>
  <div id="s2" style="color:#333">○ &nbsp;App will reload when done</div>
</div>
<button class="btn" onclick="window.__reopen && window.__reopen()">Re-open sign-in page</button>
<button class="cancel" onclick="window.close()">Cancel</button>
<script>
window.__reopen = function(){ require('electron').shell && require('electron').shell.openExternal('${safeUrl}') }
</script>
</body></html>`

  waitingWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

  const onDone = (): void => {
    if (!waitingWin || waitingWin.isDestroyed()) return
    waitingWin.webContents.executeJavaScript(`
      document.querySelector('.dot').style.animation='none';
      document.querySelector('.dot').style.background='#0bda76';
      document.querySelector('.status').children[0].innerHTML='✅ &nbsp;Signed in successfully!';
      document.querySelector('.status').children[1].style.color='#666';
      document.querySelector('.status').children[1].innerHTML='✅ &nbsp;Reloading browser tab…';
    `).catch(() => {})
    setTimeout(() => { if (waitingWin && !waitingWin.isDestroyed()) waitingWin.close() }, 2000)
  }
  ipcMain.once('_auth-done-internal', onDone)
  waitingWin.on('closed', () => { waitingWin = null; ipcMain.removeListener('_auth-done-internal', onDone) })
}

// ── Google/MS/Apple system-browser domains ─────────────────────────────────
const HARD_BLOCK_DOMAINS = [
  'accounts.google.com', 'signin.google.com',
  'login.microsoftonline.com', 'login.microsoft.com', 'login.live.com',
  'appleid.apple.com', 'idmsa.apple.com',
]

function isHardBlock(url: string): boolean {
  try {
    const h = new URL(url).hostname
    return HARD_BLOCK_DOMAINS.some(d => h === d || h.endsWith('.' + d))
  } catch { return false }
}

// ── In-app auth popup — same partition as webviews ─────────────────────────
// Used for OAuth popups from AI sites (e.g. auth.openai.com for ChatGPT login).
// CRITICAL: must use 'persist:ai-browser' so OAuth state cookies are shared.
//
// Strategy:
//  - If the popup URL itself is a hard-block domain → go straight to system browser
//  - If the popup is an OAuth intermediary (auth.openai.com etc.) and it tries to
//    navigate to a hard-block domain (server-side 302 to Google) → open the ORIGINAL
//    popup URL in system browser so the full OAuth round-trip completes there
let authWin: BrowserWindow | null = null

// Domains that act as OAuth intermediaries — when these try to redirect to Google/MS,
// we open the intermediary's original URL in the system browser instead
const OAUTH_INTERMEDIARY_DOMAINS = [
  'auth.openai.com', 'auth0.com', 'login.perplexity.ai',
  'clerk.claude.ai', 'auth.anthropic.com',
]

function openAuthWindow(url: string): void {
  if (authWin && !authWin.isDestroyed()) { authWin.loadURL(url); authWin.focus(); return }

  authWin = new BrowserWindow({
    width: 520, height: 720,
    resizable: true, autoHideMenuBar: true, title: 'Sign in',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, sandbox: false,
      preload: path.join(__dirname, 'electron', 'auth-preload.js'),
      partition: 'persist:ai-browser',
    },
  })

  authWin.webContents.setUserAgent(CLEAN_UA)
  authPopupWcId = authWin.webContents.id

  // Remember the original URL so we can open it in the system browser if needed
  const originalUrl = url
  authWin.loadURL(url)

  let authDone = false
  let finishTimer: ReturnType<typeof setTimeout> | null = null

  function finishAuth(): void {
    if (authDone) return
    authDone = true
    if (finishTimer) { clearTimeout(finishTimer); finishTimer = null }
    if (authWin && !authWin.isDestroyed()) authWin.close()
    mainWindow?.webContents.send('auth-complete')
    ipcMain.emit('_auth-done-internal')
  }

  function getProvider(u: string): string {
    if (u.includes('google')) return 'Google'
    if (u.includes('microsoft') || u.includes('live.com')) return 'Microsoft'
    if (u.includes('apple')) return 'Apple'
    if (u.includes('openai') || u.includes('chatgpt')) return 'ChatGPT'
    return 'your account'
  }

  // When a hard-block domain is detected mid-flow, open the ORIGINAL auth URL
  // in the system browser so the full OAuth round-trip (state/nonce) completes there.
  function handOffEntireFlowToSystemBrowser(hardBlockUrl: string): void {
    const provider = getProvider(hardBlockUrl)
    const urlForBrowser = originalUrl  // use the origin, not the mid-redirect Google URL
    console.log('[main] OAuth intermediary redirecting to hard-block — sending entire flow to system browser:', urlForBrowser)
    if (authWin && !authWin.isDestroyed()) authWin.close()
    ensureCallbackServer()
    void shell.openExternal(urlForBrowser)
    openWaitingWindow(provider, urlForBrowser)
  }

  const AUTH_STAY_DOMAINS = [
    'login.microsoftonline.com', 'login.microsoft.com', 'login.live.com',
    'account.live.com', 'account.microsoft.com',
    'appleid.apple.com', 'account.apple.com', 'idmsa.apple.com', 'gsa.apple.com',
  ]

  // ── will-navigate: fires BEFORE the page loads (client-side navs + some redirects)
  authWin.webContents.on('will-navigate', (e, navUrl) => {
    if (isHardBlock(navUrl)) {
      e.preventDefault()
      handOffEntireFlowToSystemBrowser(navUrl)
      return
    }
    try {
      const h = new URL(navUrl).hostname
      const onAuthPage = AUTH_STAY_DOMAINS.some(d => h === d || h.endsWith('.' + d))
      if (onAuthPage) { if (finishTimer) { clearTimeout(finishTimer); finishTimer = null } }
      else if (!finishTimer) finishTimer = setTimeout(() => finishAuth(), 2000)
    } catch {}
  })

  // ── did-navigate: fires after load (catches server-side redirects that land)
  authWin.webContents.on('did-navigate', (_e, navUrl) => {
    if (isHardBlock(navUrl)) { handOffEntireFlowToSystemBrowser(navUrl); return }
    try {
      const h = new URL(navUrl).hostname
      const onAuthPage = AUTH_STAY_DOMAINS.some(d => h === d || h.endsWith('.' + d))
      if (onAuthPage) { if (finishTimer) { clearTimeout(finishTimer); finishTimer = null }; return }
      if (!finishTimer) finishTimer = setTimeout(() => finishAuth(), 2000)
    } catch {}
  })

  authWin.webContents.setWindowOpenHandler(({ url: wUrl }) => {
    if (isHardBlock(wUrl)) { handOffEntireFlowToSystemBrowser(wUrl); return { action: 'deny' } }
    void shell.openExternal(wUrl)
    return { action: 'deny' }
  })

  // Microsoft passkey screen: stub WebAuthn after each page load
  authWin.webContents.on('did-stop-loading', () => {
    const u = authWin?.webContents.getURL() ?? ''
    if (!u.includes('microsoft') && !u.includes('live.com')) return
    authWin?.webContents.executeJavaScript(`
      try{Object.defineProperty(window,'PublicKeyCredential',{get:()=>undefined,configurable:true})}catch(_){}
      try{Object.defineProperty(navigator,'credentials',{value:{
        get:()=>Promise.reject(new DOMException('NotAllowed','NotAllowedError')),
        create:()=>Promise.reject(new DOMException('NotAllowed','NotAllowedError')),
        store:c=>Promise.resolve(c),preventSilentAccess:()=>Promise.resolve()},configurable:true})}catch(_){}
      const kw=/sign.?in.another.way|use.a.password|other.ways/i;
      const el=[...document.querySelectorAll('a,button')].find(e=>kw.test(e.textContent||'')&&e.offsetParent!==null);
      if(el)el.click();
    `).catch(() => {})
  })

  authWin.on('closed', () => {
    authWin = null; authPopupWcId = null
    if (finishTimer) { clearTimeout(finishTimer); finishTimer = null }
    if (!authDone) { authDone = true; mainWindow?.webContents.send('auth-complete') }
  })
}

// ── Hard-block debounce — prevents the interceptor firing in a tight loop ──
// Microsoft/Google auth flows make multiple requests to the same domain in
// rapid succession. Without this, shell.openExternal fires 6+ times and
// multiple waiting windows stack up.
const _hardBlockLastSent = new Map<string, number>()
const HARD_BLOCK_DEBOUNCE_MS = 4000

function shouldHandleHardBlock(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    const last = _hardBlockLastSent.get(hostname) ?? 0
    if (Date.now() - last < HARD_BLOCK_DEBOUNCE_MS) return false
    _hardBlockLastSent.set(hostname, Date.now())
    return true
  } catch { return false }
}

// ── Main popup router ──────────────────────────────────────────────────────
// Called for every new-window event from webviews and IPC open-auth-popup.
function handlePopup(url: string): void {
  if (isHardBlock(url)) {
    // Hard-blocked by Google/MS/Apple — must use system browser
    // Debounce: skip if we already sent this hostname to the system browser recently
    if (!shouldHandleHardBlock(url)) {
      console.log('[main] Hard-block debounced (already sent):', new URL(url).hostname)
      return
    }
    let provider = 'your account'
    if (url.includes('google')) provider = 'Google'
    else if (url.includes('microsoft') || url.includes('live.com')) provider = 'Microsoft'
    else if (url.includes('apple')) provider = 'Apple'
    console.log('[main] Routing to system browser →', provider, new URL(url).hostname)
    // Close the in-app auth window if it was open (e.g. mid-flow redirect from ChatGPT → Google)
    if (authWin && !authWin.isDestroyed()) { authWin.close() }
    ensureCallbackServer()
    void shell.openExternal(url)
    openWaitingWindow(provider, url)
  } else {
    // Everything else (ChatGPT auth, Perplexity, etc.) → in-app with same partition
    openAuthWindow(url)
  }
}

// ── Cookie sync (auth-popup → ai-browser, legacy — kept for safety) ────────
async function syncAuthCookies(): Promise<void> {
  const { session: electronSession } = await import('electron')
  const from = electronSession.fromPartition('persist:auth-popup')
  const to   = electronSession.fromPartition('persist:ai-browser')
  try {
    const cookies = await from.cookies.get({})
    await Promise.all(cookies.map(c => to.cookies.set({
      url: `http${c.secure?'s':''}://${c.domain?.replace(/^\./,'')}`,
      name: c.name, value: c.value, domain: c.domain, path: c.path,
      secure: c.secure, httpOnly: c.httpOnly, expirationDate: c.expirationDate,
    }).catch(() => {})))
  } catch (e) { console.error('[main] Cookie sync failed:', e) }
}

// ── IPC: renderer → terminal logging ──────────────────────────────────────
// Renderer console.log goes to DevTools, NOT the terminal.
// window.api.log(...) sends here so you always see output in npm run dev.
ipcMain.on('renderer-log', (_event, args: unknown[]) => {
  console.log('[renderer]', ...args)
})

// ── IPC: native PNG batch save ─────────────────────────────────────────────
ipcMain.handle('save-png-batch', async (_event: IpcMainInvokeEvent, { files }: SavePngBatchRequest): Promise<SavePngBatchResult> => {
  if (!files?.length || !mainWindow) return { canceled: true }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: `Choose folder to save ${files.length} file${files.length !== 1 ? 's' : ''}`,
    properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Save Here',
  })
  if (result.canceled || !result.filePaths[0]) return { canceled: true }
  const folder = result.filePaths[0]
  const saved: string[] = []
  for (const { filename, base64 } of files) {
    try { const p = path.join(folder, filename); fs.writeFileSync(p, Buffer.from(base64,'base64')); saved.push(p) }
    catch (e) { console.error('[save-png-batch]', e) }
  }
  void shell.openPath(folder)
  return { canceled: false, folder, count: saved.length, paths: saved }
})

// ── IPC: session save / load ───────────────────────────────────────────────
ipcMain.on('session-save', (_event, data: SessionData): void => {
  fs.writeFile(path.join(app.getPath('userData'), 'last-session.json'), JSON.stringify(data), () => {})
})
ipcMain.handle('session-load', (): SessionData | null => {
  try {
    const raw = fs.readFileSync(path.join(app.getPath('userData'), 'last-session.json'), 'utf8')
    const p = JSON.parse(raw) as SessionData
    return p.version === '1.0' && Array.isArray(p.pages) ? p : null
  } catch { return null }
})

// ── IPC: browser image download ─────────────────────────────────────────────
ipcMain.handle('browser-download-image', async (_event: IpcMainInvokeEvent, { url: imageUrl, postId }: { url: string; postId: string }): Promise<{ tmpPath: string; success: boolean; sizeKb: number }> => {
  console.log(`[browser-download] FULL URL to download: ${imageUrl}`)
  const os     = await import('os')
  const { session: electronSession } = await import('electron')
  const tmpDir = path.join(os.default.tmpdir(), 'elite_images')
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
  const ext = (['png','jpg','jpeg','webp','gif'].find(e => imageUrl.split('?')[0].toLowerCase().endsWith('.'+e))) ?? 'png'
  const tmpPath = path.join(tmpDir, `post_${postId}_${Date.now()}.${ext}`)

  // Use the ai-browser session's fetch() so all cookies (ChatGPT/oaiusercontent auth)
  // are included automatically — this is why plain https.get() was failing.
  const aiSession = electronSession.fromPartition('persist:ai-browser')

  // Network interceptor only fires this handler when CDN response >= 300KB,
  // so the URL we receive here IS the full-res image. Download once, no retry loop.
  try {
    const resp = await aiSession.fetch(imageUrl, {
      headers: { 'User-Agent': CLEAN_UA, 'Referer': 'https://chatgpt.com/' },
    })
    if (!resp.ok) {
      console.error(`[browser-download] HTTP ${resp.status} for ${imageUrl.slice(0, 80)}`)
      return { tmpPath: '', success: false, sizeKb: 0 }
    }
    const buf    = Buffer.from(await resp.arrayBuffer())
    const sizeKb = Math.round(buf.length / 1024)
    console.log(`[browser-download] saved ${sizeKb}KB → ${path.basename(tmpPath)}`)
    fs.writeFileSync(tmpPath, buf)
    return { tmpPath, success: true, sizeKb }
  } catch (e) {
    console.error(`[browser-download] fetch error:`, e)
    return { tmpPath: '', success: false, sizeKb: 0 }
  }
})

// ── IPC: image generation pipeline ────────────────────────────────────────

ipcMain.handle('image-gen:start', (_event: IpcMainInvokeEvent, req: StartImageGenRequest): StartImageGenResult => {
  if (isBusy()) return { accepted: 0, rejected: req.jobs.length }

  startQueue(req.jobs, (progress: ImageGenProgress) => {
    mainWindow?.webContents.send('image-gen:progress', progress)
  })

  return { accepted: req.jobs.length, rejected: 0 }
})

ipcMain.handle('image-gen:cancel', () => {
  cancelQueue()
})

ipcMain.handle('image-gen:get-config', () => {
  return readImageGenConfig()
})

ipcMain.handle('image-gen:set-url', (_event: IpcMainInvokeEvent, chatGptUrl: string) => {
  writeImageGenConfig({ chatGptUrl })
})

// ── IPC: system fonts ────────────────────────────────────────────────────────
let cachedSystemFonts: string[] | null = null

ipcMain.handle('get-system-fonts', async (): Promise<string[]> => {
  if (cachedSystemFonts) return cachedSystemFonts
  try {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileAsync = promisify(execFile)
    const platform = process.platform
    let fonts: string[] = []

    if (platform === 'darwin') {
      // macOS: scan font dirs and extract family names from filenames (fast, no system_profiler timeout)
      const fontDirs = [
        '/System/Library/Fonts',
        '/Library/Fonts',
        `${process.env.HOME}/Library/Fonts`,
      ]
      const { readdir } = await import('fs/promises')
      for (const dir of fontDirs) {
        try {
          const files = await readdir(dir)
          for (const f of files) {
            if (/\.(ttf|otf|ttc)$/i.test(f)) {
              fonts.push(f.replace(/\.(ttf|otf|ttc)$/i, '').replace(/[-_]/g, ' '))
            }
          }
        } catch { /* dir may not exist */ }
      }
    } else if (platform === 'linux') {
      const { stdout } = await execFileAsync('fc-list', [':', 'family'], { timeout: 10000 })
      fonts = stdout.split('\n').map((f: string) => f.split(',')[0].trim()).filter(Boolean)
    }

    // Deduplicate and sort
    cachedSystemFonts = [...new Set(fonts)].sort()
    return cachedSystemFonts
  } catch (err) {
    console.warn('[main] Failed to list system fonts:', err)
    return []
  }
})

// ── Local image reader — converts a local file path to a base64 data URL ──
// Required because the renderer loads from http://localhost:5173 in dev mode,
// which blocks direct file:// access via same-origin policy.
ipcMain.handle('read-local-image', (_event: IpcMainInvokeEvent, filePath: string): string | null => {
  try {
    const data = fs.readFileSync(filePath)
    const ext  = path.extname(filePath).toLowerCase().slice(1)
    const mime = ext === 'webp' ? 'image/webp'
               : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
               : 'image/png'
    return `data:${mime};base64,${data.toString('base64')}`
  } catch {
    return null
  }
})

// ── App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  void startBackend()
  createWindow()
  // Wait for backend in the background; notify renderer when it's up
  waitForBackend(45_000).then(() => notifyBackendStatus('up'))
  ensureCallbackServer()

  const { session: electronSession } = await import('electron')
  const aiSession = electronSession.fromPartition('persist:ai-browser')

  aiSession.setUserAgent(CLEAN_UA)
  aiSession.setPreloads([path.join(__dirname, 'src', 'pages', 'browser', 'automation', 'webview-preload.js')])

  aiSession.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
    const headers = { ...details.requestHeaders }
    headers['User-Agent'] = CLEAN_UA
    delete headers['X-Electron']
    callback({ requestHeaders: headers })
  })

  // ── CDN image network interception — DISABLED ──────────────────────────
  // Old approach: intercept oaiusercontent/estuary CDN responses by size threshold.
  // Problem: content-length headers unreliable, estuary serves octet-stream not image/*,
  // and 300KB threshold still lets blurry chunks through on slow CDNs.
  // Replaced by: will-download interception (see below) + hover-click Strategy B.
  //
  // aiSession.webRequest.onCompleted(
  //   { urls: [
  //     'https://*.oaiusercontent.com/*',
  //     'https://files.oaiusercontent.com/*',
  //     'https://chatgpt.com/backend-api/estuary/*',
  //   ]},
  //   (details) => {
  //     if (details.statusCode !== 200) return
  //     const ct = (details.responseHeaders?.['content-type'] ?? details.responseHeaders?.['Content-Type'] ?? [''])[0] || ''
  //     const isImage   = ct.startsWith('image/')
  //     const isEstuary = details.url.includes('estuary')
  //     const isBinary  = ct.includes('octet-stream')
  //     if (!isImage && !isEstuary && !isBinary) return
  //     const cl = parseInt((details.responseHeaders?.['content-length'] ?? details.responseHeaders?.['Content-Length'] ?? ['0'])[0] || '0')
  //     if (cl > 0 && cl < 300_000) return
  //     console.log(`[cdn-intercept] full-res captured: ${details.url.slice(0, 80)} (${Math.round(cl / 1024)}KB)`)
  //     mainWindow?.webContents.send('cdn-image-captured', { url: details.url, sizeBytes: cl })
  //   }
  // )

  // ── Strategy A: will-download interception ─────────────────────────────
  // When ChatGPT's download button is clicked (real user OR programmatic hover+click),
  // Electron fires will-download BEFORE the save dialog. We intercept it here:
  //   1. Set a deterministic tmp path so we control where the file lands
  //   2. Notify the renderer with the final path once download completes
  // This is 100% reliable — ChatGPT only triggers the download when the full-res
  // file is ready. No URL scraping, no size guessing, no CDN timing games.
  const tmpDownloadDir = path.join(require('os').tmpdir(), 'elite_images')
  if (!fs.existsSync(tmpDownloadDir)) fs.mkdirSync(tmpDownloadDir, { recursive: true })

  aiSession.on('will-download', (_event, item) => {
    const ext      = path.extname(item.getFilename()) || '.png'
    const tmpPath  = path.join(tmpDownloadDir, `will_dl_${Date.now()}${ext}`)
    item.setSavePath(tmpPath)
    console.log(`[will-download] intercepted → ${path.basename(tmpPath)} (${Math.round(item.getTotalBytes() / 1024)}KB)`)

    item.on('updated', (_e, state) => {
      if (state === 'interrupted') console.log('[will-download] interrupted')
    })
    item.once('done', (_e, state) => {
      if (state === 'completed') {
        const sizeKb = Math.round(fs.statSync(tmpPath).size / 1024)
        console.log(`[will-download] done — ${sizeKb}KB → ${path.basename(tmpPath)}`)
        mainWindow?.webContents.send('image-download-ready', { tmpPath, sizeKb })
      } else {
        console.log(`[will-download] failed — state: ${state}`)
        mainWindow?.webContents.send('image-download-ready', { tmpPath: null, sizeKb: 0 })
      }
    })
  })

  // Intercept ALL mainFrame navigations to hard-blocked auth domains.
  //
  // This covers BOTH webviews AND the in-app auth popup window.
  // Why include the auth popup? Because server-side 302 redirects (e.g.
  // auth.openai.com → accounts.google.com) bypass will-navigate entirely —
  // they only come through onBeforeRequest. So we must intercept them here
  // and hand off to the system browser.
  //
  // The auth popup's will-navigate handles client-side navigations (JS redirects,
  // link clicks). This handler catches server-side redirects.
  aiSession.webRequest.onBeforeRequest(
    { urls: [
      '*://accounts.google.com/*', '*://signin.google.com/*',
      '*://login.microsoft.com/*', '*://login.microsoftonline.com/*', '*://login.live.com/*',
      '*://appleid.apple.com/*', '*://idmsa.apple.com/*',
    ]},
    (details, callback) => {
      if (details.resourceType !== 'mainFrame') { callback({}); return }
      console.log('[main] Intercepting hard-block auth nav →', new URL(details.url).hostname)
      // Always cancel and route to system browser — covers webviews AND the
      // in-app popup (which gets here via server-side redirects that bypass will-navigate)
      handlePopup(details.url)
      callback({ cancel: true })
    }
  )
})

// ══════════════════════════════════════════════════════════════════════════════
// PKCE OAuth — system browser + localhost callback on port 9876
// ══════════════════════════════════════════════════════════════════════════════
// This is separate from the AI-browser popup auth above.
// Flow:
//   1. Renderer calls auth:start → main fetches auth URL from Python backend
//   2. main opens URL in system browser via shell.openExternal
//   3. Google redirects to http://127.0.0.1:9876/auth/callback?code=…&state=…
//   4. pkceCallbackServer forwards code+state to Python backend /api/auth/callback
//   5. Python exchanges code → tokens → profile → issues our session token
//   6. main sends auth:complete event to renderer with { session_token, user }

const PKCE_CALLBACK_PORT = 9876
let pkceCallbackServer: http.Server | null = null
let _pendingProvider: string | null = null

function startPkceCallbackServer(provider: string): void {
  if (pkceCallbackServer) { try { pkceCallbackServer.close() } catch {} }
  _pendingProvider = provider

  pkceCallbackServer = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url ?? '', true)
    if (!parsed.pathname?.startsWith('/auth/callback')) { res.end(); return }

    const { code, state, error } = parsed.query as Record<string, string>

    // Respond to browser immediately
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${error ? 'Sign-in failed' : 'Signed in'}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;
background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh}
.card{text-align:center;padding:40px;border:1px solid #1e1e1e;border-radius:16px}
h2{font-size:20px;margin-bottom:8px}p{color:#666;font-size:13px}</style>
</head><body><div class="card">
<h2>${error ? '✗ Sign-in failed' : '✓ Signed in'}</h2>
<p>${error ? 'You can close this tab.' : 'You can close this tab and return to the app.'}</p>
</div></body></html>`)

    pkceCallbackServer?.close(); pkceCallbackServer = null

    if (error) {
      mainWindow?.webContents.send('auth:complete', { ok: false, error: `Provider error: ${error}` })
      _pendingProvider = null; return
    }
    if (!code || !state) {
      mainWindow?.webContents.send('auth:complete', { ok: false, error: 'Missing code or state in redirect.' })
      _pendingProvider = null; return
    }

    // Forward to Python backend for token exchange
    const body = JSON.stringify({ provider: _pendingProvider, code, state })
    _pendingProvider = null

    const backendReq = http.request(
      { hostname: '127.0.0.1', port: 8000, path: '/api/auth/callback', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (backendRes) => {
        let data = ''
        backendRes.on('data', (chunk: Buffer) => { data += chunk.toString() })
        backendRes.on('end', () => {
          if (backendRes.statusCode === 200) {
            try {
              const result = JSON.parse(data)
              mainWindow?.show(); mainWindow?.focus()
              mainWindow?.webContents.send('auth:complete', { ok: true, ...result })
            } catch {
              mainWindow?.webContents.send('auth:complete', { ok: false, error: 'Bad response from backend.' })
            }
          } else {
            mainWindow?.webContents.send('auth:complete', { ok: false, error: `Backend error: ${data.slice(0, 200)}` })
          }
        })
      }
    )
    backendReq.on('error', (err) => {
      mainWindow?.webContents.send('auth:complete', { ok: false, error: err.message })
    })
    backendReq.write(body); backendReq.end()
  })

  pkceCallbackServer.listen(PKCE_CALLBACK_PORT, '127.0.0.1', () => {
    console.log(`[auth] PKCE callback server on http://127.0.0.1:${PKCE_CALLBACK_PORT}`)
  })
  pkceCallbackServer.on('error', (err) => {
    console.error('[auth] PKCE callback server error:', err)
    mainWindow?.webContents.send('auth:complete', { ok: false, error: `Callback server error: ${err.message}` })
    pkceCallbackServer = null
  })
}

// IPC: auth:start — get auth URL from backend, open system browser
ipcMain.handle('auth:start', async (_event: IpcMainInvokeEvent, req: { provider: string }) => {
  const { provider } = req
  try {
    const result = await new Promise<{ url: string; state: string }>((resolve, reject) => {
      http.get(`http://127.0.0.1:8000/api/auth/url?provider=${provider}`, (res) => {
        let data = ''; res.on('data', (c: Buffer) => { data += c.toString() })
        res.on('end', () => { try { resolve(JSON.parse(data)) } catch { reject(new Error(data)) } })
      }).on('error', reject)
    })
    startPkceCallbackServer(provider)
    await shell.openExternal(result.url)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
})

// IPC: auth:validate — check stored session token with backend
ipcMain.handle('auth:validate', async (_event: IpcMainInvokeEvent, token: string) => {
  return new Promise((resolve) => {
    http.request(
      { hostname: '127.0.0.1', port: 8000, path: '/api/auth/me', method: 'GET',
        headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        let data = ''; res.on('data', (c: Buffer) => { data += c.toString() })
        res.on('end', () => {
          if (res.statusCode === 200) { try { resolve({ ok: true, user: JSON.parse(data) }) } catch { resolve({ ok: false }) } }
          else { resolve({ ok: false }) }
        })
      }
    ).on('error', () => resolve({ ok: false })).end()
  })
})

// IPC: auth:logout — invalidate session token on backend
ipcMain.handle('auth:logout', async (_event: IpcMainInvokeEvent, token: string) => {
  return new Promise((resolve) => {
    const body = JSON.stringify({ token })
    const req = http.request(
      { hostname: '127.0.0.1', port: 8000, path: '/api/auth/logout', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { res.resume(); resolve({ ok: res.statusCode === 200 }) }
    )
    req.on('error', () => resolve({ ok: false }))
    req.write(body); req.end()
  })
})

// ══════════════════════════════════════════════════════════════════════════════

app.on('window-all-closed', () => {
  backendProcess?.kill()
  callbackServer?.close()
  pkceCallbackServer?.close()
  destroyChatWindow()
  if (process.platform !== 'darwin') app.quit()
})
