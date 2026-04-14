/**
 * ShortcutsModal — keyboard shortcuts cheat sheet overlay.
 * Opens via Cmd/Ctrl+/ — closes on Escape or backdrop click.
 * Platform-aware: shows Mac symbols or Ctrl/Alt/Shift text.
 */

import { useEffect } from 'react'

interface ShortcutsModalProps {
  onClose: () => void
}

// ── Platform detection ────────────────────────────────────────────────────────
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

function mod()   { return isMac ? '⌘' : 'Ctrl' }
function alt()   { return isMac ? '⌥' : 'Alt'  }
function shift() { return isMac ? '⇧' : 'Shift' }

// ── Key badge ─────────────────────────────────────────────────────────────────
function Key({ k }: { k: string }) {
  return (
    <kbd style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: k.length > 2 ? 'auto' : 22, height: 20,
      padding: k.length > 2 ? '0 6px' : '0 4px',
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: 5,
      fontSize: k.length === 1 ? 12 : 10,
      fontWeight: 700,
      color: 'var(--text)',
      fontFamily: isMac ? 'system-ui' : 'monospace',
      letterSpacing: k.length === 1 ? '0.02em' : 0,
      lineHeight: 1,
      whiteSpace: 'nowrap',
      boxShadow: '0 1px 0 rgba(0,0,0,0.5)',
      userSelect: 'none',
    }}>
      {k}
    </kbd>
  )
}

// ── Shortcut row ──────────────────────────────────────────────────────────────
function Row({ keys, label, dim }: { keys: string[]; label: string; dim?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '4px 0',
      opacity: dim ? 0.45 : 1,
    }}>
      <span style={{
        fontSize: 11.5, color: 'var(--text2)', fontWeight: 400,
        flex: 1, paddingRight: 12, lineHeight: 1.4,
      }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
        {keys.map((k, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {i > 0 && <span style={{ fontSize: 9, color: 'var(--text3)', margin: '0 1px' }}>+</span>}
            <Key k={k} />
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function Section({ title }: { title: string }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 800, color: 'var(--accent)',
      textTransform: 'uppercase', letterSpacing: '0.1em',
      marginTop: 16, marginBottom: 4, paddingBottom: 4,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      {title}
    </div>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────
function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '2px 0' }} />
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ShortcutsModal({ onClose }: ShortcutsModalProps): React.ReactElement {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return (): void => { window.removeEventListener('keydown', handler) }
  }, [onClose])

  const m = mod()
  const a = alt()
  const s = shift()

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'scFadeIn .15s cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 0 0.5px rgba(255,255,255,0.04)',
          width: 680,
          maxWidth: 'calc(100vw - 40px)',
          maxHeight: 'calc(100vh - 80px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              Keyboard Shortcuts
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
              {isMac ? 'macOS' : 'Windows / Linux'} — press <Key k={m} /> <Key k="/" /> to toggle
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text3)', fontSize: 18, lineHeight: 1,
              padding: '4px 6px', borderRadius: 6,
              transition: 'color .12s, background .12s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg3)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text3)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '4px 20px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>

            {/* ── Left column ───────────────────────────────────────────── */}
            <div>
              <Section title="Adding Elements" />
              <Row keys={['T']}           label="Add Text Box" />
              <Row keys={['R']}           label="Add Rectangle" />
              <Row keys={['C']}           label="Add Circle" />
              <Row keys={['L']}           label="Add Line" />

              <Section title="Selection" />
              <Row keys={[m, 'A']}        label="Select All" />
              <Row keys={['Tab']}         label="Select Next Element" />
              <Row keys={[s, 'Tab']}      label="Select Previous Element" />
              <Row keys={['Esc']}         label="Deselect" />

              <Section title="Editing" />
              <Row keys={[m, 'C']}        label="Copy" />
              <Row keys={[m, 'X']}        label="Cut" />
              <Row keys={[m, 'V']}        label="Paste" />
              <Row keys={[m, 'D']}        label="Duplicate" />
              <Row keys={['Del']}         label="Delete Element" />
              <Row keys={[m, 'Z']}        label="Undo" />
              <Row keys={[m, s, 'Z']}     label="Redo" />
              <Divider />
              <Row keys={[m, 'Y']}        label="Redo (alternate)" />

              <Section title="Grouping & Layering" />
              <Row keys={[m, 'G']}             label="Group Elements" />
              <Row keys={[m, s, 'G']}          label="Ungroup Elements" />
              <Row keys={[']']}                label="Bring Forward" />
              <Row keys={['[']}                label="Send Backward" />
              <Row keys={[m, a, ']']}          label="Bring to Front" />
              <Row keys={[m, a, '[']}          label="Send to Back" />
              <Row keys={[m, s, 'L']}          label="Lock / Unlock Element" />
              <Row keys={[a, s, 'T']}          label="Distribute Horizontally" />
            </div>

            {/* ── Right column ──────────────────────────────────────────── */}
            <div>
              <Section title="Moving & Positioning" />
              <Row keys={['←', '→', '↑', '↓']}  label="Nudge Element (1px)" />
              <Row keys={[s, '←→↑↓']}            label="Nudge Element (10px)" />
              <Row keys={['Space', 'Drag']}        label="Pan Canvas" />

              <Section title="Text Formatting (editing mode)" />
              <Row keys={[m, 'B']}        label="Bold" />
              <Row keys={[m, 'I']}        label="Italic" />
              <Row keys={[m, 'U']}        label="Underline" />
              <Row keys={[m, s, 'L']}     label="Align Left" />
              <Row keys={[m, s, 'C']}     label="Align Center" />
              <Row keys={[m, s, 'R']}     label="Align Right" />
              <Row keys={[m, s, 'J']}     label="Justify" />

              <Section title="Canvas & View" />
              <Row keys={[m, '+']}        label="Zoom In" />
              <Row keys={[m, '-']}        label="Zoom Out" />
              <Row keys={[m, '0']}        label="Fit to Screen" />
              <Row keys={[m, '1']}        label="Zoom to 100%" />
              <Row keys={[m, ';']}        label="Toggle Guides" />
              <Row keys={['F11']}         label="Toggle Fullscreen" />

              <Section title="Pages" />
              <Row keys={['←', '→']}          label="Navigate Pages (nothing selected)" />
              <Row keys={[m, '↵']}            label="Add New Page" />
              <Row keys={[m, s, 'N']}         label="Add Blank Page" />
              <Row keys={[m, s, 'D']}         label="Duplicate Page" />
              <Row keys={[m, s, '⌫']}         label="Delete Current Page" />
              <Row keys={[m, s, a, '⌫']}      label="Delete All Pages" />
              <Row keys={[m, s, 'P']}         label="Toggle Pages Panel" />
              <Divider />
              <Row keys={[m, '/']}            label="Open / Close This Panel" />
            </div>

          </div>
        </div>
      </div>

      <style>{`
        @keyframes scFadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
