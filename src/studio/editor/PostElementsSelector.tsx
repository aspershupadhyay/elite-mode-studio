/**
 * PostElementsSelector — Minimal post-generation element picker
 * Appears before AI content is applied to the canvas.
 * Saves user preferences to localStorage.
 */
import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { GeneratedContentArgs } from '@/types/canvas'

const STORAGE_KEY = 'elite_post_prefs'

interface PostPrefs {
  title: boolean
  highlights: boolean
  subtitle: boolean
  tag: boolean
}

const DEFAULTS: PostPrefs = {
  title: true,
  highlights: true,
  subtitle: true,
  tag: true,
}

function loadPrefs(): PostPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch { return { ...DEFAULTS } }
}

function savePrefs(prefs: PostPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

export function getPostPrefs(): PostPrefs { return loadPrefs() }

interface FilteredArgs {
  title?: string
  highlight_words: string[]
  subtitle?: string
  tag?: string
}

interface PostElementsSelectorProps {
  args: GeneratedContentArgs
  onConfirm: (filtered: FilteredArgs) => void
  onCancel: () => void
}

export default function PostElementsSelector({ args, onConfirm, onCancel }: PostElementsSelectorProps): JSX.Element {
  const [prefs, setPrefs] = useState<PostPrefs>(loadPrefs)
  const [remember, setRemember] = useState(true)

  // Normalize highlight_words — backend may return a string instead of an array
  const hwArray: string[] = Array.isArray(args?.highlight_words)
    ? args.highlight_words
    : (args?.highlight_words ? String(args.highlight_words).split(/[,\s]+/).filter(Boolean) : [])

  // Which elements are available in this specific generation?
  const available: PostPrefs = {
    title:      !!args?.title,
    highlights: hwArray.length > 0,
    subtitle:   !!args?.subtitle,
    tag:        !!args?.tag,
  }

  const toggle = (key: keyof PostPrefs): void => setPrefs(p => ({ ...p, [key]: !p[key] }))

  const handleConfirm = (): void => {
    if (remember) savePrefs(prefs)
    // Build filtered args
    const filtered: FilteredArgs = {
      title:           prefs.title      && available.title      ? args.title  : undefined,
      highlight_words: prefs.highlights && available.highlights ? hwArray     : [],
      subtitle:        prefs.subtitle   && available.subtitle   ? args.subtitle : undefined,
      tag:             prefs.tag        && available.tag        ? args.tag    : undefined,
    }
    onConfirm(filtered)
  }

  const titleDesc  = args?.title     ? args.title.slice(0, 40)    + (args.title.length > 40 ? '…' : '')    : '—'
  const hlDesc     = hwArray.join(', ').slice(0, 40) || '—'
  const subDesc    = args?.subtitle  ? args.subtitle.slice(0, 50) + (args.subtitle.length > 50 ? '…' : '') : '—'

  const ITEMS: Array<{ key: keyof PostPrefs; label: string; desc: string }> = [
    { key: 'title',      label: 'Title',         desc: titleDesc },
    { key: 'highlights', label: 'Highlights',    desc: hlDesc },
    { key: 'subtitle',   label: 'Caption',       desc: subDesc },
    { key: 'tag',        label: 'Tag / Hashtag', desc: args?.tag || '—' },
  ]

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      }}
      onClick={(e: MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        width: 340, background: '#141414',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 16, padding: '24px 24px 20px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
        animation: 'pes-in .15s ease',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#EAEAEA' }}>Apply to Post</p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#666' }}>Choose which elements to include</p>
          </div>
          <button onClick={onCancel} style={{
            width: 28, height: 28, borderRadius: 8, border: 'none',
            background: 'rgba(255,255,255,0.06)', color: '#888',
            fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Element rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
          {ITEMS.map(item => (
            <div key={item.key}
              onClick={() => available[item.key] && toggle(item.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 10,
                background: prefs[item.key] && available[item.key] ? 'rgba(11,218,118,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${prefs[item.key] && available[item.key] ? 'rgba(11,218,118,0.2)' : 'rgba(255,255,255,0.05)'}`,
                cursor: available[item.key] ? 'pointer' : 'default',
                opacity: available[item.key] ? 1 : 0.35,
                transition: 'background .12s, border-color .12s',
              }}
            >
              {/* Checkbox */}
              <div style={{
                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                border: `1.5px solid ${prefs[item.key] && available[item.key] ? '#0BDA76' : 'rgba(255,255,255,0.2)'}`,
                background: prefs[item.key] && available[item.key] ? '#0BDA76' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .12s',
              }}>
                {prefs[item.key] && available[item.key] && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: '#EAEAEA' }}>{item.label}</p>
                <p style={{ margin: 0, fontSize: 10, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Remember preference */}
        <div
          onClick={() => setRemember(r => !r)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}
        >
          <div style={{
            width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${remember ? '#0BDA76' : 'rgba(255,255,255,0.2)'}`,
            background: remember ? '#0BDA76' : 'transparent', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .12s',
          }}>
            {remember && <svg width="8" height="6" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
          <span style={{ fontSize: 11, color: '#666' }}>Remember my selection</span>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '10px 0', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.08)', background: 'transparent',
            color: '#888', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button onClick={handleConfirm} style={{
            flex: 2, padding: '10px 0', borderRadius: 10,
            border: 'none', background: '#0BDA76',
            color: '#000', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>Apply to Canvas</button>
        </div>
      </div>
      <style>{`@keyframes pes-in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  )
}
