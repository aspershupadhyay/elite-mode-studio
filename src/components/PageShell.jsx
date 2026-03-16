export default function PageShell({ title, subtitle, children }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '18px 28px 14px', borderBottom: '1px solid var(--border)',
        flexShrink: 0
      }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin:0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, margin:0 }}>{subtitle}</p>}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '22px 28px' }}>
        {children}
      </div>
    </div>
  )
}
