export function Card({ children, style = {} }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 20px', ...style
    }}>
      {children}
    </div>
  )
}

export function GreenCard({ children, style = {} }) {
  return (
    <div style={{
      background: 'var(--green-dim)', border: '1px solid var(--green-border)',
      borderRadius: 12, padding: '16px 20px', ...style
    }}>
      {children}
    </div>
  )
}

export function Label({ children }) {
  return <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{children}</p>
}

export function Btn({ children, onClick, loading, disabled, variant = 'primary', style = {} }) {
  const isPrimary = variant === 'primary'
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      padding: '9px 18px', borderRadius: 8, border: isPrimary ? 'none' : '1px solid var(--border)',
      background: isPrimary ? 'var(--green)' : 'transparent',
      color: isPrimary ? '#000' : 'var(--text2)',
      fontWeight: isPrimary ? 600 : 400, fontSize: 13,
      opacity: (disabled || loading) ? 0.5 : 1,
      cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
      transition: 'opacity .15s', ...style
    }}>
      {loading ? 'Working...' : children}
    </button>
  )
}

export function Input({ value, onChange, placeholder, onKeyDown, style = {} }) {
  return (
    <input value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder}
      style={{
        width: '100%', padding: '10px 14px', background: 'var(--bg3)',
        border: '1px solid var(--border)', borderRadius: 8,
        color: 'var(--text)', fontSize: 14, outline: 'none', ...style
      }}
    />
  )
}

export function Badge({ children, color = 'green' }) {
  const colors = {
    green: { bg: 'var(--green-dim)', border: 'var(--green-border)', text: 'var(--green)' },
    amber: { bg: 'rgba(245,166,35,0.08)', border: 'rgba(245,166,35,0.25)', text: 'var(--amber)' },
    red:   { bg: 'rgba(255,77,77,0.08)', border: 'rgba(255,77,77,0.25)', text: 'var(--red)' },
  }
  const c = colors[color]
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text
    }}>{children}</span>
  )
}
