import React, { useState } from 'react'
import { X, Settings, Trash2, Loader, RefreshCw } from 'lucide-react'
import type { ClearStatus } from './types'
import { MANAGED_SITES } from './helpers'

export default function BrowserSettings({ onClose }: { onClose: () => void }): React.ReactElement {
  const [siteStatus, setSiteStatus] = useState<Record<string, ClearStatus>>({})
  const [allStatus,  setAllStatus]  = useState<ClearStatus>('idle')

  const clearSite = async (domain: string): Promise<void> => {
    setSiteStatus(s => ({ ...s, [domain]: 'clearing' }))
    await window.api.clearSiteData?.(domain)
    setSiteStatus(s => ({ ...s, [domain]: 'done' }))
    setTimeout(() => setSiteStatus(s => ({ ...s, [domain]: 'idle' })), 2500)
  }

  const clearAll = async (): Promise<void> => {
    setAllStatus('clearing')
    await window.api.clearBrowserData?.()
    setAllStatus('done')
    setTimeout(() => setAllStatus('idle'), 2500)
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div style={{
        width: 380, height: '100%', overflow: 'auto',
        background: 'var(--surface-1)',
        borderLeft: '1px solid var(--border-default)',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Settings size={15} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Browser Settings</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 5, display: 'flex', borderRadius: 6, transition: 'color 0.1s' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Clear site cookies & storage
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 28 }}>
            {MANAGED_SITES.map(site => {
              const st = siteStatus[site.domain] ?? 'idle'
              return (
                <div key={site.domain} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 10,
                }}>
                  <img src={`https://www.google.com/s2/favicons?domain=${site.domain}&sz=32`}
                    alt={site.name} width={16} height={16}
                    style={{ borderRadius: 3, flexShrink: 0 }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{site.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{site.domain}</span>
                  <button
                    onClick={() => void clearSite(site.domain)}
                    disabled={st === 'clearing'}
                    style={{
                      padding: '5px 12px', borderRadius: 7, flexShrink: 0,
                      background: st === 'done' ? 'rgba(11,218,118,0.12)' : 'var(--surface-3)',
                      border: `1px solid ${st === 'done' ? 'rgba(11,218,118,0.3)' : 'var(--border-default)'}`,
                      color: st === 'done' ? '#0bda76' : 'var(--text-secondary)',
                      fontSize: 11, fontWeight: 600,
                      cursor: st === 'clearing' ? 'not-allowed' : 'pointer',
                      opacity: st === 'clearing' ? 0.5 : 1,
                      display: 'flex', alignItems: 'center', gap: 5,
                      transition: 'all 0.18s',
                    }}>
                    {st === 'clearing' ? <Loader size={10} style={{ animation: 'spin 0.8s linear infinite' }} /> : st === 'done' ? '✓' : <Trash2 size={10} />}
                    {st === 'done' ? 'Cleared' : 'Clear'}
                  </button>
                </div>
              )
            })}
          </div>

          <div style={{ padding: 16, background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 12 }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Reset all browser data</p>
            <p style={{ margin: '0 0 14px', fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              Clears ALL cookies, storage, and cache. You'll be signed out everywhere.
            </p>
            <button
              onClick={() => void clearAll()}
              disabled={allStatus === 'clearing'}
              style={{
                width: '100%', padding: '10px', borderRadius: 9,
                background: allStatus === 'done' ? 'rgba(11,218,118,0.12)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${allStatus === 'done' ? 'rgba(11,218,118,0.3)' : 'rgba(239,68,68,0.25)'}`,
                color: allStatus === 'done' ? '#0bda76' : '#ef4444',
                fontSize: 12, fontWeight: 700,
                cursor: allStatus === 'clearing' ? 'not-allowed' : 'pointer',
                opacity: allStatus === 'clearing' ? 0.5 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 0.18s',
              }}>
              {allStatus === 'clearing' ? <><Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> Clearing…</> :
               allStatus === 'done' ? '✓ All data cleared' : <><RefreshCw size={12} /> Reset All Browser Data</>}
            </button>
          </div>

          <p style={{ margin: '16px 0 0', fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.65 }}>
            If a site shows a sign-in error (e.g. "session not found"), clear that site's data and try signing in again.
          </p>
        </div>
      </div>
    </div>
  )
}
