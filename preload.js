"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('api', {
    version: '1.0.0',
    // ── Canvas / session ────────────────────────────────────────────────────
    savePngBatch: (request) => electron_1.ipcRenderer.invoke('save-png-batch', request),
    saveSession: (data) => electron_1.ipcRenderer.send('session-save', data),
    loadSession: () => electron_1.ipcRenderer.invoke('session-load'),
    downloadBrowserImage: (req) => electron_1.ipcRenderer.invoke('browser-download-image', req),
    // ── AI browser helpers ──────────────────────────────────────────────────
    onAuthComplete: (cb) => { electron_1.ipcRenderer.on('auth-complete', () => cb()); },
    openAuthPopup: (u) => electron_1.ipcRenderer.invoke('open-auth-popup', u),
    openExternal: (u) => electron_1.ipcRenderer.invoke('open-external', u),
    clearBrowserData: () => electron_1.ipcRenderer.invoke('clear-browser-data'),
    clearSiteData: (domain) => electron_1.ipcRenderer.invoke('clear-site-data', domain),
    // ── Secure PKCE OAuth — system browser flow ─────────────────────────────
    authStart: (req) => electron_1.ipcRenderer.invoke('auth:start', req),
    onAuthResult: (cb) => {
        const handler = (_, data) => cb(data);
        electron_1.ipcRenderer.on('auth:complete', handler);
        return () => electron_1.ipcRenderer.removeListener('auth:complete', handler);
    },
    authValidate: (token) => electron_1.ipcRenderer.invoke('auth:validate', token),
    authLogout: (token) => electron_1.ipcRenderer.invoke('auth:logout', token),
    showContextMenu: (params) => electron_1.ipcRenderer.invoke('browser:context-menu', params),
    // ── Image generation pipeline ────────────────────────────────────────────
    startImageGen: (req) => electron_1.ipcRenderer.invoke('image-gen:start', req),
    cancelImageGen: () => electron_1.ipcRenderer.invoke('image-gen:cancel'),
    onImageGenProgress: (cb) => {
        const handler = (_, data) => cb(data);
        electron_1.ipcRenderer.on('image-gen:progress', handler);
        return () => electron_1.ipcRenderer.removeListener('image-gen:progress', handler);
    },
    getImageGenConfig: () => electron_1.ipcRenderer.invoke('image-gen:get-config'),
    setImageGenUrl: (url) => electron_1.ipcRenderer.invoke('image-gen:set-url', url),
    // ── Terminal logging from renderer ──────────────────────────────────────
    log: (...args) => electron_1.ipcRenderer.send('renderer-log', args),
    onBrowserEvent: (cb) => {
        const evts = ['browser:open-new-tab', 'browser:paste', 'browser:reload', 'browser:go-back', 'browser:go-forward'];
        const handlers = evts.map(evt => {
            const h = (_, data) => cb(evt, data);
            electron_1.ipcRenderer.on(evt, h);
            return { evt, h };
        });
        return () => handlers.forEach(({ evt, h }) => electron_1.ipcRenderer.removeListener(evt, h));
    },
});
