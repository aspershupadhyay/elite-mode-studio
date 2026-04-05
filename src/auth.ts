/**
 * auth.ts — Renderer-side authentication state machine.
 *
 * Single source of truth for auth state in the renderer process.
 * App.tsx calls bootstrapAuth() on mount and subscribeAuth() to re-render on changes.
 */

import type { AuthUser, AuthCompleteEvent } from './types/ipc'

export type AuthStatus = 'checking' | 'logged_out' | 'logging_in' | 'logged_in'

export interface AuthState {
  status: AuthStatus
  user:   AuthUser | null
  error:  string | null
}

const SESSION_KEY = 'elite_session_token'

// Start as logged_out unless there's a stored token — avoids showing spinner on first load
const _hasToken = !!localStorage.getItem(SESSION_KEY)
let _state: AuthState = { status: _hasToken ? 'checking' : 'logged_out', user: null, error: null }
let _unsubAuthResult: (() => void) | null = null

type Listener = (state: AuthState) => void
const _listeners = new Set<Listener>()

function _setState(patch: Partial<AuthState>): void {
  _state = { ..._state, ...patch }
  _listeners.forEach(fn => fn(_state))
}

export function getAuthState(): AuthState { return _state }

export function subscribeAuth(listener: Listener): () => void {
  _listeners.add(listener)
  return () => _listeners.delete(listener)
}

export function bootstrapAuth(): void {
  const token = localStorage.getItem(SESSION_KEY)

  // No stored token → show login screen immediately, no async needed
  if (!token) {
    _setState({ status: 'logged_out', user: null, error: null })
    return
  }

  // Has a stored token — validate it against the backend
  _registerAuthCompleteListener()
  window.api.authValidate(token).then(result => {
    if (result.ok && result.user) {
      _setState({ status: 'logged_in', user: result.user, error: null })
    } else {
      localStorage.removeItem(SESSION_KEY)
      _setState({ status: 'logged_out', user: null, error: null })
    }
  }).catch(() => {
    // Backend not up yet — just show login
    localStorage.removeItem(SESSION_KEY)
    _setState({ status: 'logged_out', user: null, error: null })
  })
}

export async function startLogin(provider: 'google' | 'microsoft'): Promise<void> {
  _setState({ status: 'logging_in', error: null })
  _registerAuthCompleteListener()
  const result = await window.api.authStart({ provider })
  if (!result.ok) {
    _setState({ status: 'logged_out', error: result.error ?? 'Could not open browser.' })
  }
}

export async function logout(): Promise<void> {
  const token = localStorage.getItem(SESSION_KEY)
  if (token) {
    localStorage.removeItem(SESSION_KEY)
    window.api.authLogout(token).catch(() => {})
  }
  _setState({ status: 'logged_out', user: null, error: null })
}

function _registerAuthCompleteListener(): void {
  if (_unsubAuthResult) { _unsubAuthResult(); _unsubAuthResult = null }
  if (!window.api?.onAuthResult) return

  _unsubAuthResult = window.api.onAuthResult((event: AuthCompleteEvent) => {
    if (_unsubAuthResult) { _unsubAuthResult(); _unsubAuthResult = null }

    if (!event.ok || !event.session_token || !event.user) {
      _setState({ status: 'logged_out', error: event.error ?? 'Login failed. Please try again.' })
      return
    }
    localStorage.setItem(SESSION_KEY, event.session_token)
    _setState({ status: 'logged_in', user: event.user, error: null })
  })
}
