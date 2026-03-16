const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  version: '1.0.0',

  /**
   * Save N files to a user-selected folder via native OS dialog.
   * Opens Finder/Explorer at the folder after saving.
   *
   * @param {Array<{ filename: string, base64: string }>} files
   * @returns {Promise<{ canceled: boolean, folder?: string, count?: number }>}
   */
  savePngBatch: (files) => ipcRenderer.invoke('save-png-batch', { files }),
})
