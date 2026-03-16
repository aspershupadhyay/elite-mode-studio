import { useState, useEffect } from 'react'
import PageShell from '../components/PageShell.jsx'
import { Card, GreenCard, Label, Btn, Input } from '../components/ui.jsx'
import { Instagram, Twitter, Linkedin, Copy, Check, Zap, Lock,
         TrendingUp, RefreshCw, ExternalLink, Layers, Calendar, StopCircle,
         PenTool } from 'lucide-react'
import { apiPost } from '../api.js'

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: Instagram, color: '#E1306C', active: true },
  { id: 'twitter',   label: 'Twitter/X',  icon: Twitter,   color: '#1DA1F2', active: false },
  { id: 'linkedin',  label: 'LinkedIn',   icon: Linkedin,  color: '#0A66C2', active: false },
]
const CATEGORIES   = ['GEOPOLITICS','AI & TECH','FINANCE','CRYPTO','DEFENSE','CLIMATE']
const FRESH_LABELS = { today:'Today only', '2days':'Last 2 days', '7days':'Last 7 days', any:'No filter' }

const PERSONA_LABELS = {
  journalist: { label: 'Journalist', emoji: '📰' },
  marketer:   { label: 'Marketer',   emoji: '🎯' },
  educator:   { label: 'Educator',   emoji: '🎓' },
  crypto:     { label: 'Crypto',     emoji: '⛓' },
  finance:    { label: 'Finance',    emoji: '📈' },
  brand:      { label: 'Brand',      emoji: '🔥' },
}

function getPersonaSettings() {
  return {
    persona:             localStorage.getItem('persona_id')           || 'journalist',
    tone:                localStorage.getItem('persona_tone')         || 'analytical',
    platform_target:     localStorage.getItem('persona_platform')     || 'instagram',
    caption_length:      localStorage.getItem('persona_caption_len')  || 'medium',
    custom_instructions: localStorage.getItem('persona_custom_instr') || '',
  }
}

function getOutSettings() {
  return {
    include_9x16:     JSON.parse(localStorage.getItem('out_9x16')     ?? 'false'),
    include_hook:     JSON.parse(localStorage.getItem('out_hook')      ?? 'false'),
    include_category: JSON.parse(localStorage.getItem('out_category')  ?? 'false'),
    freshness:        localStorage.getItem('freshness') ?? '2days',
    ...getPersonaSettings(),
  }
}

function ErrorBox({ msg }) {
  if (!msg) return null
  return (
    <div style={{padding:'12px 14px',background:'rgba(255,77,77,0.08)',
      border:'1px solid rgba(255,77,77,0.25)',borderRadius:8,
      fontSize:13,color:'var(--red)',marginBottom:16,lineHeight:1.6}}>{msg}</div>
  )
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={()=>{navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),1500)}}
      style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:6,
        border:'1px solid var(--border)',background:'transparent',color:'var(--text2)',
        fontSize:11,cursor:'pointer',flexShrink:0}}>
      {copied?<><Check size={10}/>Copied</>:<><Copy size={10}/>Copy</>}
    </button>
  )
}

function Block({ label, value, mono=false }) {
  if (!value) return null
  return (
    <Card style={{marginBottom:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <Label>{label}</Label><CopyBtn text={value}/>
      </div>
      <p style={{fontSize:13,lineHeight:1.8,whiteSpace:'pre-wrap',color:'var(--text)',
        fontFamily:mono?'monospace':'inherit'}}>{value}</p>
    </Card>
  )
}

function HighlightWords({ words }) {
  if (!words) return null
  return (
    <Card style={{marginBottom:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <Label>Highlight Words</Label><CopyBtn text={words}/>
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {words.split(',').map(w=>w.trim()).filter(Boolean).map((w,i)=>(
          <span key={i} style={{padding:'4px 12px',borderRadius:6,fontSize:13,fontWeight:600,
            background:'var(--green-dim)',border:'1px solid var(--green-border)',color:'var(--green)'}}>{w}</span>
        ))}
      </div>
    </Card>
  )
}

function LoadingSteps({ steps }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:16}}>
      {steps.map((s,i)=>(
        <div key={i} style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:6,height:6,borderRadius:'50%',background:'var(--green)',
            animation:'pulse 1.2s infinite',animationDelay:`${i*.3}s`}}/>
          <span style={{fontSize:13,color:'var(--text2)'}}>{s}</span>
        </div>
      ))}
    </div>
  )
}

