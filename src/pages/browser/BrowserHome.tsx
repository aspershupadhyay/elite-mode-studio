import React, { useState, useRef, useEffect } from 'react'
import { Search } from 'lucide-react'
import { normalise } from './helpers'

const AI_TOOLS = [
  { name: 'ChatGPT',    url: 'https://chatgpt.com',          accent: '#10a37f', tag: 'Chat'   },
  { name: 'Claude',     url: 'https://claude.ai',            accent: '#CC785C', tag: 'Chat'   },
  { name: 'Gemini',     url: 'https://gemini.google.com',    accent: '#4285f4', tag: 'Chat'   },
  { name: 'Perplexity', url: 'https://www.perplexity.ai',    accent: '#5b5ef4', tag: 'Search' },
  { name: 'Midjourney', url: 'https://www.midjourney.com',   accent: '#e63946', tag: 'Image'  },
  { name: 'Ideogram',   url: 'https://ideogram.ai',          accent: '#f4a261', tag: 'Image'  },
  { name: 'Grok',       url: 'https://x.ai',                 accent: '#d1d5db', tag: 'Chat'   },
  { name: 'Sora',       url: 'https://sora.com',             accent: '#ff6b35', tag: 'Video'  },
]

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 5)  return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function BrowserHome({ onNavigate }: { onNavigate: (u: string) => void }): React.ReactElement {
  const [q,       setQ]       = useState('')
  const [focused, setFocused] = useState(false)
  const [time,    setTime]    = useState(() => formatTime(new Date()))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const t = setInterval(() => setTime(formatTime(new Date())), 1000)
    return () => clearInterval(t)
  }, [])

  const go = (): void => {
    const u = normalise(q)
    if (u !== 'elite://newtab') onNavigate(u)
  }

  return (
    <div className="bh-root" style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 20px', overflow: 'auto', position: 'relative',
    }}>
      {/* ── Injected CSS ────────────────────────────────────────────────────── */}
      <style>{`
        /* ── Base ── */
        .bh-root { background: var(--surface-0); }

        /* ── Aurora blobs ── */
        @keyframes bh-aurora-1 {
          0%,100% { transform:translate(0%,0%) scale(1);     opacity:.75; }
          33%     { transform:translate(3%,-5%) scale(1.09); opacity:.5;  }
          66%     { transform:translate(-2%,3%) scale(.93);  opacity:.7;  }
        }
        @keyframes bh-aurora-2 {
          0%,100% { transform:translate(0%,0%) scale(1.04);  opacity:.65; }
          40%     { transform:translate(-4%,3%) scale(.94);  opacity:.45; }
          75%     { transform:translate(3%,-2%) scale(1.1);  opacity:.75; }
        }
        @keyframes bh-aurora-3 {
          0%,100% { transform:translate(0%,0%);              opacity:.55; }
          50%     { transform:translate(2%,4%) scale(1.07);  opacity:.35; }
        }
        .bh-a1 {
          position:absolute; width:75%; height:65%; top:-20%; left:-12%;
          background:radial-gradient(ellipse,rgba(99,102,241,.13) 0%,transparent 68%);
          animation:bh-aurora-1 20s ease-in-out infinite; filter:blur(45px);
        }
        .bh-a2 {
          position:absolute; width:65%; height:55%; bottom:-12%; right:-8%;
          background:radial-gradient(ellipse,rgba(201,106,66,.12) 0%,transparent 68%);
          animation:bh-aurora-2 25s ease-in-out infinite; filter:blur(55px);
        }
        .bh-a3 {
          position:absolute; width:50%; height:50%; top:20%; right:5%;
          background:radial-gradient(ellipse,rgba(16,163,127,.09) 0%,transparent 68%);
          animation:bh-aurora-3 17s ease-in-out infinite; filter:blur(40px);
        }

        /* ── Dot grid — dark vs light ── */
        .bh-dotgrid {
          position:absolute; inset:0;
          background-image:radial-gradient(circle,rgba(255,255,255,.05) 1px,transparent 1px);
          background-size:32px 32px;
          mask-image:radial-gradient(ellipse 80% 80% at 50% 50%,black 30%,transparent 100%);
          -webkit-mask-image:radial-gradient(ellipse 80% 80% at 50% 50%,black 30%,transparent 100%);
        }
        [data-theme="light"] .bh-dotgrid {
          background-image:radial-gradient(circle,rgba(0,0,0,.055) 1px,transparent 1px);
        }

        /* ── Vignette — dark vs light ── */
        .bh-vignette {
          position:absolute; inset:0;
          background:radial-gradient(ellipse 100% 100% at 50% 50%,transparent 40%,var(--surface-0) 100%);
        }

        /* ── Light theme: tone down aurora ── */
        [data-theme="light"] .bh-a1 { opacity:.6; }
        [data-theme="light"] .bh-a2 { opacity:.55; }
        [data-theme="light"] .bh-a3 { opacity:.45; }

        /* ── Clock ── */
        .bh-clock {
          font-size:58px; font-weight:800; letter-spacing:-0.045em;
          font-variant-numeric:tabular-nums; line-height:1;
          background:linear-gradient(160deg,var(--text-primary) 20%,var(--text-secondary) 100%);
          -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          background-clip:text; margin-bottom:8px;
        }

        /* ── Search bar ── */
        .bh-bar {
          display:flex; align-items:center; gap:12px;
          background:var(--surface-2);
          border:1.5px solid var(--border-default);
          border-radius:16px; padding:0 18px; cursor:text;
          transition:border-color .2s, box-shadow .2s, background .2s;
        }
        .bh-bar.on {
          border-color:rgba(201,106,66,.65);
          box-shadow:0 0 0 3px rgba(201,106,66,.12),0 10px 50px rgba(201,106,66,.16);
        }

        /* ── Cards ── */
        .bh-card {
          display:flex; flex-direction:column; align-items:center; gap:10px;
          padding:20px 12px 16px; border-radius:18px; cursor:pointer;
          background:var(--surface-2); border:1px solid var(--border-subtle);
          position:relative; overflow:hidden;
          transition:transform .22s cubic-bezier(.34,1.56,.64,1),
                      border-color .2s, background .2s, box-shadow .2s;
        }
        .bh-card:hover { transform:translateY(-5px) scale(1.03); }

        /* ── Tag chips ── */
        .bh-tag {
          font-size:9px; font-weight:700; letter-spacing:.08em;
          text-transform:uppercase; padding:2px 7px; border-radius:5px;
        }

        /* ── Feature pills ── */
        .bh-pill { display:flex; align-items:center; gap:5px; font-size:11px; color:var(--text-tertiary); }
        .bh-dot  { width:4px; height:4px; border-radius:2px; background:rgba(201,106,66,.55); }

        /* ── Section divider ── */
        .bh-divider { flex:1; height:1px; background:var(--border-subtle); }
      `}</style>

      {/* ── Aurora layers ────────────────────────────────────────────────────── */}
      <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
        <div className="bh-a1"/>
        <div className="bh-a2"/>
        <div className="bh-a3"/>
        <div className="bh-dotgrid"/>
        <div className="bh-vignette"/>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div style={{
        position:'relative', zIndex:1,
        width:'100%', maxWidth:580,
        display:'flex', flexDirection:'column', alignItems:'center',
      }}>

        {/* Clock + greeting */}
        <div style={{ textAlign:'center', marginBottom:36, userSelect:'none' }}>
          <div className="bh-clock">{time}</div>
          <div style={{
            fontSize:13, fontWeight:500, letterSpacing:'0.12em',
            textTransform:'uppercase', color:'var(--text-tertiary)',
          }}>{getGreeting()}</div>
        </div>

        {/* Search bar */}
        <div style={{ width:'100%', marginBottom:44 }}>
          <div
            className={`bh-bar${focused ? ' on' : ''}`}
            onClick={() => inputRef.current?.focus()}
          >
            <Search
              size={16}
              style={{
                color: focused ? 'rgba(201,106,66,.85)' : 'var(--text-tertiary)',
                flexShrink:0, transition:'color .2s',
              }}
            />
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={e => e.key === 'Enter' && go()}
              placeholder="Search the web or enter a URL..."
              style={{
                flex:1, padding:'16px 0',
                background:'none', border:'none', outline:'none',
                color:'var(--text-primary)', fontSize:15, fontFamily:'inherit',
              }}
            />
            {q && (
              <button
                onClick={go}
                style={{
                  padding:'7px 20px', borderRadius:10, flexShrink:0,
                  background:'linear-gradient(135deg,#C96A42,#e08060)',
                  color:'#fff', border:'none', cursor:'pointer',
                  fontSize:13, fontWeight:700,
                  boxShadow:'0 3px 16px rgba(201,106,66,.4)',
                  transition:'transform .15s, box-shadow .15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 24px rgba(201,106,66,.55)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 3px 16px rgba(201,106,66,.4)' }}
              >Go</button>
            )}
          </div>
        </div>

        {/* AI Tools */}
        <div style={{ width:'100%', marginBottom:36 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
            <span style={{
              fontSize:10, fontWeight:700, letterSpacing:'.14em',
              textTransform:'uppercase', color:'var(--text-tertiary)',
              whiteSpace:'nowrap',
            }}>AI Tools</span>
            <div className="bh-divider"/>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
            {AI_TOOLS.map(s => {
              const domain = new URL(s.url).hostname
              return (
                <button
                  key={s.url}
                  className="bh-card"
                  onClick={() => onNavigate(s.url)}
                  onMouseEnter={e => {
                    const b = e.currentTarget as HTMLButtonElement
                    b.style.borderColor = s.accent + '60'
                    b.style.background  = s.accent + '18'
                    b.style.boxShadow   = `0 12px 40px ${s.accent}28,0 0 0 1px ${s.accent}35`
                  }}
                  onMouseLeave={e => {
                    const b = e.currentTarget as HTMLButtonElement
                    b.style.borderColor = 'var(--border-subtle)'
                    b.style.background  = 'var(--surface-2)'
                    b.style.boxShadow   = 'none'
                  }}
                >
                  {/* Top accent line */}
                  <div style={{
                    position:'absolute', top:0, left:'20%', right:'20%', height:1,
                    background:`linear-gradient(90deg,transparent,${s.accent}70,transparent)`,
                    borderRadius:1,
                  }}/>
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                    alt={s.name} width={26} height={26}
                    style={{ borderRadius:7, objectFit:'contain' }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                  <span style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', letterSpacing:'-0.01em' }}>
                    {s.name}
                  </span>
                  <span className="bh-tag" style={{ background: s.accent + '22', color: s.accent }}>
                    {s.tag}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Feature pills */}
        <div style={{ display:'flex', gap:20 }}>
          {['Prompt injection','Image capture','Session memory','Multi-tab'].map(f => (
            <div key={f} className="bh-pill">
              <div className="bh-dot"/>
              {f}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
