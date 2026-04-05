import React from 'react'

interface PageShellProps {
  title: string
  subtitle?: React.ReactNode
  children: React.ReactNode
  /** Optional controls rendered right-aligned in the header */
  actions?: React.ReactNode
  /** Max content width in px. Default: 860. Pass 0 for full width. */
  maxWidth?: number
}

export default function PageShell({
  title,
  subtitle,
  children,
  actions,
  maxWidth = 860,
}: PageShellProps): React.ReactElement {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--surface-0)',
    }}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{
        padding: '18px 28px 16px',
        borderBottom: '0.5px solid var(--border-subtle)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <div>
          <h1 style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
            letterSpacing: '-0.02em',
            lineHeight: 1.3,
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              marginTop: 3,
              margin: 0,
              letterSpacing: '0.01em',
              lineHeight: 1.5,
            }}>
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {actions}
          </div>
        )}
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '24px 28px',
      }}>
        {maxWidth > 0 ? (
          <div style={{ maxWidth, width: '100%' }}>
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