function PostResult({ c, sources, post_id, outSettings, freshness, onApplyContent }) {
  const conf = { HIGH:'var(--green)', MEDIUM:'var(--amber)', LOW:'var(--red)' }
  return (
    <div>
      {c?.title && (
        <GreenCard style={{marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
            <div style={{flex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
                <Label>Title</Label>
                {c.confidence&&<span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,
                  background:'rgba(0,0,0,0.25)',color:conf[c.confidence]||'var(--text2)'}}>
                  {c.confidence}</span>}
                {freshness&&<span style={{fontSize:10,padding:'2px 7px',borderRadius:4,
                  background:'rgba(11,218,118,0.1)',color:'var(--green)',display:'flex',
                  alignItems:'center',gap:3}}><Calendar size={9}/>{FRESH_LABELS[freshness]||freshness}</span>}
                {c.title&&<span style={{fontSize:10,color:'var(--text3)'}}>{c.title.length} chars</span>}
              </div>
              <p style={{fontSize:17,fontWeight:700,lineHeight:1.4}}>{c.title}</p>
            </div>
            <CopyBtn text={c.title}/>
          </div>
        </GreenCard>
      )}
      {/* ── Send to Studio ─────────────────────────────────────── */}
      {onApplyContent && c?.title && (
        <div style={{marginBottom:16}}>
          <button
            onClick={() => onApplyContent({
              title:           c.title,
              highlight_words: c.highlight_words || '',
              caption:         c.caption         || '',
            })}
            style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'10px 20px', borderRadius:8,
              background:'var(--green)', border:'none',
              color:'#000', fontSize:13, fontWeight:700,
              cursor:'pointer', width:'100%', justifyContent:'center',
              transition:'opacity .15s',
            }}
            onMouseEnter={e=>e.currentTarget.style.opacity='.85'}
            onMouseLeave={e=>e.currentTarget.style.opacity='1'}
          >
            <PenTool size={14}/>
            Send to Design Studio
          </button>
          <p style={{fontSize:10,color:'var(--text3)',textAlign:'center',marginTop:5}}>
            Title + highlight words will be applied to the active canvas template
          </p>
        </div>
      )}
      <HighlightWords words={c?.highlight_words}/>
      {outSettings.include_hook     && <Block label="Hook Text"  value={c?.hook_text}/>}
      {outSettings.include_category && <Block label="Category"   value={c?.category}/>}
      <Block label="Caption"                  value={c?.caption}/>
      <Block label="Image Prompt — 16x9"      value={c?.image_prompt_16x9} mono/>
      {outSettings.include_9x16&&c?.image_prompt_9x16&&
        <Block label="Image Prompt — 9x16"    value={c.image_prompt_9x16} mono/>}
      {c?.sources_block&&(
        <Card style={{marginBottom:12}}>
          <Label>Verification Block</Label>
          <pre style={{fontSize:12,color:'var(--text2)',whiteSpace:'pre-wrap',lineHeight:1.7}}>
            {c.sources_block}</pre>
        </Card>
      )}
      {sources?.length>0&&(
        <Card>
          <Label>Web Sources</Label>
          {sources.map((s,i)=>(
            <div key={i} style={{marginBottom:5,display:'flex',alignItems:'flex-start',gap:8}}>
              <span style={{color:'var(--text3)',fontSize:12,minWidth:16}}>{i+1}.</span>
              <div>
                <p style={{fontSize:12,color:'var(--text)',marginBottom:1}}>{s.title}</p>
                <a href={s.url} target="_blank" rel="noreferrer"
                  style={{fontSize:11,color:'var(--green)',display:'flex',alignItems:'center',gap:3}}>
                  {s.url?.slice(0,60)}...<ExternalLink size={9}/>
                </a>
              </div>
            </div>
          ))}
        </Card>
      )}
      {post_id&&<p style={{fontSize:11,color:'var(--text3)',marginTop:8,textAlign:'right'}}>Saved — ID: {post_id}</p>}
    </div>
  )
}

