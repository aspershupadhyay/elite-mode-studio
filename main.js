"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const url_1 = __importDefault(require("url"));
const fs_1 = __importDefault(require("fs"));
const net_1 = __importDefault(require("net"));
const queue_manager_1 = require("./src/pages/browser/automation/queue-manager");
const browser_controller_1 = require("./src/pages/browser/automation/browser-controller");
const imageGenConfig_1 = require("./src/pages/browser/automation/imageGenConfig");
const isDev = !electron_1.app.isPackaged;
const CLEAN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
electron_1.app.userAgentFallback = CLEAN_UA;
// Disable FIDO/caBLE discovery — eliminates the "Cannot start caBLE / not
// self-responsible" macOS security log spam when running from terminal.
electron_1.app.commandLine.appendSwitch('disable-features', 'WebAuthentication');
// Silence benign navigation noise ─────────────────────────────────────────
// ERR_ABORTED (-3)       : webview redirect chains (chatgpt.com etc.) — harmless
// GUEST_VIEW_MANAGER_CALL: same aborted nav surfaced via internal Electron handler
// FIDO / caBLE errors    : suppressed via --disable-features=WebAuthentication above
function isNoisyError(msg) {
    return (msg.includes('ERR_ABORTED') ||
        msg.includes('errno: -3') ||
        msg.includes('GUEST_VIEW_MANAGER_CALL') ||
        msg.includes('ERR_INVALID_URL') ||
        msg.includes('net::ERR_'));
}
process.on('unhandledRejection', (reason) => {
    if (isNoisyError(String(reason)))
        return;
    console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
    if (isNoisyError(err.message))
        return;
    console.error('[uncaughtException]', err);
});
let mainWindow = null;
let backendProcess = null;
let authPopupWcId = null; // kept for legacy reference, no longer used in interceptor
function isPortInUse(port) {
    return new Promise((resolve) => {
        const tester = net_1.default.createServer();
        tester.once('error', () => resolve(true));
        tester.once('listening', () => { tester.close(); resolve(false); });
        tester.listen(port, '127.0.0.1');
    });
}
let backendRestarts = 0;
const MAX_BACKEND_RESTARTS = 3;
const backendLogPath = path_1.default.join(electron_1.app.getPath('userData'), 'backend.log');
function notifyBackendStatus(status) {
    mainWindow?.webContents.send('backend:status', status);
}
async function startBackend() {
    const inUse = await isPortInUse(8000);
    if (inUse) {
        console.log('[main] Port 8000 in use — reusing');
        return;
    }
    let spawnArgs;
    if (isDev) {
        const backendPath = path_1.default.join(__dirname, 'backend');
        spawnArgs = {
            cmd: 'python3',
            args: ['-m', 'uvicorn', 'api:app', '--host', '127.0.0.1', '--port', '8000'],
            opts: { cwd: backendPath, stdio: 'pipe' },
        };
    }
    else {
        const binaryName = process.platform === 'win32' ? 'api_server.exe' : 'api_server';
        const binaryPath = path_1.default.join(process.resourcesPath, 'api_server', binaryName);
        if (!fs_1.default.existsSync(binaryPath)) {
            const msg = `[backend] Binary not found: ${binaryPath}\n`;
            fs_1.default.appendFileSync(backendLogPath, msg);
            console.error(msg);
            notifyBackendStatus('crashed');
            return;
        }
        // Ensure executable bit (may be lost during packaging on macOS/Linux)
        if (process.platform !== 'win32') {
            try {
                fs_1.default.chmodSync(binaryPath, 0o755);
            }
            catch { /* ignore */ }
        }
        spawnArgs = {
            cmd: binaryPath,
            args: ['--host', '127.0.0.1', '--port', '8000'],
            opts: { stdio: 'pipe' },
        };
    }
    notifyBackendStatus('starting');
    backendProcess = (0, child_process_1.spawn)(spawnArgs.cmd, spawnArgs.args, spawnArgs.opts);
    backendProcess.stdout?.on('data', (d) => {
        const line = d.toString();
        console.log('[backend]', line);
        fs_1.default.appendFileSync(backendLogPath, line);
    });
    backendProcess.stderr?.on('data', (d) => {
        const line = d.toString();
        console.error('[backend]', line);
        fs_1.default.appendFileSync(backendLogPath, line);
    });
    backendProcess.on('exit', (code) => {
        console.log(`[backend] exited with code ${code}`);
        fs_1.default.appendFileSync(backendLogPath, `[exit] code=${code}\n`);
        if (code !== 0 && backendRestarts < MAX_BACKEND_RESTARTS) {
            backendRestarts++;
            console.log(`[backend] restarting (attempt ${backendRestarts}/${MAX_BACKEND_RESTARTS})…`);
            fs_1.default.appendFileSync(backendLogPath, `[restart] attempt ${backendRestarts}\n`);
            setTimeout(() => void startBackend(), 2000);
        }
        else if (code !== 0) {
            notifyBackendStatus('crashed');
        }
    });
}
function waitForBackend(timeoutMs = 45000) {
    return new Promise((resolve) => {
        const start = Date.now();
        function attempt() {
            const req = http_1.default.get('http://127.0.0.1:8000/api/health', (res) => { res.resume(); resolve(); });
            req.on('error', () => {
                if (Date.now() - start >= timeoutMs) {
                    resolve();
                }
                else
                    setTimeout(attempt, 200);
            });
            req.setTimeout(300, () => req.destroy());
        }
        attempt();
    });
}
function buildAppMenu() {
    const isMac = process.platform === 'darwin';
    const template = [
        ...(isMac ? [{ label: electron_1.app.name, submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    { role: 'services' },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideOthers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' },
                ] }] : []),
        { label: 'Edit', submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
            ] },
        { label: 'View', submenu: [
                // Override CmdOrCtrl+R so it reloads the active browser tab, not the Electron window
                { label: 'Reload Tab', accelerator: 'CmdOrCtrl+R',
                    click: () => { mainWindow?.webContents.send('browser:reload'); } },
                { type: 'separator' },
                { role: 'toggleDevTools' },
                { role: 'togglefullscreen' },
            ] },
        { label: 'Window', submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [
                    { type: 'separator' },
                    { role: 'front' },
                ] : [{ role: 'close' }]),
            ] },
    ];
    electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate(template));
}
function createWindow() {
    buildAppMenu();
    mainWindow = new electron_1.BrowserWindow({
        width: 1440, height: 900, minWidth: 1100, minHeight: 700,
        titleBarStyle: 'hiddenInset', backgroundColor: '#0A0A0A',
        webPreferences: {
            nodeIntegration: false, contextIsolation: true,
            webSecurity: true, webviewTag: true,
            preload: path_1.default.join(__dirname, 'preload.js'),
        },
    });
    if (isDev)
        void mainWindow.loadURL('http://localhost:5173');
    else
        void mainWindow.loadFile(path_1.default.join(__dirname, 'dist', 'index.html'));
    // Re-send backend status once the renderer is ready — prevents the race where
    // 'backend:status: up' fires before React has mounted its IPC listener.
    mainWindow.webContents.once('did-finish-load', () => {
        waitForBackend(10000)
            .then(() => notifyBackendStatus('up'))
            .catch(() => { });
    });
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // Webview new-window → route through our popup handler
    mainWindow.webContents.on('did-attach-webview', (_event, webviewContents) => {
        webviewContents.setWindowOpenHandler(({ url }) => {
            handlePopup(url);
            return { action: 'deny' };
        });
    });
}
// ── IPC ────────────────────────────────────────────────────────────────────
electron_1.ipcMain.handle('backend:restart', async () => {
    backendProcess?.kill();
    backendProcess = null;
    backendRestarts = 0;
    await startBackend();
    await waitForBackend(45000);
    notifyBackendStatus('up');
});
electron_1.ipcMain.handle('open-auth-popup', (_event, url) => { handlePopup(url); });
electron_1.ipcMain.handle('open-external', (_event, url) => electron_1.shell.openExternal(url));
// ── First-run setup ────────────────────────────────────────────────────────
electron_1.ipcMain.handle('setup:check', async () => {
    try {
        const body = await new Promise((resolve, reject) => {
            const req = http_1.default.get('http://127.0.0.1:8000/api/health', (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk.toString(); });
                res.on('end', () => resolve(data));
            });
            req.on('error', reject);
            req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
        });
        const json = JSON.parse(body);
        const missing = json.missing_keys ?? [];
        return { configured: missing.length === 0, missingKeys: missing };
    }
    catch {
        return { configured: false, missingKeys: ['NVIDIA_API_KEY', 'TAVILY_API_KEY'] };
    }
});
electron_1.ipcMain.handle('setup:save-config', (_event, req) => {
    try {
        const configDir = path_1.default.join(electron_1.app.getPath('userData'), 'backend');
        fs_1.default.mkdirSync(configDir, { recursive: true });
        const content = [
            `NVIDIA_API_KEY=${req.nvidiaKey.trim()}`,
            `TAVILY_API_KEY=${req.tavilyKey.trim()}`,
            '',
        ].join('\n');
        fs_1.default.writeFileSync(path_1.default.join(configDir, '.env'), content, 'utf8');
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
});
electron_1.ipcMain.handle('clear-browser-data', async () => {
    const { session: electronSession } = await Promise.resolve().then(() => __importStar(require('electron')));
    const ses = electronSession.fromPartition('persist:ai-browser');
    await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers'] });
    await ses.clearCache();
    console.log('[main] Browser data cleared (all)');
});
electron_1.ipcMain.handle('clear-site-data', async (_event, domain) => {
    const { session: electronSession } = await Promise.resolve().then(() => __importStar(require('electron')));
    const ses = electronSession.fromPartition('persist:ai-browser');
    // Clear cookies for this domain and its subdomains
    const cookies = await ses.cookies.get({});
    const toRemove = cookies.filter(c => {
        const cd = (c.domain ?? '').replace(/^\./, '');
        return cd === domain || cd.endsWith('.' + domain) || domain.endsWith('.' + cd);
    });
    await Promise.all(toRemove.map(c => {
        const url = `http${c.secure ? 's' : ''}://${(c.domain ?? '').replace(/^\./, '')}${c.path ?? '/'}`;
        return ses.cookies.remove(url, c.name).catch(() => { });
    }));
    // Clear storage for this origin
    try {
        await ses.clearStorageData({
            origin: `https://${domain}`,
            storages: ['localstorage', 'indexdb', 'cachestorage', 'serviceworkers'],
        });
    }
    catch { }
    console.log(`[main] Site data cleared: ${domain} (${toRemove.length} cookies)`);
    return { removed: toRemove.length };
});
electron_1.ipcMain.handle('browser:context-menu', (_event, params) => {
    const { clipboard } = require('electron');
    const template = [];
    if (params.linkUrl) {
        template.push({ label: 'Open Link in New Tab', click: () => { mainWindow?.webContents.send('browser:open-new-tab', params.linkUrl); } });
        template.push({ label: 'Copy Link Address', click: () => { clipboard.writeText(params.linkUrl); } });
    }
    if (params.srcUrl) {
        template.push({ label: 'Copy Image', click: async () => {
                try {
                    const { net, nativeImage, clipboard: cb } = require('electron');
                    const res = await net.fetch(params.srcUrl);
                    const buf = Buffer.from(await res.arrayBuffer());
                    const img = nativeImage.createFromBuffer(buf);
                    if (!img.isEmpty())
                        cb.writeImage(img);
                }
                catch { }
            } });
        template.push({ label: 'Open Image in New Tab', click: () => { mainWindow?.webContents.send('browser:open-new-tab', params.srcUrl); } });
        template.push({ label: 'Copy Image Address', click: () => { clipboard.writeText(params.srcUrl); } });
    }
    if (template.length > 0)
        template.push({ type: 'separator' });
    if (params.selectionText) {
        template.push({ label: 'Copy', click: () => { clipboard.writeText(params.selectionText); } });
    }
    if (params.isEditable) {
        template.push({ label: 'Paste', click: () => { mainWindow?.webContents.send('browser:paste'); } });
    }
    template.push({ label: 'Reload Page', click: () => { mainWindow?.webContents.send('browser:reload'); } });
    template.push({ type: 'separator' });
    template.push({ label: 'Back', click: () => { mainWindow?.webContents.send('browser:go-back'); } });
    template.push({ label: 'Forward', click: () => { mainWindow?.webContents.send('browser:go-forward'); } });
    const menu = electron_1.Menu.buildFromTemplate(template);
    menu.popup({ window: mainWindow });
});
// ── Loopback callback server ───────────────────────────────────────────────
// Listens on 127.0.0.1:27123 — system browser hits /auth-done after login
const CALLBACK_PORT = 27123;
let callbackServer = null;
function ensureCallbackServer() {
    if (callbackServer)
        return;
    callbackServer = http_1.default.createServer((req, res) => {
        if (!req.url?.startsWith('/auth-done')) {
            res.end();
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Signed in</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;
background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;
height:100vh;text-align:center;padding:32px}.icon{font-size:52px;margin-bottom:16px}
h1{font-size:22px;font-weight:700;margin-bottom:8px}p{color:#888;font-size:14px;line-height:1.6}</style>
</head><body><div><div class="icon">✅</div>
<h1>You're signed in!</h1>
<p>You can close this tab and return to the app.<br>The app has been notified.</p>
</div></body></html>`);
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send('auth-complete');
        electron_1.ipcMain.emit('_auth-done-internal');
    });
    callbackServer.listen(CALLBACK_PORT, '127.0.0.1', () => console.log(`[main] Auth callback server on port ${CALLBACK_PORT}`));
    callbackServer.on('error', () => { callbackServer = null; });
}
// ── Waiting window (shown while user signs in via system browser) ──────────
let waitingWin = null;
function openWaitingWindow(provider, reopenUrl) {
    if (waitingWin && !waitingWin.isDestroyed()) {
        waitingWin.focus();
        return;
    }
    waitingWin = new electron_1.BrowserWindow({
        width: 460, height: 320,
        resizable: false, minimizable: false, maximizable: false,
        autoHideMenuBar: true, title: `Sign in — ${provider}`,
        backgroundColor: '#0a0a0a',
        webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    const safeUrl = reopenUrl.replace(/'/g, '%27');
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
</body></html>`;
    waitingWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const onDone = () => {
        if (!waitingWin || waitingWin.isDestroyed())
            return;
        waitingWin.webContents.executeJavaScript(`
      document.querySelector('.dot').style.animation='none';
      document.querySelector('.dot').style.background='#0bda76';
      document.querySelector('.status').children[0].innerHTML='✅ &nbsp;Signed in successfully!';
      document.querySelector('.status').children[1].style.color='#666';
      document.querySelector('.status').children[1].innerHTML='✅ &nbsp;Reloading browser tab…';
    `).catch(() => { });
        setTimeout(() => { if (waitingWin && !waitingWin.isDestroyed())
            waitingWin.close(); }, 2000);
    };
    electron_1.ipcMain.once('_auth-done-internal', onDone);
    waitingWin.on('closed', () => { waitingWin = null; electron_1.ipcMain.removeListener('_auth-done-internal', onDone); });
}
// ── Google/MS/Apple system-browser domains ─────────────────────────────────
const HARD_BLOCK_DOMAINS = [
    'accounts.google.com', 'signin.google.com',
    'login.microsoftonline.com', 'login.microsoft.com', 'login.live.com',
    'appleid.apple.com', 'idmsa.apple.com',
];
function isHardBlock(url) {
    try {
        const h = new URL(url).hostname;
        return HARD_BLOCK_DOMAINS.some(d => h === d || h.endsWith('.' + d));
    }
    catch {
        return false;
    }
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
let authWin = null;
// Domains that act as OAuth intermediaries — when these try to redirect to Google/MS,
// we open the intermediary's original URL in the system browser instead
const OAUTH_INTERMEDIARY_DOMAINS = [
    'auth.openai.com', 'auth0.com', 'login.perplexity.ai',
    'clerk.claude.ai', 'auth.anthropic.com',
];
function openAuthWindow(url) {
    if (authWin && !authWin.isDestroyed()) {
        authWin.loadURL(url);
        authWin.focus();
        return;
    }
    authWin = new electron_1.BrowserWindow({
        width: 520, height: 720,
        resizable: true, autoHideMenuBar: true, title: 'Sign in',
        webPreferences: {
            nodeIntegration: false, contextIsolation: true, sandbox: false,
            preload: path_1.default.join(__dirname, 'electron', 'auth-preload.js'),
            partition: 'persist:ai-browser',
        },
    });
    authWin.webContents.setUserAgent(CLEAN_UA);
    authPopupWcId = authWin.webContents.id;
    // Remember the original URL so we can open it in the system browser if needed
    const originalUrl = url;
    authWin.loadURL(url);
    let authDone = false;
    let finishTimer = null;
    function finishAuth() {
        if (authDone)
            return;
        authDone = true;
        if (finishTimer) {
            clearTimeout(finishTimer);
            finishTimer = null;
        }
        if (authWin && !authWin.isDestroyed())
            authWin.close();
        mainWindow?.webContents.send('auth-complete');
        electron_1.ipcMain.emit('_auth-done-internal');
    }
    function getProvider(u) {
        if (u.includes('google'))
            return 'Google';
        if (u.includes('microsoft') || u.includes('live.com'))
            return 'Microsoft';
        if (u.includes('apple'))
            return 'Apple';
        if (u.includes('openai') || u.includes('chatgpt'))
            return 'ChatGPT';
        return 'your account';
    }
    // When a hard-block domain is detected mid-flow, open the ORIGINAL auth URL
    // in the system browser so the full OAuth round-trip (state/nonce) completes there.
    function handOffEntireFlowToSystemBrowser(hardBlockUrl) {
        const provider = getProvider(hardBlockUrl);
        const urlForBrowser = originalUrl; // use the origin, not the mid-redirect Google URL
        console.log('[main] OAuth intermediary redirecting to hard-block — sending entire flow to system browser:', urlForBrowser);
        if (authWin && !authWin.isDestroyed())
            authWin.close();
        ensureCallbackServer();
        void electron_1.shell.openExternal(urlForBrowser);
        openWaitingWindow(provider, urlForBrowser);
    }
    const AUTH_STAY_DOMAINS = [
        'login.microsoftonline.com', 'login.microsoft.com', 'login.live.com',
        'account.live.com', 'account.microsoft.com',
        'appleid.apple.com', 'account.apple.com', 'idmsa.apple.com', 'gsa.apple.com',
    ];
    // ── will-navigate: fires BEFORE the page loads (client-side navs + some redirects)
    authWin.webContents.on('will-navigate', (e, navUrl) => {
        if (isHardBlock(navUrl)) {
            e.preventDefault();
            handOffEntireFlowToSystemBrowser(navUrl);
            return;
        }
        try {
            const h = new URL(navUrl).hostname;
            const onAuthPage = AUTH_STAY_DOMAINS.some(d => h === d || h.endsWith('.' + d));
            if (onAuthPage) {
                if (finishTimer) {
                    clearTimeout(finishTimer);
                    finishTimer = null;
                }
            }
            else if (!finishTimer)
                finishTimer = setTimeout(() => finishAuth(), 2000);
        }
        catch { }
    });
    // ── did-navigate: fires after load (catches server-side redirects that land)
    authWin.webContents.on('did-navigate', (_e, navUrl) => {
        if (isHardBlock(navUrl)) {
            handOffEntireFlowToSystemBrowser(navUrl);
            return;
        }
        try {
            const h = new URL(navUrl).hostname;
            const onAuthPage = AUTH_STAY_DOMAINS.some(d => h === d || h.endsWith('.' + d));
            if (onAuthPage) {
                if (finishTimer) {
                    clearTimeout(finishTimer);
                    finishTimer = null;
                }
                ;
                return;
            }
            if (!finishTimer)
                finishTimer = setTimeout(() => finishAuth(), 2000);
        }
        catch { }
    });
    authWin.webContents.setWindowOpenHandler(({ url: wUrl }) => {
        if (isHardBlock(wUrl)) {
            handOffEntireFlowToSystemBrowser(wUrl);
            return { action: 'deny' };
        }
        void electron_1.shell.openExternal(wUrl);
        return { action: 'deny' };
    });
    // Microsoft passkey screen: stub WebAuthn after each page load
    authWin.webContents.on('did-stop-loading', () => {
        const u = authWin?.webContents.getURL() ?? '';
        if (!u.includes('microsoft') && !u.includes('live.com'))
            return;
        authWin?.webContents.executeJavaScript(`
      try{Object.defineProperty(window,'PublicKeyCredential',{get:()=>undefined,configurable:true})}catch(_){}
      try{Object.defineProperty(navigator,'credentials',{value:{
        get:()=>Promise.reject(new DOMException('NotAllowed','NotAllowedError')),
        create:()=>Promise.reject(new DOMException('NotAllowed','NotAllowedError')),
        store:c=>Promise.resolve(c),preventSilentAccess:()=>Promise.resolve()},configurable:true})}catch(_){}
      const kw=/sign.?in.another.way|use.a.password|other.ways/i;
      const el=[...document.querySelectorAll('a,button')].find(e=>kw.test(e.textContent||'')&&e.offsetParent!==null);
      if(el)el.click();
    `).catch(() => { });
    });
    authWin.on('closed', () => {
        authWin = null;
        authPopupWcId = null;
        if (finishTimer) {
            clearTimeout(finishTimer);
            finishTimer = null;
        }
        if (!authDone) {
            authDone = true;
            mainWindow?.webContents.send('auth-complete');
        }
    });
}
// ── Hard-block debounce — prevents the interceptor firing in a tight loop ──
// Microsoft/Google auth flows make multiple requests to the same domain in
// rapid succession. Without this, shell.openExternal fires 6+ times and
// multiple waiting windows stack up.
const _hardBlockLastSent = new Map();
const HARD_BLOCK_DEBOUNCE_MS = 4000;
function shouldHandleHardBlock(url) {
    try {
        const hostname = new URL(url).hostname;
        const last = _hardBlockLastSent.get(hostname) ?? 0;
        if (Date.now() - last < HARD_BLOCK_DEBOUNCE_MS)
            return false;
        _hardBlockLastSent.set(hostname, Date.now());
        return true;
    }
    catch {
        return false;
    }
}
// ── Main popup router ──────────────────────────────────────────────────────
// Called for every new-window event from webviews and IPC open-auth-popup.
function handlePopup(url) {
    if (isHardBlock(url)) {
        // Hard-blocked by Google/MS/Apple — must use system browser
        // Debounce: skip if we already sent this hostname to the system browser recently
        if (!shouldHandleHardBlock(url)) {
            console.log('[main] Hard-block debounced (already sent):', new URL(url).hostname);
            return;
        }
        let provider = 'your account';
        if (url.includes('google'))
            provider = 'Google';
        else if (url.includes('microsoft') || url.includes('live.com'))
            provider = 'Microsoft';
        else if (url.includes('apple'))
            provider = 'Apple';
        console.log('[main] Routing to system browser →', provider, new URL(url).hostname);
        // Close the in-app auth window if it was open (e.g. mid-flow redirect from ChatGPT → Google)
        if (authWin && !authWin.isDestroyed()) {
            authWin.close();
        }
        ensureCallbackServer();
        void electron_1.shell.openExternal(url);
        openWaitingWindow(provider, url);
    }
    else {
        // Everything else (ChatGPT auth, Perplexity, etc.) → in-app with same partition
        openAuthWindow(url);
    }
}
// ── Cookie sync (auth-popup → ai-browser, legacy — kept for safety) ────────
async function syncAuthCookies() {
    const { session: electronSession } = await Promise.resolve().then(() => __importStar(require('electron')));
    const from = electronSession.fromPartition('persist:auth-popup');
    const to = electronSession.fromPartition('persist:ai-browser');
    try {
        const cookies = await from.cookies.get({});
        await Promise.all(cookies.map(c => to.cookies.set({
            url: `http${c.secure ? 's' : ''}://${c.domain?.replace(/^\./, '')}`,
            name: c.name, value: c.value, domain: c.domain, path: c.path,
            secure: c.secure, httpOnly: c.httpOnly, expirationDate: c.expirationDate,
        }).catch(() => { })));
    }
    catch (e) {
        console.error('[main] Cookie sync failed:', e);
    }
}
// ── IPC: renderer → terminal logging ──────────────────────────────────────
// Renderer console.log goes to DevTools, NOT the terminal.
// window.api.log(...) sends here so you always see output in npm run dev.
electron_1.ipcMain.on('renderer-log', (_event, args) => {
    console.log('[renderer]', ...args);
});
// ── IPC: native PNG batch save ─────────────────────────────────────────────
electron_1.ipcMain.handle('save-png-batch', async (_event, { files }) => {
    if (!files?.length || !mainWindow)
        return { canceled: true };
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        title: `Choose folder to save ${files.length} file${files.length !== 1 ? 's' : ''}`,
        properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Save Here',
    });
    if (result.canceled || !result.filePaths[0])
        return { canceled: true };
    const folder = result.filePaths[0];
    const saved = [];
    for (const { filename, base64 } of files) {
        try {
            const p = path_1.default.join(folder, filename);
            fs_1.default.writeFileSync(p, Buffer.from(base64, 'base64'));
            saved.push(p);
        }
        catch (e) {
            console.error('[save-png-batch]', e);
        }
    }
    void electron_1.shell.openPath(folder);
    return { canceled: false, folder, count: saved.length, paths: saved };
});
// ── IPC: session save / load ───────────────────────────────────────────────
electron_1.ipcMain.on('session-save', (_event, data) => {
    fs_1.default.writeFile(path_1.default.join(electron_1.app.getPath('userData'), 'last-session.json'), JSON.stringify(data), () => { });
});
electron_1.ipcMain.handle('session-load', () => {
    try {
        const raw = fs_1.default.readFileSync(path_1.default.join(electron_1.app.getPath('userData'), 'last-session.json'), 'utf8');
        const p = JSON.parse(raw);
        return p.version === '1.0' && Array.isArray(p.pages) ? p : null;
    }
    catch {
        return null;
    }
});
// ── IPC: browser image download ─────────────────────────────────────────────
electron_1.ipcMain.handle('browser-download-image', async (_event, { url: imageUrl, postId }) => {
    console.log(`[browser-download] FULL URL to download: ${imageUrl}`);
    const os = await Promise.resolve().then(() => __importStar(require('os')));
    const { session: electronSession } = await Promise.resolve().then(() => __importStar(require('electron')));
    const tmpDir = path_1.default.join(os.default.tmpdir(), 'elite_images');
    if (!fs_1.default.existsSync(tmpDir))
        fs_1.default.mkdirSync(tmpDir, { recursive: true });
    const ext = (['png', 'jpg', 'jpeg', 'webp', 'gif'].find(e => imageUrl.split('?')[0].toLowerCase().endsWith('.' + e))) ?? 'png';
    const tmpPath = path_1.default.join(tmpDir, `post_${postId}_${Date.now()}.${ext}`);
    // Use the ai-browser session's fetch() so all cookies (ChatGPT/oaiusercontent auth)
    // are included automatically — this is why plain https.get() was failing.
    const aiSession = electronSession.fromPartition('persist:ai-browser');
    // Network interceptor only fires this handler when CDN response >= 300KB,
    // so the URL we receive here IS the full-res image. Download once, no retry loop.
    try {
        const resp = await aiSession.fetch(imageUrl, {
            headers: { 'User-Agent': CLEAN_UA, 'Referer': 'https://chatgpt.com/' },
        });
        if (!resp.ok) {
            console.error(`[browser-download] HTTP ${resp.status} for ${imageUrl.slice(0, 80)}`);
            return { tmpPath: '', success: false, sizeKb: 0 };
        }
        const buf = Buffer.from(await resp.arrayBuffer());
        const sizeKb = Math.round(buf.length / 1024);
        console.log(`[browser-download] saved ${sizeKb}KB → ${path_1.default.basename(tmpPath)}`);
        fs_1.default.writeFileSync(tmpPath, buf);
        return { tmpPath, success: true, sizeKb };
    }
    catch (e) {
        console.error(`[browser-download] fetch error:`, e);
        return { tmpPath: '', success: false, sizeKb: 0 };
    }
});
// ── IPC: image generation pipeline ────────────────────────────────────────
electron_1.ipcMain.handle('image-gen:start', (_event, req) => {
    if ((0, queue_manager_1.isBusy)())
        return { accepted: 0, rejected: req.jobs.length };
    (0, queue_manager_1.startQueue)(req.jobs, (progress) => {
        mainWindow?.webContents.send('image-gen:progress', progress);
    });
    return { accepted: req.jobs.length, rejected: 0 };
});
electron_1.ipcMain.handle('image-gen:cancel', () => {
    (0, queue_manager_1.cancelQueue)();
});
electron_1.ipcMain.handle('image-gen:get-config', () => {
    return (0, imageGenConfig_1.readImageGenConfig)();
});
electron_1.ipcMain.handle('image-gen:set-url', (_event, chatGptUrl) => {
    (0, imageGenConfig_1.writeImageGenConfig)({ chatGptUrl });
});
// ── IPC: system fonts ────────────────────────────────────────────────────────
let cachedSystemFonts = null;
electron_1.ipcMain.handle('get-system-fonts', async () => {
    if (cachedSystemFonts)
        return cachedSystemFonts;
    try {
        const { execFile } = await Promise.resolve().then(() => __importStar(require('child_process')));
        const { promisify } = await Promise.resolve().then(() => __importStar(require('util')));
        const execFileAsync = promisify(execFile);
        const platform = process.platform;
        let fonts = [];
        if (platform === 'darwin') {
            // macOS: scan font dirs and extract family names from filenames (fast, no system_profiler timeout)
            const fontDirs = [
                '/System/Library/Fonts',
                '/Library/Fonts',
                `${process.env.HOME}/Library/Fonts`,
            ];
            const { readdir } = await Promise.resolve().then(() => __importStar(require('fs/promises')));
            for (const dir of fontDirs) {
                try {
                    const files = await readdir(dir);
                    for (const f of files) {
                        if (/\.(ttf|otf|ttc)$/i.test(f)) {
                            fonts.push(f.replace(/\.(ttf|otf|ttc)$/i, '').replace(/[-_]/g, ' '));
                        }
                    }
                }
                catch { /* dir may not exist */ }
            }
        }
        else if (platform === 'linux') {
            const { stdout } = await execFileAsync('fc-list', [':', 'family'], { timeout: 10000 });
            fonts = stdout.split('\n').map((f) => f.split(',')[0].trim()).filter(Boolean);
        }
        // Deduplicate and sort
        cachedSystemFonts = [...new Set(fonts)].sort();
        return cachedSystemFonts;
    }
    catch (err) {
        console.warn('[main] Failed to list system fonts:', err);
        return [];
    }
});
// ── Local image reader — converts a local file path to a base64 data URL ──
// Required because the renderer loads from http://localhost:5173 in dev mode,
// which blocks direct file:// access via same-origin policy.
electron_1.ipcMain.handle('read-local-image', (_event, filePath) => {
    try {
        const data = fs_1.default.readFileSync(filePath);
        const ext = path_1.default.extname(filePath).toLowerCase().slice(1);
        const mime = ext === 'webp' ? 'image/webp'
            : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                : 'image/png';
        return `data:${mime};base64,${data.toString('base64')}`;
    }
    catch {
        return null;
    }
});
// ── MCP canvas bridge HTTP server (port 8001) ──────────────────────────────
// MCP server (mcp/server.ts) posts canvas + app commands here.
// We forward them to the renderer via IPC and return the result.
const MCP_BRIDGE_PORT = 8001;
const pendingMcpRequests = new Map();
const pendingAppRequests = new Map();
electron_1.ipcMain.on('canvas:result', (_event, result) => {
    const pending = pendingMcpRequests.get(result.requestId);
    if (!pending)
        return;
    pendingMcpRequests.delete(result.requestId);
    if (result.success)
        pending.resolve(result.data);
    else
        pending.reject(new Error(result.error ?? 'canvas command failed'));
});
electron_1.ipcMain.on('app:result', (_event, result) => {
    const pending = pendingAppRequests.get(result.requestId);
    if (!pending)
        return;
    pendingAppRequests.delete(result.requestId);
    if (result.success)
        pending.resolve(result.data);
    else
        pending.reject(new Error(result.error ?? 'app command failed'));
});
function forwardCommand(pendingMap, ipcChannel, cmd, res) {
    if (!mainWindow || mainWindow.isDestroyed()) {
        res.writeHead(503).end(JSON.stringify({ error: 'app not ready' }));
        return;
    }
    // 180 s timeout — image generation can take 1-3 minutes
    const TIMEOUT_MS = cmd.tool === 'generate_image' || cmd.tool === 'replace_image' ? 360000 : 30000;
    const timeout = setTimeout(() => {
        pendingMap.delete(cmd.requestId);
        res.writeHead(504).end(JSON.stringify({ error: 'command timed out' }));
    }, TIMEOUT_MS);
    pendingMap.set(cmd.requestId, {
        resolve: (data) => {
            clearTimeout(timeout);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data }));
        },
        reject: (err) => {
            clearTimeout(timeout);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
        },
    });
    mainWindow.webContents.send(ipcChannel, cmd);
}
function startMcpBridge() {
    const bridge = http_1.default.createServer((req, res) => {
        const isCanvas = req.method === 'POST' && req.url === '/canvas-command';
        const isApp = req.method === 'POST' && req.url === '/app-command';
        if (!isCanvas && !isApp) {
            res.writeHead(404).end(JSON.stringify({ error: 'not found' }));
            return;
        }
        let body = '';
        req.on('data', (chunk) => { body += chunk.toString(); });
        req.on('end', () => {
            let cmd;
            try {
                cmd = JSON.parse(body);
            }
            catch {
                res.writeHead(400).end(JSON.stringify({ error: 'invalid JSON' }));
                return;
            }
            if (isCanvas)
                forwardCommand(pendingMcpRequests, 'canvas:command', cmd, res);
            else
                forwardCommand(pendingAppRequests, 'app:command', cmd, res);
        });
    });
    bridge.listen(MCP_BRIDGE_PORT, '127.0.0.1', () => {
        console.log(`[mcp-bridge] HTTP bridge listening on port ${MCP_BRIDGE_PORT}`);
    });
    bridge.on('error', (err) => console.error('[mcp-bridge] server error:', err));
}
// ── App lifecycle ──────────────────────────────────────────────────────────
electron_1.app.whenReady().then(async () => {
    void startBackend();
    createWindow();
    startMcpBridge();
    // Wait for backend in the background; notify renderer when it's up
    waitForBackend(45000).then(() => notifyBackendStatus('up'));
    ensureCallbackServer();
    const { session: electronSession } = await Promise.resolve().then(() => __importStar(require('electron')));
    const aiSession = electronSession.fromPartition('persist:ai-browser');
    aiSession.setUserAgent(CLEAN_UA);
    aiSession.setPreloads([path_1.default.join(__dirname, 'src', 'pages', 'browser', 'automation', 'webview-preload.js')]);
    aiSession.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
        const headers = { ...details.requestHeaders };
        headers['User-Agent'] = CLEAN_UA;
        delete headers['X-Electron'];
        callback({ requestHeaders: headers });
    });
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
    const tmpDownloadDir = path_1.default.join(require('os').tmpdir(), 'elite_images');
    if (!fs_1.default.existsSync(tmpDownloadDir))
        fs_1.default.mkdirSync(tmpDownloadDir, { recursive: true });
    aiSession.on('will-download', (_event, item) => {
        const ext = path_1.default.extname(item.getFilename()) || '.png';
        const tmpPath = path_1.default.join(tmpDownloadDir, `will_dl_${Date.now()}${ext}`);
        item.setSavePath(tmpPath);
        console.log(`[will-download] intercepted → ${path_1.default.basename(tmpPath)} (${Math.round(item.getTotalBytes() / 1024)}KB)`);
        item.on('updated', (_e, state) => {
            if (state === 'interrupted')
                console.log('[will-download] interrupted');
        });
        item.once('done', (_e, state) => {
            if (state === 'completed') {
                const sizeKb = Math.round(fs_1.default.statSync(tmpPath).size / 1024);
                console.log(`[will-download] done — ${sizeKb}KB → ${path_1.default.basename(tmpPath)}`);
                mainWindow?.webContents.send('image-download-ready', { tmpPath, sizeKb });
            }
            else {
                console.log(`[will-download] failed — state: ${state}`);
                mainWindow?.webContents.send('image-download-ready', { tmpPath: null, sizeKb: 0 });
            }
        });
    });
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
    aiSession.webRequest.onBeforeRequest({ urls: [
            '*://accounts.google.com/*', '*://signin.google.com/*',
            '*://login.microsoft.com/*', '*://login.microsoftonline.com/*', '*://login.live.com/*',
            '*://appleid.apple.com/*', '*://idmsa.apple.com/*',
        ] }, (details, callback) => {
        if (details.resourceType !== 'mainFrame') {
            callback({});
            return;
        }
        console.log('[main] Intercepting hard-block auth nav →', new URL(details.url).hostname);
        // Always cancel and route to system browser — covers webviews AND the
        // in-app popup (which gets here via server-side redirects that bypass will-navigate)
        handlePopup(details.url);
        callback({ cancel: true });
    });
});
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
const PKCE_CALLBACK_PORT = 9876;
let pkceCallbackServer = null;
let _pendingProvider = null;
function startPkceCallbackServer(provider) {
    if (pkceCallbackServer) {
        try {
            pkceCallbackServer.close();
        }
        catch { }
    }
    _pendingProvider = provider;
    pkceCallbackServer = http_1.default.createServer(async (req, res) => {
        const parsed = url_1.default.parse(req.url ?? '', true);
        if (!parsed.pathname?.startsWith('/auth/callback')) {
            res.end();
            return;
        }
        const { code, state, error } = parsed.query;
        // Respond to browser immediately
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${error ? 'Sign-in failed' : 'Signed in'}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;
background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh}
.card{text-align:center;padding:40px;border:1px solid #1e1e1e;border-radius:16px}
h2{font-size:20px;margin-bottom:8px}p{color:#666;font-size:13px}</style>
</head><body><div class="card">
<h2>${error ? '✗ Sign-in failed' : '✓ Signed in'}</h2>
<p>${error ? 'You can close this tab.' : 'You can close this tab and return to the app.'}</p>
</div></body></html>`);
        pkceCallbackServer?.close();
        pkceCallbackServer = null;
        if (error) {
            mainWindow?.webContents.send('auth:complete', { ok: false, error: `Provider error: ${error}` });
            _pendingProvider = null;
            return;
        }
        if (!code || !state) {
            mainWindow?.webContents.send('auth:complete', { ok: false, error: 'Missing code or state in redirect.' });
            _pendingProvider = null;
            return;
        }
        // Forward to Python backend for token exchange
        const body = JSON.stringify({ provider: _pendingProvider, code, state });
        _pendingProvider = null;
        const backendReq = http_1.default.request({ hostname: '127.0.0.1', port: 8000, path: '/api/auth/callback', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (backendRes) => {
            let data = '';
            backendRes.on('data', (chunk) => { data += chunk.toString(); });
            backendRes.on('end', () => {
                if (backendRes.statusCode === 200) {
                    try {
                        const result = JSON.parse(data);
                        mainWindow?.show();
                        mainWindow?.focus();
                        mainWindow?.webContents.send('auth:complete', { ok: true, ...result });
                    }
                    catch {
                        mainWindow?.webContents.send('auth:complete', { ok: false, error: 'Bad response from backend.' });
                    }
                }
                else {
                    mainWindow?.webContents.send('auth:complete', { ok: false, error: `Backend error: ${data.slice(0, 200)}` });
                }
            });
        });
        backendReq.on('error', (err) => {
            mainWindow?.webContents.send('auth:complete', { ok: false, error: err.message });
        });
        backendReq.write(body);
        backendReq.end();
    });
    pkceCallbackServer.listen(PKCE_CALLBACK_PORT, '127.0.0.1', () => {
        console.log(`[auth] PKCE callback server on http://127.0.0.1:${PKCE_CALLBACK_PORT}`);
    });
    pkceCallbackServer.on('error', (err) => {
        console.error('[auth] PKCE callback server error:', err);
        mainWindow?.webContents.send('auth:complete', { ok: false, error: `Callback server error: ${err.message}` });
        pkceCallbackServer = null;
    });
}
// IPC: auth:start — get auth URL from backend, open system browser
electron_1.ipcMain.handle('auth:start', async (_event, req) => {
    const { provider } = req;
    try {
        const result = await new Promise((resolve, reject) => {
            http_1.default.get(`http://127.0.0.1:8000/api/auth/url?provider=${provider}`, (res) => {
                let data = '';
                res.on('data', (c) => { data += c.toString(); });
                res.on('end', () => { try {
                    resolve(JSON.parse(data));
                }
                catch {
                    reject(new Error(data));
                } });
            }).on('error', reject);
        });
        startPkceCallbackServer(provider);
        await electron_1.shell.openExternal(result.url);
        return { ok: true };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
    }
});
// IPC: auth:validate — check stored session token with backend
electron_1.ipcMain.handle('auth:validate', async (_event, token) => {
    return new Promise((resolve) => {
        http_1.default.request({ hostname: '127.0.0.1', port: 8000, path: '/api/auth/me', method: 'GET',
            headers: { Authorization: `Bearer ${token}` } }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c.toString(); });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        resolve({ ok: true, user: JSON.parse(data) });
                    }
                    catch {
                        resolve({ ok: false });
                    }
                }
                else {
                    resolve({ ok: false });
                }
            });
        }).on('error', () => resolve({ ok: false })).end();
    });
});
// IPC: auth:logout — invalidate session token on backend
electron_1.ipcMain.handle('auth:logout', async (_event, token) => {
    return new Promise((resolve) => {
        const body = JSON.stringify({ token });
        const req = http_1.default.request({ hostname: '127.0.0.1', port: 8000, path: '/api/auth/logout', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { res.resume(); resolve({ ok: res.statusCode === 200 }); });
        req.on('error', () => resolve({ ok: false }));
        req.write(body);
        req.end();
    });
});
// ══════════════════════════════════════════════════════════════════════════════
electron_1.app.on('window-all-closed', () => {
    backendProcess?.kill();
    callbackServer?.close();
    pkceCallbackServer?.close();
    (0, browser_controller_1.destroyChatWindow)();
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
