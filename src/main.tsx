import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { hexToRgb } from './utils'

interface AppearanceConfig {
  accent?: string
  accentDim?: string
  accentBorder?: string
  bg?: string
  bg2?: string
  bg3?: string
}

/**
 * applyStoredAppearance()
 *
 * Reads the user's saved Appearance settings from localStorage and applies
 * them as CSS custom properties BEFORE the first React render.
 * This eliminates the flash-of-wrong-colour on load.
 *
 * hexToRgb is imported from utils.js — single source of truth, no duplication.
 */
function applyStoredAppearance(): void {
  try {
    const raw = localStorage.getItem('app_appearance')
    if (!raw) return
    const a = JSON.parse(raw) as AppearanceConfig
    const r = document.documentElement.style

    if (a.accent) {
      r.setProperty('--green',     a.accent)
      r.setProperty('--green-rgb', hexToRgb(a.accent))   // required for opacity variants
    }
    if (a.accentDim)    r.setProperty('--green-dim',    a.accentDim)
    if (a.accentBorder) r.setProperty('--green-border', a.accentBorder)
    if (a.bg) {
      r.setProperty('--bg',  a.bg)
      document.body.style.background = a.bg  // immediate body BG to stop flash
    }
    if (a.bg2) r.setProperty('--bg2', a.bg2)
    if (a.bg3) r.setProperty('--bg3', a.bg3)
  } catch {
    // silently ignore parse errors
  }
}

applyStoredAppearance()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)
