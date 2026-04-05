import React, { useState, useEffect } from 'react'
import { startLogin } from '../../auth'
import type { AuthStatus } from '../../auth'

function GoogleIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function MicrosoftIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <rect x="1"  y="1"  width="10" height="10" fill="#F25022"/>
      <rect x="13" y="1"  width="10" height="10" fill="#7FBA00"/>
      <rect x="1"  y="13" width="10" height="10" fill="#00A4EF"/>
      <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
    </svg>
  )
}

interface LoginProps {
  status: AuthStatus
  error:  string | null
}

export default function Login({ status, error }: LoginProps): React.ReactElement {
  const [loading, setLoading] = useState<'google' | 'microsoft' | null>(null)
  const isLoggingIn = status === 'logging_in'

  useEffect(() => { if (status !== 'logging_in') setLoading(null) }, [status])

  async function handleLogin(provider: 'google' | 'microsoft'): Promise<void> {
    setLoading(provider)
    try { await startLogin(provider) } catch { setLoading(null) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-0, #0a0a0a)', zIndex: 9999 }}>
      <div style={{ width: '100%', maxWidth: 380, padding: '40px 32px', background: 'var(--surface-1, #111)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.07))', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 14, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)', marginBottom: 16 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--green, #10b981)' }}>E</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary, #e5e7eb)', letterSpacing: '-0.03em' }}>Elite Mode Studio</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-tertiary, #6b7280)' }}>Sign in to continue</p>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(['google', 'microsoft'] as const).map(provider => {
            const isThis = loading === provider
            return (
              <button key={provider} disabled={isLoggingIn} onClick={() => { void handleLogin(provider) }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', padding: '13px 20px', borderRadius: 12, border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.03)', color: isLoggingIn ? 'var(--text-tertiary)' : 'var(--text-primary, #e5e7eb)', fontSize: 13, fontWeight: 500, cursor: isLoggingIn ? 'not-allowed' : 'pointer', opacity: isLoggingIn && !isThis ? 0.5 : 1, transition: 'all 0.15s', fontFamily: 'inherit' }}>
                {provider === 'google' ? <GoogleIcon /> : <MicrosoftIcon />}
                {isThis ? 'Opening browser…' : `Continue with ${provider === 'google' ? 'Google' : 'Microsoft'}`}
              </button>
            )
          })}
        </div>

        {/* Waiting hint */}
        {isLoggingIn && (
          <div style={{ marginTop: 18, padding: '12px 14px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 10, fontSize: 12, color: 'var(--text-secondary, #9ca3af)', textAlign: 'center', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--green, #10b981)', display: 'block', marginBottom: 2 }}>Browser opened</strong>
            Complete sign-in in your browser — this window will update automatically.
          </div>
        )}

        {/* Error */}
        {error && !isLoggingIn && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: 12, color: '#f87171', lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        <p style={{ marginTop: 24, fontSize: 11, color: 'var(--text-tertiary, #4b5563)', textAlign: 'center', lineHeight: 1.6 }}>
          Authentication is handled by Google or Microsoft.<br/>Only your email and name are stored locally.
        </p>
      </div>
    </div>
  )
}
