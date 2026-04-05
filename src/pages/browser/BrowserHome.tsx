import React, { useState, useRef, useEffect } from 'react'
import { Search, Globe, Sparkles, Cpu, Palette, Brain } from 'lucide-react'
import { normalise } from './helpers'

const QUICK_SITES = [
  { name: 'ChatGPT',    url: 'https://chatgpt.com',        accent: '#10a37f' },
  { name: 'Claude',     url: 'https://claude.ai',          accent: '#cc785c' },
  { name: 'Perplexity', url: 'https://www.perplexity.ai',  accent: '#5b5ef4' },
  { name: 'Gemini',     url: 'https://gemini.google.com',  accent: '#4285f4' },
  { name: 'Midjourney', url: 'https://www.midjourney.com', accent: '#e63946' },
  { name: 'Ideogram',   url: 'https://ideogram.ai',        accent: '#f4a261' },
  { name: 'Grok',       url: 'https://x.ai',               accent: '#e7e9ea' },
  { name: 'Sora',       url: 'https://sora.com',           accent: '#ff6b35' },
]

const SIGNIN_SITES = [
  { name: 'ChatGPT',    url: 'https://chatgpt.com/auth/login', color: '#10a37f', note: 'Email, Google, Microsoft, Apple', favicon: 'https://www.google.com/s2/favicons?domain=chatgpt.com&sz=32' },
  { name: 'Gemini',     url: 'https://gemini.google.com',      color: '#4285F4', note: 'Google account',                  favicon: 'https://www.google.com/s2/favicons?domain=gemini.google.com&sz=32' },
  { name: 'Claude',     url: 'https://claude.ai/login',        color: '#cc785c', note: 'Email, Google',                   favicon: 'https://www.google.com/s2/favicons?domain=claude.ai&sz=32' },
  { name: 'Perplexity', url: 'https://www.perplexity.ai',      color: '#5b5ef4', note: 'Email, Google',                   favicon: 'https://www.google.com/s2/favicons?domain=perplexity.ai&sz=32' },
]

export default function BrowserHome({ onNavigate }: { onNavigate: (u: string) => void }): React.ReactElement {
  const [q, setQ] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  const go = (): void => {
    const u = normalise(q)
    if (u !== 'elite://newtab') onNavigate(u)
  }

  const openAuthPopup = (u: string): void => { window.api.openAuthPopup?.(u) }

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 20px', overflow: 'auto',
      background: 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(11,218,118,0.06) 0%, transparent 65%)',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 56, height: 56, borderRadius: 18, marginBottom: 16,
          background: 'linear-gradient(135deg,rgba(11,218,118,0.15),rgba(11,218,118,0.04))',
          border: '1px solid rgba(11,218,118,0.2)',
          boxShadow: '0 0 50px rgba(11,218,118,0.1)',
        }}>
          <Brain size={26} style={{ color: 'var(--accent)' }} />
        </div>
        <h1 style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em' }}>
          AI Browser
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>One workspace. Every AI tool.</p>
      </div>

      {/* Search bar */}
      <div style={{ width: '100%', maxWidth: 540, marginBottom: 32 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--surface-2)',
          border: '1px solid var(--border-default)',
          borderRadius: 14, padding: '0 16px',
          boxShadow: '0 2px 20px rgba(0,0,0,0.3)',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
          onFocus={() => {}}
        >
          <Search size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            ref={ref}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && go()}
            placeholder="Search or enter a URL..."
            style={{
              flex: 1, padding: '14px 0',
              background: 'none', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit',
            }}
          />
          {q && (
            <button onClick={go} style={{
              padding: '6px 16px', borderRadius: 9,
              background: 'var(--accent)', color: 'var(--accent-fg)',
              border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, flexShrink: 0,
            }}>Go</button>
          )}
        </div>
      </div>

      {/* Sign in section */}
      <div style={{ width: '100%', maxWidth: 540, marginBottom: 28 }}>
        <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Sign in to AI sites
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SIGNIN_SITES.map(s => (
            <button key={s.url} onClick={() => onNavigate(s.url)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
              background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
              borderRadius: 11, cursor: 'pointer', textAlign: 'left', width: '100%',
              transition: 'all 0.12s',
            }}
              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = s.color + '55'; b.style.background = s.color + '0d' }}
              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'var(--border-subtle)'; b.style.background = 'var(--surface-2)' }}
            >
              <img src={s.favicon} alt={s.name} width={18} height={18} style={{ borderRadius: 4, flexShrink: 0 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{s.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.note}</span>
              <Globe size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>

      {/* Google/Microsoft/Apple system browser sign-in */}
      <div style={{ width: '100%', maxWidth: 540, marginBottom: 28 }}>
        <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Sign in via System Browser
        </p>
        <div style={{ padding: '16px', background: 'var(--surface-2)', border: '1px solid var(--border-default)', borderRadius: 12 }}>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Opens your system browser (Chrome/Safari). Once signed in, the session is saved — no re-login needed.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { name: 'Google', url: 'https://accounts.google.com/signin', color: '#4285F4' },
              { name: 'Microsoft', url: 'https://login.microsoftonline.com', color: '#00A4EF' },
              { name: 'Apple', url: 'https://appleid.apple.com/sign-in', color: '#aaa' },
            ].map(p => (
              <button key={p.name} onClick={() => openAuthPopup(p.url)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px',
                background: p.color + '14', border: `1px solid ${p.color}40`,
                borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                transition: 'all 0.12s',
              }}
                onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = p.color + '25'; b.style.borderColor = p.color + '80'; b.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = p.color + '14'; b.style.borderColor = p.color + '40'; b.style.transform = 'none' }}
              >
                <Globe size={12} style={{ color: p.color }} /> {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick access grid */}
      <div style={{ width: '100%', maxWidth: 540 }}>
        <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Quick Access
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {QUICK_SITES.map(s => (
            <button key={s.url} onClick={() => onNavigate(s.url)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              padding: '18px 10px', background: 'var(--surface-2)',
              border: '1px solid var(--border-subtle)', borderRadius: 14, cursor: 'pointer',
              transition: 'all 0.12s',
            }}
              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = s.accent + '55'; b.style.transform = 'translateY(-2px)'; b.style.background = s.accent + '0f' }}
              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'var(--border-subtle)'; b.style.transform = 'none'; b.style.background = 'var(--surface-2)' }}
            >
              <img src={`https://www.google.com/s2/favicons?domain=${new URL(s.url).hostname}&sz=32`}
                alt={s.name} width={22} height={22} style={{ borderRadius: 5, objectFit: 'contain' }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '-0.01em' }}>
                {s.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginTop: 32, fontSize: 11, color: 'var(--text-tertiary)' }}>
        {[{ icon: <Sparkles size={11} />, label: 'Prompt injection' }, { icon: <Cpu size={11} />, label: 'Image capture' }, { icon: <Palette size={11} />, label: 'Session memory' }].map(f => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: 'var(--accent)' }}>{f.icon}</span>{f.label}
          </div>
        ))}
      </div>
    </div>
  )
}
