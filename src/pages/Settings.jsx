/**
 * Settings.jsx — Elite Mode Studio Settings
 * Tabs: General · Search Engine · AI Models · Output · Appearance
 * Design: Slate/violet palette, zero EliteMode green, full customisation
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch, apiPost } from '../api.js'

// ─── Icons (inline SVG, hand-picked) ────────────────────────────────────────
const Ic = (d, s=16) => ({ size=s, color='currentColor', ...p } = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
    {Array.isArray(d) ? d.map((x,i)=><path key={i} d={x}/>) : <path d={d}/>}
  </svg>
)
const Icons = {
  activity:  Ic('M22 12h-4l-3 9L9 3l-3 9H2'),
  search:    Ic(['M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12','M21 21l-4.35-4.35']),
  cpu:       Ic(['M9 2H7a2 2 0 0 0-2 2v2','M17 2h2a2 2 0 0 1 2 2v2','M5 17v2a2 2 0 0 0 2 2h2',
                 'M19 17v2a2 2 0 0 1-2 2h-2','M9 9h6v6H9z','M2 9h3M19 9h3M2 15h3M19 15h3M9 2v3M15 2v3M9 19v3M15 19v3']),
  sliders:   Ic(['M4 21v-7','M4 10V3','M12 21v-9','M12 8V3','M20 21v-5','M20 12V3','M1 14h6','M9 8h6','M17 16h6']),
  palette:   Ic(['M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2v-.5c0-.6.4-1 1-1h1.5a3.5 3.5 0 0 0 0-7H15c-1.7 0-3-1.3-3-3','M7 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2','M9 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2','M15 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2']),
  eye:       Ic(['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8','M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0']),
  eyeOff:    Ic(['M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94','M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19','m1 1 22 22','M14.12 14.12a3 3 0 1 1-4.24-4.24']),
  check:     Ic('M20 6 9 17l-5-5'),
  x:         Ic('M18 6 6 18M6 6l12 12'),
  refresh:   Ic(['M23 4v6h-6','M1 20v-6h6','M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15']),
  plus:      Ic('M12 5v14M5 12h14'),
  trash:     Ic(['M3 6h18','M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2','M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6']),
  info:      Ic(['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20','M12 8v4','M12 16h.01']),
  zap:       Ic('M13 2 3 14h9l-1 8 10-12h-9l1-8z'),
  globe:     Ic(['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20','M2 12h20','M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z']),
  key:       Ic(['M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4']),
  dot:       Ic('M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0'),
  sparkle:   Ic(['M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z','M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z','M5 17l.75 2.25L8 20l-2.25.75L5 23l-.75-2.25L2 20l2.25-.75z']),
  pen:       Ic(['M12 20h9','M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z']),
}

// ─── Design tokens — Slate/Violet (independent of EliteMode brand) ───────────
const T = {
  bg:      '#09090B',
  bg2:     '#111113',
  bg3:     '#18181B',
  bg4:     '#1C1C1F',
  border:  '#27272A',
  border2: '#3F3F46',
  text:    '#FAFAFA',
  text2:   '#A1A1AA',
  text3:   '#52525B',
  violet:  '#8B5CF6',
  violetD: '#6D28D9',
  violetL: '#A78BFA',
  violetBg:'rgba(139,92,246,0.08)',
  violetBd:'rgba(139,92,246,0.25)',
  red:     '#EF4444',
  amber:   '#F59E0B',
  emerald: '#10B981',
  sky:     '#0EA5E9',
}

// ─── Accent presets ───────────────────────────────────────────────────────────
const ACCENT_PRESETS = [
  { name:'Violet',  value:'#8B5CF6', dim:'rgba(139,92,246,0.10)', border:'rgba(139,92,246,0.30)' },
  { name:'Cyan',    value:'#06B6D4', dim:'rgba(6,182,212,0.10)',   border:'rgba(6,182,212,0.30)' },
  { name:'Rose',    value:'#F43F5E', dim:'rgba(244,63,94,0.10)',   border:'rgba(244,63,94,0.30)' },
  { name:'Amber',   value:'#F59E0B', dim:'rgba(245,158,11,0.10)',  border:'rgba(245,158,11,0.30)' },
  { name:'Emerald', value:'#10B981', dim:'rgba(16,185,129,0.10)',  border:'rgba(16,185,129,0.30)' },
  { name:'Indigo',  value:'#6366F1', dim:'rgba(99,102,241,0.10)',  border:'rgba(99,102,241,0.30)' },
  { name:'Pink',    value:'#EC4899', dim:'rgba(236,72,153,0.10)',  border:'rgba(236,72,153,0.30)' },
  { name:'Orange',  value:'#F97316', dim:'rgba(249,115,22,0.10)',  border:'rgba(249,115,22,0.30)' },
]

const BG_PRESETS = [
  { name:'Obsidian', bg:'#09090B', bg2:'#111113', bg3:'#18181B' },
  { name:'Midnight', bg:'#0A0A14', bg2:'#0F0F1A', bg3:'#16162A' },
  { name:'Carbon',   bg:'#0C0C0C', bg2:'#141414', bg3:'#1C1C1C' },
  { name:'Navy',     bg:'#0A0F1E', bg2:'#0F1628', bg3:'#162035' },
  { name:'Forest',   bg:'#080E0A', bg2:'#0E1410', bg3:'#162018' },
]

function getAppearance() {
  try {
    const raw = localStorage.getItem('app_appearance')
    if (raw) return JSON.parse(raw)
  } catch {}
  return {
    accent: ACCENT_PRESETS[0].value,
    accentDim: ACCENT_PRESETS[0].dim,
    accentBorder: ACCENT_PRESETS[0].border,
    bg: BG_PRESETS[0].bg, bg2: BG_PRESETS[0].bg2, bg3: BG_PRESETS[0].bg3,
    fontScale: 1,
    sidebarCollapsed: false,
  }
}

import { hexToRgb } from '../utils.js'

function applyAppearance(app) {
  const r = document.documentElement.style
  r.setProperty('--green',        app.accent)
  r.setProperty('--green-rgb',    hexToRgb(app.accent))  // enables rgba() opacity variants
  r.setProperty('--green-dim',    app.accentDim)
  r.setProperty('--green-border', app.accentBorder)
  r.setProperty('--bg',           app.bg)
  r.setProperty('--bg2',          app.bg2)
  r.setProperty('--bg3',          app.bg3)
  // bg3 drives the Tailwind .bg-elite-700 bridge — explicit body bg for instant flash prevention
  document.body.style.background = app.bg
  localStorage.setItem('app_appearance', JSON.stringify(app))
  // Notify DesignStudio and any other listeners that the accent colour changed.
  // This replaces the old 500ms polling loop in DesignStudio.jsx.
  window.dispatchEvent(new CustomEvent('themeChange', { detail: { accent: app.accent } }))
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
        <div style={{ width:32, height:32, borderRadius:8, background:T.violetBg,
          border:`1px solid ${T.violetBd}`, display:'flex', alignItems:'center',
          justifyContent:'center', flexShrink:0 }}>
          <Icon size={15} color={T.violetL}/>
        </div>
        <h2 style={{ fontSize:15, fontWeight:600, color:T.text, margin:0 }}>{title}</h2>
      </div>
      {subtitle && <p style={{ fontSize:12, color:T.text3, marginLeft:42, lineHeight:1.6 }}>{subtitle}</p>}
    </div>
  )
}

function Card({ children, style={} }) {
  return (
    <div style={{ background:T.bg3, border:`1px solid ${T.border}`, borderRadius:12,
      padding:'18px 20px', marginBottom:12, ...style }}>
      {children}
    </div>
  )
}

function CardRow({ label, desc, children, noBorder=false }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'12px 0', borderBottom: noBorder?'none':`1px solid ${T.border}` }}>
      <div style={{ flex:1, paddingRight:16 }}>
        <p style={{ fontSize:13, color:T.text, margin:0, marginBottom:desc?3:0 }}>{label}</p>
        {desc && <p style={{ fontSize:11, color:T.text3, margin:0, lineHeight:1.5 }}>{desc}</p>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <div onClick={()=>onChange(!checked)} style={{
      width:40, height:22, borderRadius:11, cursor:'pointer', flexShrink:0, position:'relative',
      background: checked ? T.violet : T.bg4,
      border: `1px solid ${checked ? T.violet : T.border2}`,
      transition:'all .2s',
    }}>
      <div style={{
        position:'absolute', top:2, left: checked?19:2,
        width:16, height:16, borderRadius:'50%',
        background: checked?'#fff':T.text3,
        transition:'all .2s', boxShadow:'0 1px 3px rgba(0,0,0,0.4)',
      }}/>
    </div>
  )
}

function FieldInput({ label, value, onChange, type='text', placeholder='', hint='' }) {
  const [show, setShow] = useState(false)
  const isPass = type === 'password'
  return (
    <div style={{ marginBottom:14 }}>
      {label && <label style={{ display:'block', fontSize:11, fontWeight:500,
        color:T.text2, marginBottom:6, textTransform:'uppercase', letterSpacing:'.06em' }}>
        {label}
      </label>}
      <div style={{ display:'flex', gap:8 }}>
        <input value={value} onChange={e=>onChange(e.target.value)}
          type={isPass && !show ? 'password' : 'text'} placeholder={placeholder}
          style={{ flex:1, padding:'9px 12px', background:T.bg, border:`1px solid ${T.border2}`,
            borderRadius:8, color:T.text, fontSize:13, outline:'none',
            fontFamily:'inherit', userSelect:'text', transition:'border .15s' }}
          onFocus={e=>e.target.style.borderColor=T.violet}
          onBlur={e=>e.target.style.borderColor=T.border2}
        />
        {isPass && (
          <button onClick={()=>setShow(!show)} style={{
            padding:'0 12px', background:T.bg, border:`1px solid ${T.border2}`,
            borderRadius:8, color:T.text2, cursor:'pointer', flexShrink:0 }}>
            {show ? <Icons.eyeOff size={14}/> : <Icons.eye size={14}/>}
          </button>
        )}
      </div>
      {hint && <p style={{ fontSize:10, color:T.text3, marginTop:5, lineHeight:1.5 }}>{hint}</p>}
    </div>
  )
}

function SelectChip({ options, value, onChange }) {
  return (
    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
      {options.map(o => (
        <button key={o.value} onClick={()=>onChange(o.value)} style={{
          padding:'5px 12px', borderRadius:20, fontSize:11, fontWeight:500,
          border:`1px solid ${value===o.value ? T.violet : T.border}`,
          background: value===o.value ? T.violetBg : 'transparent',
          color: value===o.value ? T.violetL : T.text2,
          cursor:'pointer', transition:'all .15s',
        }}>{o.label}</button>
      ))}
    </div>
  )
}

function StatusPill({ ok, label }) {
  const c = ok ? T.emerald : T.red
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11,
      padding:'3px 9px', borderRadius:20, fontWeight:500,
      background: ok?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)',
      border: `1px solid ${ok?'rgba(16,185,129,0.25)':'rgba(239,68,68,0.25)'}`,
      color: c }}>
      {ok ? <Icons.check size={11} color={c}/> : <Icons.x size={11} color={c}/>}
      {label}
    </span>
  )
}

function PrimaryBtn({ children, onClick, loading=false, disabled=false, small=false }) {
  return (
    <button onClick={onClick} disabled={disabled||loading} style={{
      padding: small?'6px 14px':'9px 20px', borderRadius:8, border:'none',
      background: disabled||loading ? T.bg4 : T.violet,
      color: disabled||loading ? T.text3 : '#fff',
      fontSize: small?11:13, fontWeight:600, cursor: disabled||loading?'not-allowed':'pointer',
      transition:'all .15s', display:'flex', alignItems:'center', gap:7, flexShrink:0,
    }}>
      {loading && <Icons.refresh size={12} style={{animation:'spin 1s linear infinite'}}/>}
      {children}
    </button>
  )
}

// ─── Tab: General ─────────────────────────────────────────────────────────────
function TabGeneral({ health, onTest, testing, testResult }) {
  return (
    <div>
      <SectionHeader icon={Icons.activity} title="System Status"
        subtitle="Live health check of all connected services"/>

      {health && (
        <Card style={{ marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:
              health.status==='ok' ? T.emerald : T.amber }}/>
            <span style={{ fontSize:13, color:T.text, fontWeight:500 }}>
              Backend {health.status==='ok' ? 'running normally' : 'running with warnings'}
            </span>
            <div style={{ marginLeft:'auto' }}>
              <StatusPill ok={health.status==='ok'} label={health.status==='ok'?'Healthy':'Degraded'}/>
            </div>
          </div>
          {health.missing_keys?.length > 0 && (
            <div style={{ padding:'10px 14px', background:'rgba(245,158,11,0.08)',
              border:'1px solid rgba(245,158,11,0.2)', borderRadius:8,
              fontSize:12, color:T.amber }}>
              Missing: {health.missing_keys.join(', ')} — add keys in Search Engine & AI Models tabs
            </div>
          )}
          {health.models && (
            <div style={{ marginTop:16, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {[['LLM',health.models.llm],['Embed',health.models.embed],['Rerank',health.models.rerank]]
                .map(([role,name])=>(
                <div key={role} style={{ padding:'10px 12px', background:T.bg,
                  borderRadius:8, border:`1px solid ${T.border}` }}>
                  <p style={{ fontSize:10, color:T.text3, textTransform:'uppercase',
                    letterSpacing:'.06em', marginBottom:4 }}>{role}</p>
                  <p style={{ fontSize:11, color:T.violetL, fontFamily:'monospace',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div>
            <p style={{ fontSize:13, fontWeight:600, color:T.text, margin:0 }}>Connection Diagnostics</p>
            <p style={{ fontSize:11, color:T.text3, marginTop:3 }}>
              Test all services individually
            </p>
          </div>
          <PrimaryBtn onClick={onTest} loading={testing} small>
            <Icons.refresh size={12}/>Run Tests
          </PrimaryBtn>
        </div>
        {testResult && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {testResult._error && <p style={{ fontSize:12, color:T.red }}>{testResult._error}</p>}
            {testResult.components && Object.entries(testResult.components).map(([name, val]) => (
              <div key={name} style={{ display:'flex', justifyContent:'space-between',
                alignItems:'center', padding:'10px 12px', background:T.bg,
                borderRadius:8, border:`1px solid ${T.border}` }}>
                <div>
                  <p style={{ fontSize:13, color:T.text, margin:0 }}>
                    {name.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
                  </p>
                  {!val.ok && val.error && (
                    <p style={{ fontSize:11, color:T.red, marginTop:2 }}>{val.error}</p>
                  )}
                </div>
                <StatusPill ok={val.ok} label={val.ok?'Connected':'Failed'}/>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Tab: Search Engine ───────────────────────────────────────────────────────
const DEPTH_OPTIONS  = [{value:'basic',label:'Basic'},{value:'advanced',label:'Advanced'}]
const TRANGE_OPTIONS = [{value:'day',label:'Day'},{value:'week',label:'Week'},{value:'month',label:'Month'},{value:'year',label:'Year'},{value:'none',label:'None'}]
const ANSWER_OPTIONS = [{value:'basic',label:'Basic'},{value:'advanced',label:'Advanced'}]
const CHUNK_OPTIONS  = [{value:'1',label:'1'},{value:'3',label:'3'},{value:'5',label:'5'},{value:'10',label:'10'}]
const RESULTS_OPTIONS = [{value:'5',label:'5'},{value:'8',label:'8'},{value:'10',label:'10'}]
const FRESHNESS_OPTIONS = [
  {value:'today',label:'Today'},
  {value:'2days',label:'2 Days'},
  {value:'7days',label:'7 Days'},
  {value:'any',label:'Any'},
]

function TabSearchEngine({ tvKey, setTvKey, searchCfg, setSearchCfg, onSaveKeys, savingKeys, savedKeys }) {
  const tv = searchCfg.tavily || {}
  const setTv = (patch) => setSearchCfg(prev => ({...prev, tavily:{...prev.tavily,...patch}}))
  const [newDomain, setNewDomain] = useState('')
  const [newExclude, setNewExclude] = useState('')
  const [defaultFreshness, setDefaultFreshness] = useState(
    ()=>localStorage.getItem('freshness')||'2days'
  )

  const addDomain  = (list, setList, val) => {
    const d = val.trim().replace(/^https?:\/\//,'').replace(/\//,'')
    if (d && !list.includes(d)) setTv({[list===tv.include_domains?'include_domains':'exclude_domains']:[...list, d]})
  }
  const remDomain  = (key, idx) => setTv({[key]: tv[key].filter((_,i)=>i!==idx)})

  const DomainList = ({ label, listKey, newVal, setNewVal, color }) => {
    const list = tv[listKey] || []
    return (
      <div style={{ marginBottom:16 }}>
        <p style={{ fontSize:11, color:T.text2, fontWeight:500, textTransform:'uppercase',
          letterSpacing:'.06em', marginBottom:8 }}>{label}</p>
        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
          <input value={newVal} onChange={e=>setNewVal(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter'){addDomain(list,null,newVal);setNewVal('')} }}
            placeholder="e.g. reuters.com"
            style={{ flex:1, padding:'8px 10px', background:T.bg, border:`1px solid ${T.border2}`,
              borderRadius:7, color:T.text, fontSize:12, outline:'none', fontFamily:'inherit',
              userSelect:'text' }}/>
          <button onClick={()=>{addDomain(list,null,newVal);setNewVal('')}}
            style={{ padding:'0 12px', background:T.violetBg, border:`1px solid ${T.violetBd}`,
              borderRadius:7, color:T.violetL, cursor:'pointer', fontSize:12 }}>
            <Icons.plus size={14}/>
          </button>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, maxHeight:120, overflowY:'auto' }}>
          {list.map((d,i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', gap:5,
              padding:'3px 10px 3px 8px', borderRadius:20, fontSize:11, fontWeight:500,
              background: color==='green'?'rgba(16,185,129,0.08)':'rgba(239,68,68,0.08)',
              border:`1px solid ${color==='green'?'rgba(16,185,129,0.2)':'rgba(239,68,68,0.2)'}`,
              color: color==='green'?T.emerald:T.red }}>
              <Icons.globe size={10}/>{d}
              <button onClick={()=>remDomain(listKey,i)}
                style={{ background:'none', border:'none', cursor:'pointer',
                  color:'inherit', padding:0, marginLeft:3, lineHeight:1 }}>×</button>
            </div>
          ))}
          {list.length===0 && <span style={{ fontSize:11, color:T.text3 }}>None added</span>}
        </div>
      </div>
    )
  }

  return (
    <div>
      <SectionHeader icon={Icons.search} title="Search Engine"
        subtitle="Tavily API configuration — controls how news is discovered and retrieved"/>

      <Card>
        <p style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:14 }}>API Credentials</p>
        <FieldInput label="Tavily API Key" value={tvKey} onChange={setTvKey}
          type="password" placeholder="tvly-xxxxxxxxxxxx"
          hint="Get yours at tavily.com — free tier is sufficient for personal use"/>
        <PrimaryBtn onClick={onSaveKeys} loading={savingKeys}>
          <Icons.check size={13}/>
          {savedKeys ? 'Saved!' : 'Save API Key'}
        </PrimaryBtn>
      </Card>

      <Card>
        <p style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:4 }}>Search Parameters</p>
        <p style={{ fontSize:11, color:T.text3, marginBottom:16 }}>
          These settings control every Tavily query — more depth = slower but more accurate
        </p>
        <CardRow label="Search Depth" desc="Advanced scans full page content, not just snippets">
          <SelectChip options={DEPTH_OPTIONS} value={tv.search_depth||'advanced'}
            onChange={v=>setTv({search_depth:v})}/>
        </CardRow>
        <CardRow label="Max Results" desc="Number of sources per query">
          <SelectChip options={RESULTS_OPTIONS} value={String(tv.max_results||10)}
            onChange={v=>setTv({max_results:parseInt(v)})}/>
        </CardRow>
        <CardRow label="Chunks per Source" desc="How many text chunks extracted per page">
          <SelectChip options={CHUNK_OPTIONS} value={String(tv.chunks_per_source||5)}
            onChange={v=>setTv({chunks_per_source:parseInt(v)})}/>
        </CardRow>
        <CardRow label="Answer Mode" desc="Tavily's own verified answer prepended to context">
          <SelectChip options={ANSWER_OPTIONS} value={tv.include_answer||'advanced'}
            onChange={v=>setTv({include_answer:v})}/>
        </CardRow>
        <CardRow label="Time Range (fallback)" desc="Used when date range is not set by freshness" noBorder>
          <SelectChip options={TRANGE_OPTIONS} value={tv.time_range||'day'}
            onChange={v=>setTv({time_range:v})}/>
        </CardRow>
      </Card>

      <Card>
        <p style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:4 }}>Default Freshness</p>
        <p style={{ fontSize:11, color:T.text3, marginBottom:14 }}>
          How recent news must be — overrides per-query date ranges
        </p>
        <SelectChip options={FRESHNESS_OPTIONS} value={defaultFreshness}
          onChange={v=>{ setDefaultFreshness(v); localStorage.setItem('freshness',v) }}/>
      </Card>

      <Card>
        <DomainList label="Include Domains (trusted sources only)" listKey="include_domains"
          newVal={newDomain} setNewVal={setNewDomain} color="green"/>
        <DomainList label="Exclude Domains (block these)" listKey="exclude_domains"
          newVal={newExclude} setNewVal={setNewExclude} color="red"/>
      </Card>
    </div>
  )
}

// ─── Tab: AI Models ───────────────────────────────────────────────────────────
const LLM_MODELS = [
  { value:'meta/llama-3.3-70b-instruct',    label:'Llama 3.3 70B',   badge:'Recommended' },
  { value:'meta/llama-3.1-405b-instruct',   label:'Llama 3.1 405B',  badge:'Powerful' },
  { value:'mistralai/mixtral-8x22b-instruct',label:'Mixtral 8×22B',  badge:'Fast' },
  { value:'nvidia/nemotron-4-340b-instruct', label:'Nemotron 340B',   badge:'NVIDIA' },
]
const EMBED_MODELS = [
  { value:'nvidia/llama-3.2-nv-embedqa-1b-v2', label:'NV EmbedQA 1B v2', badge:'Default' },
  { value:'nvidia/nv-embed-v2',                label:'NV Embed v2',       badge:'Larger' },
]
const RERANK_MODELS = [
  { value:'nvidia/llama-nemotron-rerank-1b-v2', label:'Nemotron Rerank 1B', badge:'Default' },
]
const TOKEN_OPTIONS = [{value:'1024',label:'1K'},{value:'2048',label:'2K'},{value:'4096',label:'4K'},{value:'8192',label:'8K'}]

function ModelCard({ label, models, value, onChange }) {
  return (
    <div style={{ marginBottom:20 }}>
      <p style={{ fontSize:11, color:T.text2, fontWeight:600, textTransform:'uppercase',
        letterSpacing:'.06em', marginBottom:10 }}>{label}</p>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {models.map(m => (
          <div key={m.value} onClick={()=>onChange(m.value)} style={{
            display:'flex', alignItems:'center', gap:12, padding:'11px 14px',
            borderRadius:10, cursor:'pointer', transition:'all .15s',
            border: `1px solid ${value===m.value ? T.violet : T.border}`,
            background: value===m.value ? T.violetBg : T.bg,
          }}>
            <div style={{ width:16, height:16, borderRadius:'50%', flexShrink:0,
              border: `2px solid ${value===m.value ? T.violet : T.border2}`,
              background: value===m.value ? T.violet : 'transparent',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              {value===m.value && <div style={{ width:6, height:6, borderRadius:'50%', background:'#fff' }}/>}
            </div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13, color: value===m.value ? T.violetL : T.text, margin:0 }}>{m.label}</p>
              <p style={{ fontSize:10, color:T.text3, fontFamily:'monospace', marginTop:2 }}>{m.value}</p>
            </div>
            <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, fontWeight:500,
              background: value===m.value ? T.violetBg : T.bg4,
              border:`1px solid ${value===m.value ? T.violetBd : T.border}`,
              color: value===m.value ? T.violetL : T.text3 }}>{m.badge}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TabAIModels({ nvKey, setNvKey, searchCfg, setSearchCfg, onSaveKeys, savingKeys, savedKeys }) {
  const nv = searchCfg.nvidia || {}
  const setNv = (patch) => setSearchCfg(prev => ({...prev, nvidia:{...prev.nvidia,...patch}}))

  return (
    <div>
      <SectionHeader icon={Icons.cpu} title="AI Models"
        subtitle="NVIDIA NIM model configuration — choose the right balance of speed and quality"/>

      <Card>
        <p style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:14 }}>API Credentials</p>
        <FieldInput label="NVIDIA API Key" value={nvKey} onChange={setNvKey}
          type="password" placeholder="nvapi-xxxxxxxxxxxx"
          hint="Get yours at build.nvidia.com — powers all three model roles below"/>
        <PrimaryBtn onClick={onSaveKeys} loading={savingKeys}>
          <Icons.check size={13}/>
          {savedKeys ? 'Saved!' : 'Save API Key'}
        </PrimaryBtn>
      </Card>

      <Card>
        <ModelCard label="Language Model (content generation)"
          models={LLM_MODELS} value={nv.llm_model||LLM_MODELS[0].value}
          onChange={v=>setNv({llm_model:v})}/>
        <ModelCard label="Embeddings Model (document search)"
          models={EMBED_MODELS} value={nv.embed_model||EMBED_MODELS[0].value}
          onChange={v=>setNv({embed_model:v})}/>
        <ModelCard label="Reranking Model (result quality)"
          models={RERANK_MODELS} value={nv.rerank_model||RERANK_MODELS[0].value}
          onChange={v=>setNv({rerank_model:v})}/>
      </Card>

      <Card>
        <CardRow label="Max Output Tokens" desc="Longer = richer output, slower response" noBorder>
          <SelectChip options={TOKEN_OPTIONS} value={String(nv.max_tokens||4096)}
            onChange={v=>setNv({max_tokens:parseInt(v)})}/>
        </CardRow>
      </Card>
    </div>
  )
}

// ─── Tab: AI Persona ──────────────────────────────────────────────────────────
const PERSONA_PRESETS = [
  {
    id: 'journalist',
    label: 'Journalist',
    emoji: '📰',
    desc: 'Tier-1 geopolitical analyst. Precision facts, zero sensationalism. The original Elite Mode voice.',
    color: '#8B5CF6',
    colorDim: 'rgba(139,92,246,0.10)',
    colorBd: 'rgba(139,92,246,0.25)',
  },
  {
    id: 'marketer',
    label: 'Digital Marketer',
    emoji: '🎯',
    desc: 'Benefit-driven hooks, social proof, and CTAs. Built for brands, product launches, and growth.',
    color: '#F43F5E',
    colorDim: 'rgba(244,63,94,0.10)',
    colorBd: 'rgba(244,63,94,0.25)',
  },
  {
    id: 'educator',
    label: 'Educator',
    emoji: '🎓',
    desc: 'Analogies, clear structure, and accessible language. Makes the complex genuinely understandable.',
    color: '#06B6D4',
    colorDim: 'rgba(6,182,212,0.10)',
    colorBd: 'rgba(6,182,212,0.25)',
  },
  {
    id: 'crypto',
    label: 'Crypto Analyst',
    emoji: '⛓',
    desc: 'On-chain metrics, protocol analysis, whale activity. Written for DeFi-native audiences.',
    color: '#F59E0B',
    colorDim: 'rgba(245,158,11,0.10)',
    colorBd: 'rgba(245,158,11,0.25)',
  },
  {
    id: 'finance',
    label: 'Finance Analyst',
    emoji: '📈',
    desc: 'Macro implications, rates, spreads, and sector rotation. Bloomberg-grade institutional voice.',
    color: '#10B981',
    colorDim: 'rgba(16,185,129,0.10)',
    colorBd: 'rgba(16,185,129,0.25)',
  },
  {
    id: 'brand',
    label: 'Brand Builder',
    emoji: '🔥',
    desc: 'Bold perspectives, debate-sparking opinions, authority positioning for founders and creators.',
    color: '#F97316',
    colorDim: 'rgba(249,115,22,0.10)',
    colorBd: 'rgba(249,115,22,0.25)',
  },
]

const TONE_OPTIONS = [
  { value: 'analytical',    label: 'Analytical',    desc: 'Sharp, sourced, precise' },
  { value: 'conversational', label: 'Conversational', desc: 'Friendly, direct, relatable' },
  { value: 'professional',  label: 'Professional',  desc: 'Formal, authoritative, executive' },
  { value: 'educational',   label: 'Educational',   desc: 'Teaching-first, analogies, step-by-step' },
  { value: 'punchy',        label: 'Punchy',        desc: 'Short sentences, max impact' },
]
const PLATFORM_OPTIONS = [
  { value: 'instagram',  label: 'Instagram',  icon: '📸' },
  { value: 'linkedin',   label: 'LinkedIn',   icon: '💼' },
  { value: 'twitter',    label: 'Twitter / X', icon: '𝕏' },
  { value: 'newsletter', label: 'Newsletter', icon: '📧' },
]
const CAPTION_LENGTH_OPTIONS = [
  { value: 'short',  label: 'Short',  desc: '300–500 chars' },
  { value: 'medium', label: 'Medium', desc: '800–1200 chars' },
  { value: 'long',   label: 'Long',   desc: '1400–2000 chars' },
]

function getPersonaSettings() {
  return {
    persona:              localStorage.getItem('persona_id')           || 'journalist',
    tone:                 localStorage.getItem('persona_tone')         || 'analytical',
    platform_target:      localStorage.getItem('persona_platform')     || 'instagram',
    caption_length:       localStorage.getItem('persona_caption_len')  || 'medium',
    custom_instructions:  localStorage.getItem('persona_custom_instr') || '',
  }
}

function TabAIPersona() {
  const [ps, setPs] = useState(getPersonaSettings)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const set = (key, val) => setPs(s => ({ ...s, [key]: val }))

  const save = async () => {
    setSaving(true)
    localStorage.setItem('persona_id',          ps.persona)
    localStorage.setItem('persona_tone',         ps.tone)
    localStorage.setItem('persona_platform',     ps.platform_target)
    localStorage.setItem('persona_caption_len',  ps.caption_length)
    localStorage.setItem('persona_custom_instr', ps.custom_instructions)
    await apiPost('/api/persona-config', ps)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    window.dispatchEvent(new CustomEvent('storageChange'))
  }

  const activePreset = PERSONA_PRESETS.find(p => p.id === ps.persona)

  return (
    <div>
      <SectionHeader icon={Icons.sparkle} title="AI Persona"
        subtitle="Shape how the AI writes — from the voice it adopts to the platform it optimises for"/>

      {/* Persona presets */}
      <Card>
        <p style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:4 }}>Use Case Preset</p>
        <p style={{ fontSize:11, color:T.text3, marginBottom:16, lineHeight:1.6 }}>
          Each preset rewires the AI's entire content strategy — not just tone, but structure, angle, and audience.
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {PERSONA_PRESETS.map(p => {
            const active = ps.persona === p.id
            return (
              <div key={p.id} onClick={() => set('persona', p.id)} style={{
                padding:'14px 14px 12px', borderRadius:12, cursor:'pointer',
                border: `1.5px solid ${active ? p.color : T.border}`,
                background: active ? p.colorDim : T.bg,
                transition:'all .18s', position:'relative',
              }}>
                {active && (
                  <div style={{ position:'absolute', top:10, right:10,
                    width:18, height:18, borderRadius:'50%',
                    background: p.color, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Icons.check size={10} color="#fff"/>
                  </div>
                )}
                <div style={{ fontSize:20, marginBottom:8 }}>{p.emoji}</div>
                <p style={{ fontSize:13, fontWeight:600, color: active ? p.color : T.text,
                  margin:0, marginBottom:4 }}>{p.label}</p>
                <p style={{ fontSize:10, color:T.text3, lineHeight:1.5, margin:0 }}>{p.desc}</p>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Tone */}
      <Card>
        <p style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:4 }}>Writing Tone</p>
        <p style={{ fontSize:11, color:T.text3, marginBottom:14 }}>
          How the AI constructs sentences and communicates ideas
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {TONE_OPTIONS.map(t => {
            const active = ps.tone === t.value
            return (
              <div key={t.value} onClick={() => set('tone', t.value)} style={{
                display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                borderRadius:9, cursor:'pointer', transition:'all .15s',
                border: `1px solid ${active ? T.violet : T.border}`,
                background: active ? T.violetBg : 'transparent',
              }}>
                <div style={{ width:16, height:16, borderRadius:'50%', flexShrink:0,
                  border: `2px solid ${active ? T.violet : T.border2}`,
                  background: active ? T.violet : 'transparent',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {active && <div style={{ width:6, height:6, borderRadius:'50%', background:'#fff' }}/>}
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:13, color: active ? T.violetL : T.text, margin:0 }}>{t.label}</p>
                  <p style={{ fontSize:10, color:T.text3, margin:0 }}>{t.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Platform + Caption Length */}
      <Card>
        <CardRow label="Target Platform" desc="Adjusts formatting, hashtag strategy, and line breaks">
          <SelectChip options={PLATFORM_OPTIONS.map(o=>({value:o.value,label:`${o.icon} ${o.label}`}))}
            value={ps.platform_target} onChange={v=>set('platform_target',v)}/>
        </CardRow>
        <CardRow label="Caption Length" desc="Controls character count of the generated caption" noBorder>
          <SelectChip options={CAPTION_LENGTH_OPTIONS.map(o=>({value:o.value,label:`${o.label} · ${o.desc}`}))}
            value={ps.caption_length} onChange={v=>set('caption_length',v)}/>
        </CardRow>
      </Card>

      {/* Custom instructions */}
      <Card>
        <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:14 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:T.violetBg,
            border:`1px solid ${T.violetBd}`, display:'flex', alignItems:'center',
            justifyContent:'center', flexShrink:0 }}>
            <Icons.pen size={14} color={T.violetL}/>
          </div>
          <div>
            <p style={{ fontSize:13, fontWeight:600, color:T.text, margin:0, marginBottom:4 }}>
              Custom Instructions
            </p>
            <p style={{ fontSize:11, color:T.text3, lineHeight:1.6, margin:0 }}>
              Override or extend the AI's behaviour. Added at the highest priority — after all presets.
              Leave blank to use the preset defaults.
            </p>
          </div>
        </div>
        <textarea
          value={ps.custom_instructions}
          onChange={e => set('custom_instructions', e.target.value)}
          placeholder={`Examples:\n• "Always include a section on how this affects small business owners"\n• "End every post with a rhetorical question"\n• "Never use the word 'unprecedented'"\n• "Write in British English"`}
          rows={6}
          style={{
            width:'100%', padding:'10px 12px',
            background: T.bg, border:`1px solid ${T.border2}`,
            borderRadius:8, color:T.text, fontSize:12,
            fontFamily:'inherit', resize:'vertical', outline:'none',
            lineHeight:1.7, boxSizing:'border-box', transition:'border .15s',
          }}
          onFocus={e => e.target.style.borderColor = T.violet}
          onBlur={e  => e.target.style.borderColor = T.border2}
        />
        {ps.custom_instructions.trim() && (
          <p style={{ fontSize:10, color:T.text3, marginTop:6 }}>
            {ps.custom_instructions.trim().split('\n').filter(Boolean).length} instruction{ps.custom_instructions.trim().split('\n').filter(Boolean).length !== 1 ? 's' : ''} active
          </p>
        )}
      </Card>

      {/* Active summary */}
      {activePreset && (
        <Card style={{ background: activePreset.colorDim, border:`1px solid ${activePreset.colorBd}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:22 }}>{activePreset.emoji}</span>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:12, fontWeight:600, color:activePreset.color, margin:0 }}>
                Active: {activePreset.label} · {TONE_OPTIONS.find(t=>t.value===ps.tone)?.label} · {PLATFORM_OPTIONS.find(p=>p.value===ps.platform_target)?.label} · {CAPTION_LENGTH_OPTIONS.find(c=>c.value===ps.caption_length)?.label}
              </p>
              <p style={{ fontSize:11, color:T.text3, margin:'3px 0 0' }}>
                These settings will be applied to every generated post
              </p>
            </div>
            <PrimaryBtn onClick={save} loading={saving} small>
              <Icons.check size={12}/>{saved ? 'Saved!' : 'Save'}
            </PrimaryBtn>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Tab: Output ──────────────────────────────────────────────────────────────
function RangeSlider({ label, value, min, max, onChange, unit='' }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <span style={{ fontSize:12, color:T.text2 }}>{label}</span>
        <span style={{ fontSize:13, fontWeight:700, color:T.violetL, fontFamily:'monospace' }}>
          {value}{unit}
        </span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width:'100%', accentColor: T.violet, cursor:'pointer', height:4 }}
      />
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
        <span style={{ fontSize:10, color:T.text3 }}>{min}{unit}</span>
        <span style={{ fontSize:10, color:T.text3 }}>{max}{unit}</span>
      </div>
    </div>
  )
}

function TabOutput() {
  const [cfg, setCfg] = useState({
    title_min_length:    parseInt(localStorage.getItem('out_title_min') ?? '50'),
    title_max_length:    parseInt(localStorage.getItem('out_title_max') ?? '100'),
    include_9x16:        JSON.parse(localStorage.getItem('out_9x16')     ?? 'false'),
    include_hook:        JSON.parse(localStorage.getItem('out_hook')      ?? 'false'),
    include_category:    JSON.parse(localStorage.getItem('out_category')  ?? 'false'),
    include_sources_block: JSON.parse(localStorage.getItem('out_sources') ?? 'true'),
  })
  const [prompt, setPrompt]       = useState('')
  const [promptEditing, setPromptEditing] = useState(false)
  const [promptLoading, setPromptLoading] = useState(true)
  const [promptSaving, setPromptSaving]   = useState(false)
  const [promptSaved, setPromptSaved]     = useState(false)
  const [cfgSaved, setCfgSaved]           = useState(false)
  const [cfgSaving, setCfgSaving]         = useState(false)
  const originalPromptRef = useRef('')

  // Load system prompt from backend
  useEffect(() => {
    apiFetch('/api/system-prompt').then(({ data }) => {
      if (data?.content) {
        setPrompt(data.content)
        originalPromptRef.current = data.content
      }
      setPromptLoading(false)
    })
  }, [])

  const setKey = (key, val) => {
    const lsMap = {
      title_min_length: 'out_title_min',
      title_max_length: 'out_title_max',
      include_9x16: 'out_9x16',
      include_hook: 'out_hook',
      include_category: 'out_category',
      include_sources_block: 'out_sources',
    }
    localStorage.setItem(lsMap[key] || key, JSON.stringify(val))
    setCfg(s => ({ ...s, [key]: val }))
    window.dispatchEvent(new CustomEvent('storageChange'))
  }

  const saveOutputCfg = async () => {
    setCfgSaving(true)
    await apiPost('/api/output-config', cfg)
    setCfgSaving(false); setCfgSaved(true)
    setTimeout(() => setCfgSaved(false), 2500)
    window.dispatchEvent(new CustomEvent('storageChange'))
  }

  const savePrompt = async () => {
    setPromptSaving(true)
    await apiPost('/api/system-prompt', { content: prompt })
    originalPromptRef.current = prompt
    setPromptSaving(false); setPromptSaved(true); setPromptEditing(false)
    setTimeout(() => setPromptSaved(false), 2500)
  }

  const resetPrompt = () => {
    setPrompt(originalPromptRef.current)
    setPromptEditing(false)
  }

  const OUTPUT_ROWS = [
    { key:'include_hook',          label:'Hook Text',
      desc:'5-word scroll-stopper line for the image overlay' },
    { key:'include_category',      label:'Category Label',
      desc:'Auto-classifies: GEOPOLITICS / AI & TECH / FINANCE / CRYPTO / etc.' },
    { key:'include_9x16',          label:'9×16 Portrait Prompt',
      desc:'Portrait image prompt for Instagram Stories & Reels (1080×1920)' },
    { key:'include_sources_block', label:'Verification Block',
      desc:'Sources + confidence rating block at the end of each post' },
  ]

  const placeholders = ['{DATE_RULE}','{HOOK_BLOCK}','{CATEGORY_BLOCK}','{PORTRAIT_BLOCK}','{TITLE_MIN_LEN}','{TITLE_MAX_LEN}']

  return (
    <div>
      <SectionHeader icon={Icons.sliders} title="Output Format"
        subtitle="Control exactly what the AI generates — title constraints, output blocks, and the full system prompt"/>

      {/* Title length */}
      <Card>
        <p style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:4 }}>Title Length</p>
        <p style={{ fontSize:11, color:T.text3, marginBottom:20, lineHeight:1.6 }}>
          Every generated title must fall within these character limits.
          A minimum of 50 enforces specificity — short titles are almost always vague.
        </p>
        <RangeSlider label="Minimum characters (enforces specificity)"
          value={cfg.title_min_length} min={30} max={80} unit=" chars"
          onChange={v => setKey('title_min_length', v)}/>
        <RangeSlider label="Maximum characters (prevents padding)"
          value={cfg.title_max_length} min={70} max={160} unit=" chars"
          onChange={v => setKey('title_max_length', v)}/>
        <div style={{ padding:'10px 14px', background:T.violetBg,
          border:`1px solid ${T.violetBd}`, borderRadius:8, fontSize:11, color:T.violetL }}>
          Current range: <strong>{cfg.title_min_length}–{cfg.title_max_length} characters</strong>
          {' '}· A number ($, %, count, date) is always required in every title
        </div>
      </Card>

      {/* Output blocks */}
      <Card>
        <p style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:4 }}>Output Blocks</p>
        <p style={{ fontSize:11, color:T.text3, marginBottom:14, lineHeight:1.6 }}>
          Toggle which content fields the AI generates.
          Title, highlight words, caption, and 16×9 image prompt are always included.
        </p>
        {OUTPUT_ROWS.map(({ key, label, desc }, i) => (
          <CardRow key={key} label={label} desc={desc} noBorder={i===OUTPUT_ROWS.length-1}>
            <Toggle checked={cfg[key]} onChange={v=>setKey(key,v)}/>
          </CardRow>
        ))}
      </Card>

      {/* Save output config */}
      <Card>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <p style={{ fontSize:13, fontWeight:600, color:T.text, margin:0 }}>Save Output Settings</p>
            <p style={{ fontSize:11, color:T.text3, marginTop:3 }}>Syncs title lengths and block toggles to backend</p>
          </div>
          <PrimaryBtn onClick={saveOutputCfg} loading={cfgSaving} small>
            <Icons.check size={12}/>{cfgSaved ? 'Saved!' : 'Save'}
          </PrimaryBtn>
        </div>
      </Card>

      {/* System prompt editor */}
      <Card>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <div style={{ width:32, height:32, borderRadius:8, background:T.violetBg,
              border:`1px solid ${T.violetBd}`, display:'flex', alignItems:'center',
              justifyContent:'center', flexShrink:0, marginTop:2 }}>
              <Icons.pen size={14} color={T.violetL}/>
            </div>
            <div>
              <p style={{ fontSize:13, fontWeight:600, color:T.text, margin:0, marginBottom:4 }}>
                AI System Prompt
              </p>
              <p style={{ fontSize:11, color:T.text3, lineHeight:1.6, margin:0 }}>
                The full instruction set fed to the LLM before every generation.
                Edit carefully — this controls tone, structure, title rules, and output format.
              </p>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
            {promptEditing ? (
              <>
                <button onClick={resetPrompt} style={{
                  padding:'6px 12px', borderRadius:7, border:`1px solid ${T.border2}`,
                  background:'transparent', color:T.text2, fontSize:11, cursor:'pointer'
                }}>Cancel</button>
                <PrimaryBtn onClick={savePrompt} loading={promptSaving} small>
                  <Icons.check size={12}/>{promptSaved ? 'Saved!' : 'Save Prompt'}
                </PrimaryBtn>
              </>
            ) : (
              <button onClick={() => setPromptEditing(true)} style={{
                padding:'6px 14px', borderRadius:7, border:`1px solid ${T.border2}`,
                background:T.bg, color:T.text2, fontSize:11, cursor:'pointer',
                display:'flex', alignItems:'center', gap:5,
              }}>
                <Icons.pen size={11}/>Edit
              </button>
            )}
          </div>
        </div>

        {/* Placeholder reference */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
          <span style={{ fontSize:10, color:T.text3, alignSelf:'center' }}>Placeholders:</span>
          {placeholders.map(p => (
            <span key={p} style={{ fontSize:10, padding:'2px 7px', borderRadius:4,
              background: T.bg4, border:`1px solid ${T.border}`,
              color:T.violetL, fontFamily:'monospace' }}>{p}</span>
          ))}
        </div>

        {promptLoading ? (
          <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center',
            background:T.bg, borderRadius:8, border:`1px solid ${T.border}` }}>
            <span style={{ fontSize:12, color:T.text3 }}>Loading prompt…</span>
          </div>
        ) : (
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            readOnly={!promptEditing}
            rows={18}
            spellCheck={false}
            style={{
              width:'100%', padding:'12px 14px',
              background: promptEditing ? T.bg : T.bg4,
              border:`1px solid ${promptEditing ? T.violet : T.border}`,
              borderRadius:8, color: promptEditing ? T.text : T.text2,
              fontSize:11, fontFamily:'monospace', resize:'vertical',
              outline:'none', lineHeight:1.7, boxSizing:'border-box',
              transition:'all .2s', cursor: promptEditing ? 'text' : 'default',
            }}
          />
        )}
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
          <p style={{ fontSize:10, color:T.text3, margin:0 }}>
            {prompt.length.toLocaleString()} characters · {prompt.split('\n').length} lines
          </p>
          {promptEditing && (
            <p style={{ fontSize:10, color:T.amber, margin:0 }}>
              Editing live — changes affect all future generations
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

// ─── Tab: Appearance ──────────────────────────────────────────────────────────
function TabAppearance() {
  const [app, setApp] = useState(getAppearance)
  const [customAccent, setCustomAccent] = useState(app.accent)

  const applyAndSave = (patch) => {
    const next = { ...app, ...patch }
    setApp(next)
    applyAppearance(next)
  }

  const chooseAccent = (preset) => {
    applyAndSave({ accent: preset.value, accentDim: preset.dim, accentBorder: preset.border })
    setCustomAccent(preset.value)
    // The DesignStudio polls CSS vars every 500ms and calls updateAccentColor automatically
  }

  const applyCustomAccent = (hex) => {
    setCustomAccent(hex)
    const r = parseInt(hex.slice(1,3),16)
    const g = parseInt(hex.slice(3,5),16)
    const b = parseInt(hex.slice(5,7),16)
    applyAndSave({
      accent: hex,
      accentDim:    `rgba(${r},${g},${b},0.10)`,
      accentBorder: `rgba(${r},${g},${b},0.30)`,
    })
  }

  return (
    <div>
      <SectionHeader icon={Icons.palette} title="Appearance"
        subtitle="Personalise the studio to match your aesthetic — changes apply instantly"/>

      {/* Accent color */}
      <Card>
        <p style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:4 }}>Accent Color</p>
        <p style={{ fontSize:11, color:T.text3, marginBottom:14 }}>
          Used for highlights, active states, and interactive elements
        </p>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14 }}>
          {ACCENT_PRESETS.map(p => (
            <button key={p.value} onClick={()=>chooseAccent(p)}
              title={p.name}
              style={{ width:32, height:32, borderRadius:8, border:`2px solid`,
                borderColor: app.accent===p.value ? p.value : 'transparent',
                background: p.value, cursor:'pointer', position:'relative',
                transition:'all .15s', outline: app.accent===p.value?`3px solid ${p.value}40`:'none',
                outlineOffset:2 }}>
              {app.accent===p.value && (
                <div style={{ position:'absolute', inset:0, display:'flex',
                  alignItems:'center', justifyContent:'center' }}>
                  <Icons.check size={14} color="#fff"/>
                </div>
              )}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <input type="color" value={customAccent}
            onChange={e=>applyCustomAccent(e.target.value)}
            style={{ width:36, height:36, borderRadius:8, border:`1px solid ${T.border}`,
              background:'transparent', cursor:'pointer', padding:2 }}/>
          <div>
            <p style={{ fontSize:12, color:T.text, margin:0 }}>Custom color</p>
            <p style={{ fontSize:10, color:T.text3, fontFamily:'monospace' }}>{customAccent}</p>
          </div>
        </div>
      </Card>

      {/* Background preset */}
      <Card>
        <p style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:4 }}>Background Tone</p>
        <p style={{ fontSize:11, color:T.text3, marginBottom:14 }}>Base darkness of the interface</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8 }}>
          {BG_PRESETS.map(p => (
            <button key={p.name} onClick={()=>applyAndSave({bg:p.bg,bg2:p.bg2,bg3:p.bg3})}
              style={{ padding:'10px 6px', borderRadius:10, cursor:'pointer',
                border:`1px solid ${app.bg===p.bg ? app.accent : T.border}`,
                background: p.bg, transition:'all .15s',
                outline: app.bg===p.bg?`2px solid ${app.accent}40`:'none', outlineOffset:2 }}>
              <div style={{ width:20, height:20, borderRadius:4, background:p.bg3,
                margin:'0 auto 6px', border:`1px solid ${T.border2}` }}/>
              <p style={{ fontSize:10, color: app.bg===p.bg?app.accent:T.text2,
                margin:0, fontWeight: app.bg===p.bg?600:400 }}>{p.name}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Live preview */}
      <Card>
        <p style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:14 }}>Preview</p>
        <div style={{ padding:'16px', background:'var(--bg2)', borderRadius:10,
          border:'1px solid var(--border)' }}>
          <div style={{ display:'flex', gap:10, marginBottom:12 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:app.accent, marginTop:4 }}/>
            <div>
              <p style={{ fontSize:13, color:'var(--text)', margin:0, fontWeight:500 }}>
                Sample post title
              </p>
              <p style={{ fontSize:11, color:'var(--text2)', margin:'4px 0 0' }}>
                Subtitle text in secondary color
              </p>
            </div>
            <div style={{ marginLeft:'auto' }}>
              <div style={{ padding:'4px 10px', borderRadius:20, fontSize:11,
                background: app.accentDim, border:`1px solid ${app.accentBorder}`,
                color: app.accent, fontWeight:600 }}>Active</div>
            </div>
          </div>
          <div style={{ height:1, background:'var(--border)', marginBottom:12 }}/>
          <div style={{ display:'flex', gap:8 }}>
            <button style={{ padding:'6px 14px', borderRadius:7, border:'none',
              background:app.accent, color:'#000', fontSize:12, fontWeight:600, cursor:'default' }}>
              Primary
            </button>
            <button style={{ padding:'6px 14px', borderRadius:7,
              border:`1px solid ${T.border}`, background:'transparent',
              color:'var(--text2)', fontSize:12, cursor:'default' }}>
              Secondary
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ─── Nav tab definition ───────────────────────────────────────────────────────
const TABS = [
  { id:'general',    icon:Icons.activity, label:'General' },
  { id:'search',     icon:Icons.search,   label:'Search Engine' },
  { id:'models',     icon:Icons.cpu,      label:'AI Models' },
  { id:'persona',    icon:Icons.sparkle,  label:'AI Persona' },
  { id:'output',     icon:Icons.sliders,  label:'Output' },
  { id:'appearance', icon:Icons.palette,  label:'Appearance' },
]

// ─── Root component ───────────────────────────────────────────────────────────
export default function Settings({ onSaved }) {
  const [tab,         setTab]         = useState('general')
  const [nvKey,       setNvKey]       = useState('')
  const [tvKey,       setTvKey]       = useState('')
  const [savingKeys,  setSavingKeys]  = useState(false)
  const [savedKeys,   setSavedKeys]   = useState(false)
  const [health,      setHealth]      = useState(null)
  const [testing,     setTesting]     = useState(false)
  const [testResult,  setTestResult]  = useState(null)
  const [searchCfg,   setSearchCfg]   = useState({ tavily:{}, nvidia:{} })
  const [savingCfg,   setSavingCfg]   = useState(false)

  // Track whether initial data has loaded so the page can show a spinner
  const [initialLoading, setInitialLoading] = useState(true)

  // Load everything on mount — mark loading done when all three calls return
  useEffect(() => {
    let done = 0
    const finish = () => { done++; if (done === 3) setInitialLoading(false) }
    apiFetch('/api/settings').then(({ data }) => {
      if (data) { setNvKey(data.nvidia_api_key||''); setTvKey(data.tavily_api_key||'') }
      finish()
    })
    apiFetch('/api/health').then(({ data }) => { if (data) setHealth(data); finish() })
    apiFetch('/api/search-config').then(({ data }) => { if (data) setSearchCfg(data); finish() })
  }, [])

  // Auto-save search config whenever it changes (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!searchCfg.tavily || Object.keys(searchCfg.tavily).length === 0) return
      setSavingCfg(true)
      await apiPost('/api/search-config', searchCfg)
      setSavingCfg(false)
    }, 800)
    return () => clearTimeout(t)
  }, [searchCfg])

  const saveKeys = async () => {
    setSavingKeys(true)
    await apiPost('/api/settings', { nvidia_api_key: nvKey, tavily_api_key: tvKey })
    setSavingKeys(false); setSavedKeys(true)
    setTimeout(() => setSavedKeys(false), 2500)
    // Notify ContentGen (and others) that output prefs may have changed
    window.dispatchEvent(new CustomEvent('storageChange'))
    onSaved?.()
  }

  const runTest = async () => {
    setTesting(true); setTestResult(null)
    const { data, error } = await apiFetch('/api/test')
    setTestResult(error ? { _error: error } : data)
    setTesting(false)
  }

  if (initialLoading) {
    return (
      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
        justifyContent:'center', background: T.bg, gap: 8 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width:7, height:7, borderRadius:'50%',
            background: T.violet, animation:'pulse 1.2s infinite',
            animationDelay:`${i*.2}s` }}/>
        ))}
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.2}}`}</style>
      </div>
    )
  }

  return (
    <div style={{ position:'absolute', inset:0, display:'flex', overflow:'hidden',
      background: T.bg, fontFamily:'inherit' }}>

      {/* ── Left sidebar ──────────────────────────────────────────── */}
      <nav style={{ width:200, background:T.bg2, borderRight:`1px solid ${T.border}`,
        display:'flex', flexDirection:'column', padding:'20px 10px', flexShrink:0,
        overflow:'hidden' }}>

        <p style={{ fontSize:10, fontWeight:700, color:T.text3, textTransform:'uppercase',
          letterSpacing:'.1em', padding:'0 8px', marginBottom:10 }}>Settings</p>

        {TABS.map(({ id, icon: Icon, label }) => {
          const active = tab === id
          return (
            <button key={id} onClick={() => setTab(id)} style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'9px 10px', borderRadius:9, border:'none', width:'100%',
              cursor:'pointer', fontSize:12, fontWeight: active?600:400,
              background: active ? T.violetBg : 'transparent',
              color: active ? T.violetL : T.text2,
              transition:'all .15s', marginBottom:2, textAlign:'left',
            }}>
              <Icon size={15} color={active ? T.violetL : T.text3}/>
              {label}
            </button>
          )
        })}

        <div style={{ flex:1 }}/>

        {/* Status dot */}
        {health && (
          <div style={{ padding:'10px 10px 0',
            borderTop:`1px solid ${T.border}`, marginTop:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', flexShrink:0,
                background: health.status==='ok' ? T.emerald : T.amber }}/>
              <span style={{ fontSize:10, color:T.text3 }}>
                {health.status==='ok' ? 'All systems OK' : 'Check keys'}
              </span>
            </div>
          </div>
        )}
        {savingCfg && (
          <p style={{ fontSize:10, color:T.text3, padding:'6px 10px 0',
            display:'flex', alignItems:'center', gap:5 }}>
            <Icons.refresh size={9} style={{animation:'spin 1s linear infinite'}}/>
            Saving…
          </p>
        )}
      </nav>

      {/* ── Content area ──────────────────────────────────────────── */}
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'28px 32px' }}>
        {tab === 'general'    && <TabGeneral health={health} onTest={runTest}
                                  testing={testing} testResult={testResult}/>}
        {tab === 'search'     && <TabSearchEngine tvKey={tvKey} setTvKey={setTvKey}
                                  searchCfg={searchCfg} setSearchCfg={setSearchCfg}
                                  onSaveKeys={saveKeys} savingKeys={savingKeys} savedKeys={savedKeys}/>}
        {tab === 'models'     && <TabAIModels nvKey={nvKey} setNvKey={setNvKey}
                                  searchCfg={searchCfg} setSearchCfg={setSearchCfg}
                                  onSaveKeys={saveKeys} savingKeys={savingKeys} savedKeys={savedKeys}/>}
        {tab === 'persona'    && <TabAIPersona/>}
        {tab === 'output'     && <TabOutput/>}
        {tab === 'appearance' && <TabAppearance/>}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
