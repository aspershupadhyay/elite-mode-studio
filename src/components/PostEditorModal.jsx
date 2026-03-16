import { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'

function EditField({ label, field, local, setLocal, multiline = false, mono = false }) {
  const Tag = multiline ? 'textarea' : 'input'
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 600,
        color: 'var(--text2)', textTransform: 'uppercase',
        letterSpacing: '0.05em', marginBottom: 6,
      }}>
        {label}
      </label>
      <Tag
        value={local[field] || ''}
        onChange={e => setLocal(prev => ({ ...prev, [field]: e.target.value }))}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '9px 12px', borderRadius: 7,
          border: '1px solid var(--border)',
          background: 'var(--bg3)', color: 'var(--text)',
          fontSize: 13, lineHeight: 1.6,
          fontFamily: mono ? 'monospace' : 'inherit',
          resize: multiline ? 'vertical' : undefined,
          minHeight: multiline ? 100 : undefined,
          outline: 'none',
        }}
        onFocus={e => { e.target.style.borderColor = 'var(--green)' }}
        onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
      />
    </div>
  )
}

function LiveHighlights({ words }) {
  if (!words?.trim()) return null
  const list = words.split(',').map(w => w.trim()).filter(Boolean)
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        Preview
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {list.map((w, i) => (
          <span key={i} style={{
            padding: '3px 10px', borderRadius: 5, fontSize: 12, fontWeight: 700,
            background: i < 2 ? 'var(--green-dim)'              : 'rgba(255,255,255,0.04)',
            border:     i < 2 ? '1px solid var(--green-border)' : '1px solid var(--border)',
            color:      i < 2 ? 'var(--green)'                  : 'var(--text2)',
          }}>{w}</span>
        ))}
      </div>
    </div>
  )
}

/**
 * Props:
 *   post     — full post object (must have .content)
 *   onSave(updatedContent) — called with the edited content object
 *   onClose() — called when modal should be dismissed
 */
export default function PostEditorModal({ post, onSave, onClose }) {
  const [local, setLocal] = useState({ ...(post.content || {}) })

  // Close on Escape key
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  function handleSave() {
    onSave(local)
    onClose()
  }

  return (
    // Overlay
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Modal card */}
      <div style={{
        width: '100%', maxWidth: 680,
        maxHeight: '88vh', overflowY: 'auto',
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 14, padding: '24px 28px',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Edit Post</p>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
              {post.topic?.slice(0, 70) || ''}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid var(--border)', borderRadius: 7,
            color: 'var(--text2)', cursor: 'pointer', padding: '5px 8px',
            display: 'flex', alignItems: 'center',
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Fields */}
        <EditField label="Title"            field="title"            local={local} setLocal={setLocal} />
        <EditField label="Highlight Words (comma-separated)" field="highlight_words" local={local} setLocal={setLocal} />
        <LiveHighlights words={local.highlight_words} />
        <EditField label="Caption"          field="caption"          local={local} setLocal={setLocal} multiline />
        <EditField label="Image Prompt 16×9" field="image_prompt_16x9" local={local} setLocal={setLocal} multiline mono />
        {local.hook_text !== undefined && (
          <EditField label="Hook Text"      field="hook_text"        local={local} setLocal={setLocal} />
        )}

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 13,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text2)', cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button onClick={handleSave} style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            border: 'none', background: 'var(--green)', color: '#000',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Save size={13} /> Save Changes
          </button>
        </div>

      </div>
    </div>
  )
}