export default function ContentGen({ onApplyContent }) {
  const [platform, setPlatform]         = useState('instagram')
  const [topic, setTopic]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [result, setResult]             = useState(null)
  const [error, setError]               = useState('')
  const [trendCat, setTrendCat]         = useState('GEOPOLITICS')
  const [trending, setTrending]         = useState([])
  const [trendLoading, setTrendLoading] = useState(false)
  const [showTrending, setShowTrending] = useState(false)
  const [mode, setMode]                 = useState('single')
  const [batchCount, setBatchCount]     = useState(3)
  // Progressive batch state
  const [batchResults, setBatchResults] = useState([])
  const [batchProgress, setBatchProgress] = useState({ active: false, current: 0, total: 0, topic: '' })
  const [batchAbort, setBatchAbort]     = useState(false)

  // Output settings — read from localStorage once on mount, not on every render.
  // Updates when the 'storageChange' event fires (dispatched by Settings page on save).
  const [outSettings, setOutSettings]   = useState(getOutSettings)
  const [personaSettings, setPersonaSettings] = useState(getPersonaSettings)
  useEffect(() => {
    const handler = () => {
      setOutSettings(getOutSettings())
      setPersonaSettings(getPersonaSettings())
    }
    window.addEventListener('storageChange', handler)
    return () => window.removeEventListener('storageChange', handler)
  }, [])

  async function fetchTrending() {
    const { freshness } = getOutSettings()
    setTrendLoading(true); setTrending([])
    const { data, error: err } = await apiPost('/api/trending', { category: trendCat, freshness })
    if (err) setError(err)
    else { setTrending(data.topics || []); setShowTrending(true) }
    setTrendLoading(false)
  }

  async function generate() {
    if (!topic.trim() || loading) return
    const out = getOutSettings()
    setLoading(true); setError(''); setResult(null)
    const { data, error: err } = await apiPost('/api/content/instagram', { topic, ...out })
    if (err) setError(err)
    else { setResult(data); setShowTrending(false) }
    setLoading(false)
  }

  // ── Progressive batch: fetch topics → generate one by one → render as each arrives ──
  async function runBatch() {
    const out = getOutSettings()
    setError(''); setBatchResults([])
    setBatchProgress({ active: true, current: 0, total: 0, topic: 'Fetching trending topics...' })
    setBatchAbort(false)

    // Step 1: fetch trending topics
    const { data: trendData, error: trendErr } = await apiPost('/api/trending',
      { category: trendCat, freshness: out.freshness })
    if (trendErr) {
      setError(trendErr)
      setBatchProgress({ active: false, current: 0, total: 0, topic: '' })
      return
    }
    const topics = (trendData?.topics || []).slice(0, batchCount)
    if (!topics.length) {
      setError(`No trending topics found for ${trendCat}. Try again.`)
      setBatchProgress({ active: false, current: 0, total: 0, topic: '' })
      return
    }

    // Step 2: generate each post individually — show results as they arrive
    let aborted = false
    setBatchProgress(p => ({ ...p, total: topics.length }))

    for (let i = 0; i < topics.length; i++) {
      if (aborted) break
      const t = topics[i]
      setBatchProgress({ active: true, current: i + 1, total: topics.length,
        topic: t.title?.slice(0, 60) + '...' })

      const { data, error: err } = await apiPost('/api/content/instagram',
        { topic: t.title, ...out })

      if (err) {
        setBatchResults(prev => [...prev, { error: err, original_topic: t.title }])
      } else {
        setBatchResults(prev => [...prev, {
          ...data, original_topic: t.title, source_url: t.url
        }])
      }

      // Read abort flag from ref-like state — user can stop mid-batch
      setBatchAbort(current => { if (current) { aborted = true } return current })
      await new Promise(r => setTimeout(r, 500)) // brief pause between posts
    }

    setBatchProgress({ active: false, current: 0, total: 0, topic: '' })
  }

  function stopBatch() { setBatchAbort(true) }

  return (
    <PageShell title="Content Generator" subtitle="Elite Mode v8.4">
      <div style={{maxWidth:840}}>

        {/* Platform */}
        <div style={{display:'flex',gap:8,marginBottom:18}}>
          {PLATFORMS.map(({id,label,icon:Icon,color,active})=>(
            <button key={id} onClick={()=>active&&setPlatform(id)} disabled={!active}
              style={{display:'flex',alignItems:'center',gap:8,padding:'8px 16px',borderRadius:8,
                fontSize:13,fontWeight:500,transition:'all .15s',cursor:active?'pointer':'not-allowed',
                border:platform===id&&active?`1px solid ${color}`:'1px solid var(--border)',
                background:platform===id&&active?`${color}15`:'transparent',
                color:active?(platform===id?color:'var(--text2)'):'var(--text3)'}}>
              <Icon size={14}/>{label}
              {!active&&<span style={{fontSize:10,color:'var(--text3)',marginLeft:2,
                display:'flex',alignItems:'center',gap:2}}><Lock size={9}/>soon</span>}
            </button>
          ))}
        </div>

        {/* Mode toggle + freshness */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
          {[['single','Single Post'],['batch','Batch']].map(([m,lbl])=>(
            <button key={m} onClick={()=>{ setMode(m); setResult(null); setBatchResults([]); setError('') }}
              style={{padding:'7px 16px',borderRadius:8,fontSize:13,border:'none',
                background:mode===m?'var(--green)':'var(--bg3)',
                color:mode===m?'#000':'var(--text2)',
                fontWeight:mode===m?600:400,cursor:'pointer',transition:'all .15s'}}>
              {lbl}
            </button>
          ))}
          <span style={{marginLeft:'auto',fontSize:11,color:'var(--text3)',
            display:'flex',alignItems:'center',gap:4}}>
            <Calendar size={11}/>
            {FRESH_LABELS[outSettings.freshness]||outSettings.freshness}
            <span style={{fontSize:10}}>· change in Settings</span>
          </span>
        </div>

        {/* Active persona badge strip */}
        {(() => {
          const p = PERSONA_LABELS[personaSettings.persona] || PERSONA_LABELS.journalist
          const toneLabel = personaSettings.tone?.charAt(0).toUpperCase() + personaSettings.tone?.slice(1)
          const platLabel = personaSettings.platform_target?.charAt(0).toUpperCase() + personaSettings.platform_target?.slice(1)
          const lenLabel  = personaSettings.caption_length?.charAt(0).toUpperCase() + personaSettings.caption_length?.slice(1)
          const hasCustom = personaSettings.custom_instructions?.trim().length > 0
          return (
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:16,flexWrap:'wrap'}}>
              <div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:20,
                fontSize:11,fontWeight:600,background:'var(--green-dim)',border:'1px solid var(--green-border)',
                color:'var(--green)'}}>
                <span>{p.emoji}</span><span>{p.label}</span>
              </div>
              <div style={{padding:'4px 10px',borderRadius:20,fontSize:11,
                background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text2)'}}>
                {toneLabel}
              </div>
              <div style={{padding:'4px 10px',borderRadius:20,fontSize:11,
                background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text2)'}}>
                {platLabel}
              </div>
              <div style={{padding:'4px 10px',borderRadius:20,fontSize:11,
                background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text2)'}}>
                {lenLabel}
              </div>
              {hasCustom && (
                <div style={{padding:'4px 10px',borderRadius:20,fontSize:11,
                  background:'rgba(139,92,246,0.1)',border:'1px solid rgba(139,92,246,0.25)',color:'#A78BFA'}}>
                  Custom rules
                </div>
              )}
              <span style={{fontSize:10,color:'var(--text3)',marginLeft:4}}>· edit in Settings → AI Persona</span>
            </div>
          )
        })()}

        {/* Trending picker */}
        <Card style={{marginBottom:16}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:showTrending?12:0}}>
            <TrendingUp size={14} style={{color:'var(--green)'}}/>
            <span style={{fontSize:13,fontWeight:500,flex:1}}>Trending topics</span>
            <select value={trendCat} onChange={e=>setTrendCat(e.target.value)} style={{
              padding:'5px 10px',borderRadius:6,border:'1px solid var(--border)',
              background:'var(--bg3)',color:'var(--text)',fontSize:12}}>
              {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            {mode==='batch'&&(
              <select value={batchCount} onChange={e=>setBatchCount(Number(e.target.value))} style={{
                padding:'5px 10px',borderRadius:6,border:'1px solid var(--border)',
                background:'var(--bg3)',color:'var(--text)',fontSize:12}}>
                {[1,2,3,5].map(n=><option key={n} value={n}>{n} posts</option>)}
              </select>
            )}
            {mode==='batch'&&batchProgress.active
              ? <Btn onClick={stopBatch} variant="secondary"
                  style={{padding:'6px 12px',fontSize:12,color:'var(--red)',
                    borderColor:'rgba(255,77,77,0.3)'}}>
                  <StopCircle size={11} style={{display:'inline',marginRight:5}}/>Stop
                </Btn>
              : <Btn onClick={mode==='batch'?runBatch:fetchTrending}
                  loading={mode==='batch'?batchProgress.active:trendLoading}
                  variant="secondary" style={{padding:'6px 12px',fontSize:12}}>
                  {mode==='batch'
                    ?<><Layers size={11} style={{display:'inline',marginRight:5}}/>Auto-Forge</>
                    :<><RefreshCw size={11} style={{display:'inline',marginRight:5}}/>Fetch</>}
                </Btn>
            }
          </div>
          {showTrending&&trending.length>0&&(
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {trending.map((t,i)=>(
                <div key={i} onClick={()=>{setTopic(t.title);setShowTrending(false)}}
                  style={{padding:'8px 12px',borderRadius:6,border:'1px solid var(--border)',
                    cursor:'pointer',background:'var(--bg3)',transition:'border .1s'}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='var(--green)'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                  <p style={{fontSize:13,color:'var(--text)',marginBottom:t.snippet?2:0}}>{t.title}</p>
                  {t.snippet&&<p style={{fontSize:11,color:'var(--text3)',lineHeight:1.5}}>{t.snippet}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Single input */}
        {mode==='single'&&(
          <div style={{display:'flex',gap:8,marginBottom:24}}>
            <Input value={topic} onChange={e=>setTopic(e.target.value)}
              placeholder="Topic — or click a trending story above"
              onKeyDown={e=>e.key==='Enter'&&generate()}/>
            <Btn onClick={generate} loading={loading} disabled={!topic.trim()}>
              <Zap size={14} style={{display:'inline',marginRight:6}}/>Forge
            </Btn>
          </div>
        )}

        <ErrorBox msg={error}/>

        {mode==='single'&&loading&&(
          <LoadingSteps steps={['Searching web...','Building context...','Forging...','Parsing blocks...']}/>
        )}

        {/* Progressive batch progress bar */}
        {mode==='batch'&&batchProgress.active&&(
          <div style={{marginBottom:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <span style={{fontSize:12,color:'var(--text2)'}}>
                Forging post {batchProgress.current} of {batchProgress.total}
              </span>
              <span style={{fontSize:11,color:'var(--text3)'}}>
                {Math.round((batchProgress.current/Math.max(batchProgress.total,1))*100)}%
              </span>
            </div>
            <div style={{height:3,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
              <div style={{height:'100%',background:'var(--green)',borderRadius:2,
                width:`${(batchProgress.current/Math.max(batchProgress.total,1))*100}%`,
                transition:'width .4s ease'}}/>
            </div>
            <p style={{fontSize:11,color:'var(--text3)',marginTop:6,
              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {batchProgress.topic}
            </p>
          </div>
        )}

        {/* Single result */}
        {mode==='single'&&result&&(
          <PostResult c={result.content} sources={result.sources}
            post_id={result.post_id} outSettings={outSettings} freshness={result.freshness}
            onApplyContent={onApplyContent}/>
        )}

        {/* Progressive batch results — appear one by one */}
        {mode==='batch'&&batchResults.length>0&&(
          <div>
            <p style={{fontSize:12,color:'var(--green)',marginBottom:16,fontWeight:600}}>
              {batchResults.filter(r=>!r.error).length} post{batchResults.filter(r=>!r.error).length!==1?'s':''} forged
              {batchProgress.active?' — more incoming...':' — done'}
            </p>
            {batchResults.map((r,i)=>(
              <div key={i} style={{marginBottom:32}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                  <div style={{width:24,height:24,borderRadius:6,flexShrink:0,
                    background:r.error?'rgba(255,77,77,0.15)':'var(--green)',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:12,fontWeight:700,color:r.error?'var(--red)':'#000'}}>{i+1}</div>
                  <span style={{fontSize:12,color:'var(--text2)',flex:1,
                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {r.original_topic?.slice(0,80)}
                  </span>
                </div>
                {r.error
                  ?<ErrorBox msg={r.error}/>
                  :<PostResult c={r.content||{}} sources={r.sources}
                      post_id={r.post_id} outSettings={outSettings} freshness={r.freshness}
                      onApplyContent={onApplyContent}/>
                }
                {i<batchResults.length-1&&(
                  <div style={{height:1,background:'var(--border)',margin:'24px 0'}}/>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
      {/* @keyframes pulse is defined globally in index.css — no inline duplicate needed */}
    </PageShell>
  )
}
