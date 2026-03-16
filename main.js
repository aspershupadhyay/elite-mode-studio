const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const fs = require('fs')
const isDev = !app.isPackaged

let mainWindow
let backendProcess

function isPortInUse(port) {
  return new Promise((resolve) => {
    const tester = require('net').createServer()
    tester.once('error', () => resolve(true))
    tester.once('listening', () => { tester.close(); resolve(false) })
    tester.listen(port, '127.0.0.1')
  })
}

async function startBackend() {
  const inUse = await isPortInUse(8000)
  if (inUse) {
    console.log('[main] Port 8000 already in use — skipping backend spawn, reusing existing process')
    return
  }
  const backendPath = path.join(__dirname, 'backend')
  backendProcess = spawn('python3', ['-m', 'uvicorn', 'api:app',
    '--host', '127.0.0.1', '--port', '8000'], {
    cwd: backendPath, stdio: 'pipe'
  })
  backendProcess.stdout.on('data', d => console.log('[backend]', d.toString()))
  backendProcess.stderr.on('data', d => console.error('[backend]', d.toString()))
}

/**
 * Poll GET http://127.0.0.1:8000/api/health every 200ms until it responds
 * (or until the 10s timeout elapses), then resolve.
 * Replaces the hardcoded 2-second blind sleep — window opens the instant
 * the backend is ready, typically 400-800ms on a modern machine.
 */
function waitForBackend(timeoutMs = 10000) {
  return new Promise((resolve) => {
    const start = Date.now()
    function attempt() {
      const req = http.get('http://127.0.0.1:8000/api/health', (res) => {
        res.resume()  // drain the response body
        resolve()     // backend is up — open the window now
      })
      req.on('error', () => {
        if (Date.now() - start >= timeoutMs) {
          console.warn('[main] Backend did not respond within timeout — opening window anyway')
          resolve()
        } else {
          setTimeout(attempt, 200)
        }
      })
      req.setTimeout(300, () => { req.destroy() })
    }
    attempt()
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900,
    minWidth: 1100, minHeight: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0A0A0A',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,    // security restored — see session header override below
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // CORS is handled by FastAPI's CORSMiddleware — no Electron header injection needed.
  // (Injecting duplicate Access-Control-Allow-Origin headers breaks SSE/fetch in renderer)

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ── Electron IPC: native PNG batch save ───────────────────────────────────────
// Called from renderer via window.api.savePngBatch(files)
// files: Array<{ filename: string, base64: string }>
ipcMain.handle('save-png-batch', async (event, { files }) => {
  if (!files?.length) return { canceled: true, reason: 'No files provided.' }

  const result = await dialog.showOpenDialog(mainWindow, {
    title:       'Select folder to save exported files',
    properties:  ['openDirectory', 'createDirectory'],
    buttonLabel: 'Save Here',
  })

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true }
  }

  const folder = result.filePaths[0]
  const saved  = []

  for (const { filename, base64 } of files) {
    try {
      const fullPath = path.join(folder, filename)
      fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'))
      saved.push(fullPath)
    } catch (err) {
      console.error('[IPC save-png-batch] Failed to write', filename, err.message)
    }
  }

  // Open the folder in Finder / Explorer automatically
  shell.openPath(folder)

  return { canceled: false, folder, count: saved.length, paths: saved }
})

app.whenReady().then(async () => {
  startBackend()
  await waitForBackend()  // opens window as soon as backend responds, not after fixed delay
  createWindow()
})

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})
