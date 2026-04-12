/**
 * SetupModal.tsx — First-run API key setup overlay.
 * Shown when the backend reports missing keys on first launch.
 * Skippable — user can enter keys later in Settings.
 */
import React, { useState } from 'react'
import { apiPost } from '../../api'

interface Props {
  missingKeys: string[]
  onComplete:  () => void
}

export default function SetupModal({ missingKeys, onComplete }: Props): React.ReactElement {
  const [nvidiaKey, setNvidiaKey] = useState('')
  const [tavilyKey, setTavilyKey] = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  const needsNvidia = missingKeys.includes('NVIDIA_API_KEY')
  const needsTavily = missingKeys.includes('TAVILY_API_KEY')
  const canSave     = (!needsNvidia || nvidiaKey.trim().length > 10) &&
                      (!needsTavily || tavilyKey.trim().length > 10)

  async function handleSave(): Promise<void> {
    setSaving(true)
    setError('')
    // Call the backend settings endpoint directly — it saves to the correct
    // DATA_DIR path and reinitialises the pipeline immediately (no restart needed).
    const { error: apiError } = await apiPost('/api/settings', {
      nvidia_api_key: nvidiaKey.trim() || undefined,
      tavily_api_key: tavilyKey.trim() || undefined,
    })
    setSaving(false)
    if (apiError) { setError(apiError); return }
    onComplete()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '10px 14px',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 480, background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '36px 40px', boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #818CF8, #EC4899)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 800, color: '#fff',
          }}>C</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Welcome to CreatorOS</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Add your API keys to unlock AI features
            </div>
          </div>
        </div>

        {/* NVIDIA key */}
        {needsNvidia && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, margin: '0 0 6px' }}>
              NVIDIA NIM API Key
            </p>
            <input
              type="password"
              value={nvidiaKey}
              onChange={e => setNvidiaKey(e.target.value)}
              placeholder="nvapi-..."
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: '6px 0 0' }}>
              Get yours at{' '}
              <span
                onClick={() => window.api.openExternal('https://build.nvidia.com')}
                style={{ color: 'var(--green)', cursor: 'pointer', textDecoration: 'underline' }}
              >build.nvidia.com</span>
            </p>
          </div>
        )}

        {/* Tavily key */}
        {needsTavily && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, margin: '0 0 6px' }}>
              Tavily Search API Key
            </p>
            <input
              type="password"
              value={tavilyKey}
              onChange={e => setTavilyKey(e.target.value)}
              placeholder="tvly-..."
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: '6px 0 0' }}>
              Get yours at{' '}
              <span
                onClick={() => window.api.openExternal('https://app.tavily.com')}
                style={{ color: 'var(--green)', cursor: 'pointer', textDecoration: 'underline' }}
              >app.tavily.com</span>
            </p>
          </div>
        )}

        {error && (
          <p style={{ fontSize: 12, color: 'var(--red)', margin: '0 0 16px' }}>{error}</p>
        )}

        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          style={{
            width: '100%', padding: 12, borderRadius: 10, border: 'none',
            background: canSave ? 'var(--green)' : 'var(--bg3)',
            color: canSave ? '#000' : 'var(--text3)',
            fontSize: 14, fontWeight: 600,
            cursor: canSave ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving...' : 'Save & Launch CreatorOS'}
        </button>

        <div
          onClick={onComplete}
          style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: 'var(--text3)', cursor: 'pointer' }}
        >
          Skip for now — AI features won't work without keys
        </div>
      </div>
    </div>
  )
}
