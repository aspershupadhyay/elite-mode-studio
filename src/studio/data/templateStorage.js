// templateStorage.js — Template persistence via localStorage
// (Electron IPC path kept for future use)

function hasElectronAPI() {
  return typeof window !== 'undefined' &&
    typeof window.electronAPI !== 'undefined' &&
    typeof window.electronAPI.saveTemplate === 'function'
}

export async function saveTemplate(data) {
  const template = {
    ...data,
    id: `tmpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  }
  if (hasElectronAPI()) {
    await window.electronAPI.saveTemplate(template)
  } else {
    const templates = _getSync()
    templates.unshift(template)
    _setSync(templates)
  }
  return template
}

export async function updateTemplate(id, patch) {
  if (hasElectronAPI()) {
    // Electron: load, patch, re-save
    const list = await window.electronAPI.listTemplates()
    const idx  = list.findIndex(t => t.id === id)
    if (idx === -1) return
    list[idx] = { ...list[idx], ...patch, updatedAt: Date.now() }
    await window.electronAPI.saveTemplate(list[idx])
    return list[idx]
  }
  const templates = _getSync()
  const idx = templates.findIndex(t => t.id === id)
  if (idx === -1) return null
  templates[idx] = { ...templates[idx], ...patch, updatedAt: Date.now() }
  _setSync(templates)
  return templates[idx]
}

export async function getTemplates() {
  if (hasElectronAPI()) return await window.electronAPI.listTemplates()
  return _getSync()
}

export async function deleteTemplate(id) {
  if (hasElectronAPI()) {
    await window.electronAPI.deleteTemplate(id)
    return
  }
  _setSync(_getSync().filter(t => t.id !== id))
}

function _getSync() {
  try {
    const raw = localStorage.getItem('elite_templates')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function _setSync(list) {
  localStorage.setItem('elite_templates', JSON.stringify(list))
}

export function generateThumbnail(canvas, maxWidth = 300) {
  try {
    return canvas.toDataURL({
      format: 'png',
      quality: 0.7,
      multiplier: maxWidth / canvas.width,
    })
  } catch { return '' }
}
