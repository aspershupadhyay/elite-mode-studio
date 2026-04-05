/**
 * Pure helper functions and constants for the AI Browser.
 */
import type { Tab } from './types'

let _tc = 0
export function makeTab(url = 'elite://newtab'): Tab {
  return {
    id:         `t${++_tc}`,
    initialUrl: url,
    url,
    inputUrl:   url === 'elite://newtab' ? '' : url,
    title:      url === 'elite://newtab' ? 'New Tab' : url,
    favicon:    '',
    loading:    url !== 'elite://newtab',
    canBack:    false,
    canFwd:     false,
    error:      null,
  }
}

export function normalise(raw: string): string {
  const t = raw.trim()
  if (!t || t === 'elite://newtab') return 'elite://newtab'
  if (/^https?:\/\//i.test(t)) return t
  if (/^[\w-]+\.[a-z]{2,}/i.test(t)) return 'https://' + t
  return 'https://www.google.com/search?q=' + encodeURIComponent(t)
}

export function faviconUrl(pageUrl: string): string {
  try {
    const { hostname } = new URL(pageUrl)
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
  } catch { return '' }
}

export function hostname(pageUrl: string): string {
  try { return new URL(pageUrl).hostname } catch { return pageUrl }
}

// Auth domains — hard-blocked inside webview, must go via system browser
export const HARD_BLOCK_DOMAINS = [
  'accounts.google.com', 'signin.google.com',
  'login.microsoftonline.com', 'login.microsoft.com', 'login.live.com',
  'appleid.apple.com', 'idmsa.apple.com',
]

export const OAUTH_POPUP_DOMAINS = [
  'auth.openai.com', 'auth0.com', 'login.perplexity.ai',
  'clerk.claude.ai', 'auth.anthropic.com',
]

export const MANAGED_SITES = [
  { name: 'ChatGPT',    domain: 'openai.com',       color: '#10a37f' },
  { name: 'Google',     domain: 'google.com',        color: '#4285F4' },
  { name: 'Claude',     domain: 'claude.ai',         color: '#cc785c' },
  { name: 'Perplexity', domain: 'perplexity.ai',     color: '#5b5ef4' },
  { name: 'Gemini',     domain: 'gemini.google.com', color: '#4285F4' },
  { name: 'Midjourney', domain: 'midjourney.com',    color: '#e63946' },
  { name: 'Microsoft',  domain: 'microsoft.com',     color: '#00A4EF' },
]
