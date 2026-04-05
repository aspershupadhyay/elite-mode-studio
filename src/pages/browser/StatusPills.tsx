import React from 'react'
import { Loader, CheckCircle, Image as ImageIcon, X } from 'lucide-react'
import type { PendingPrompt } from './types'

interface StatusPillsProps {
  prompts: PendingPrompt[]
  onClear: () => void
}

export default function StatusPills({ prompts, onClear }: StatusPillsProps): React.ReactElement | null {
  if (prompts.length === 0) return null

  const done  = prompts.filter(p => p.status === 'done').length
  const errs  = prompts.filter(p => p.status === 'error').length
  const total = prompts.length
  const active = prompts.find(p => p.status === 'injecting' || p.status === 'waiting_image')
  const activeIdx = active ? prompts.indexOf(active) + 1 : null
  const allDone = done + errs === total

  return (
    <div style={{
      position: 'absolute', bottom: 16, right: 16, zIndex: 20,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
      pointerEvents: 'none',
    }}>
      {/* Active post pill */}
      {active && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 20,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          fontSize: 11, fontWeight: 500, color: '#fff',
          pointerEvents: 'auto',
        }}>
          <Loader size={10} style={{ color: 'var(--green)', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
          <span style={{ color: 'var(--green)', fontWeight: 700 }}>{activeIdx}/{total}</span>
          <span style={{ color: 'rgba(255,255,255,0.6)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {active.status === 'injecting' ? 'Typing…' : 'Generating…'}
          </span>
        </div>
      )}

      {/* Summary pill */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 20,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
        border: `1px solid ${allDone ? 'rgba(11,218,118,0.3)' : 'rgba(255,255,255,0.08)'}`,
        fontSize: 11, fontWeight: 500, color: '#fff',
        pointerEvents: 'auto',
      }}>
        {allDone
          ? <CheckCircle size={10} style={{ color: 'var(--green)', flexShrink: 0 }} />
          : <ImageIcon size={10} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
        }
        <span>
          <span style={{ color: 'var(--green)', fontWeight: 700 }}>{done}</span>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}> / {total}</span>
          {errs > 0 && <span style={{ color: '#f87171', marginLeft: 4 }}>{errs} failed</span>}
        </span>
        {allDone && (
          <button
            onClick={onClear}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.3)', padding: 0, marginLeft: 2,
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={9} />
          </button>
        )}
      </div>
    </div>
  )
}
