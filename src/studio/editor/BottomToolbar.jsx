/**
 * BottomToolbar.jsx — Figma-style floating toolbar
 *
 * Tools: Select | Shapes | Text | Frames | Icons | Elements | Image
 *
 * Frames panel: shape grid (basic, geometric, special, letters, digits)
 *   + custom size dialog
 * Icons panel: searchable icon grid from icons-data.js (Heroicons MIT)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { FRAME_SHAPES, LETTERS, DIGITS } from '../canvas/frames.js'
import { ICON_CATEGORIES, ALL_ICONS } from '../canvas/icons-data.js'
import FrameShapePreview from '../components/FrameShapePreview.jsx'
import IconPreview from '../components/IconPreview.jsx'

// ── Icon SVG helpers ──────────────────────────────────────────────────────────
const Ic=(d,s=18)=>({size=s,...p})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d={d}/></svg>

const PointerIcon =({size=18,...p})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 4l7.07 16.97 2.51-7.39 7.39-2.51L4 4z"/><path d="M13.5 13.5l5 5"/></svg>
const RectIcon    =({size=18,...p})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" {...p}><rect x="3" y="4" width="18" height="16" rx="1.5"/></svg>
const CircleIc    =({size=18,...p})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><circle cx="12" cy="12" r="9"/></svg>
const TextIc      =({size=18,...p})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 7V4h16v3"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg>
const ImgUpIc     =({size=18,...p})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
const FrameIc     =({size=18,...p})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/><rect x="1" y="1" width="4" height="4" rx="0.5" fill="currentColor"/><rect x="19" y="1" width="4" height="4" rx="0.5" fill="currentColor"/><rect x="1" y="19" width="4" height="4" rx="0.5" fill="currentColor"/><rect x="19" y="19" width="4" height="4" rx="0.5" fill="currentColor"/></svg>
const IconIc      =({size=18,...p})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
const CompIc      =({size=18,...p})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
const ChevD       =({size=8,...p})=><svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="3,4.5 6,7.5 9,4.5"/></svg>
const SearchIc    =({size=14,...p})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>

// Shape tool configurations
const SHAPES=[
  {id:'rect',label:'Rectangle',icon:RectIcon,shortcut:'R'},{id:'circle',label:'Circle',icon:CircleIc,shortcut:'O'},
  {id:'triangle',label:'Triangle'},{id:'star',label:'Star'},{id:'pentagon',label:'Pentagon'},
  {id:'hexagon',label:'Hexagon'},{id:'diamond',label:'Diamond'},{id:'arrow',label:'Arrow'},
  {id:'line',label:'Line',shortcut:'L'},{id:'accentline',label:'Accent Line'},
]
const TEXTS=[{id:'title',label:'Title',desc:'Large heading'},{id:'subtitle',label:'Subtitle',desc:'Secondary line'},{id:'tag',label:'Tag',desc:'Hashtag / label'},{id:'body',label:'Body Text',desc:'Plain paragraph'}]
const ELEMENTS=[{id:'logo',label:'Logo',desc:'Brand seal'},{id:'gradient',label:'Gradient Overlay',desc:'Fade overlay'},{id:'imagearea',label:'Image Area (old)',desc:'Plain photo placeholder'}]

// Frame size presets
const FRAME_PRESETS = [
  { label: '1:1 Square',     w: 500, h: 500 },
  { label: '4:5 Portrait',   w: 400, h: 500 },
  { label: '16:9 Wide',      w: 640, h: 360 },
  { label: '9:16 Story',     w: 360, h: 640 },
  { label: '3:4',            w: 375, h: 500 },
  { label: 'Full Width',     w: 900, h: 500 },
]

// ── FrameShapePreview and IconPreview are imported from ../components/ ──────
// (definitions removed — use the imported versions above)

function _UNUSED_FrameShapePreview({ shapeKey, size = 36 }) {
  const s = FRAME_SHAPES[shapeKey]
  if (!s) {
    // Letter / digit
    return (
      <div style={{ width: size, height: size, display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:'Impact,sans-serif', fontWeight:900, fontSize: size * 0.6, color:'var(--text2)',
        userSelect:'none' }}>
        {shapeKey}
      </div>
    )
  }
  // Render a tiny SVG approximation
  const svgMap = {
    rect:          <rect x="3" y="3" width="30" height="30" rx="0" fill="none" stroke="currentColor" strokeWidth="2"/>,
    'rounded-rect':<rect x="3" y="3" width="30" height="30" rx="6" fill="none" stroke="currentColor" strokeWidth="2"/>,
    circle:        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2"/>,
    ellipse:       <ellipse cx="18" cy="18" rx="15" ry="11" fill="none" stroke="currentColor" strokeWidth="2"/>,
    triangle:      <polygon points="18,4 33,32 3,32" fill="none" stroke="currentColor" strokeWidth="2"/>,
    diamond:       <polygon points="18,3 33,18 18,33 3,18" fill="none" stroke="currentColor" strokeWidth="2"/>,
    hexagon:       <polygon points="18,3 31,10.5 31,25.5 18,33 5,25.5 5,10.5" fill="none" stroke="currentColor" strokeWidth="2"/>,
    pentagon:      <polygon points="18,3 33,14 27,31 9,31 3,14" fill="none" stroke="currentColor" strokeWidth="2"/>,
    octagon:       <polygon points="11,3 25,3 33,11 33,25 25,33 11,33 3,25 3,11" fill="none" stroke="currentColor" strokeWidth="2"/>,
    star:          <polygon points="18,3 21,13 31,13 23,19 26,30 18,24 10,30 13,19 5,13 15,13" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
    'star-4':      <polygon points="18,3 20,14 31,16 20,18 18,29 16,18 5,16 16,14" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
    cross:         <path d="M14,3 h8 v11 h11 v8 h-11 v11 h-8 v-11 h-11 v-8 h11 z" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
    heart:         <path d="M18,28 C18,28 5,20 5,12 C5,8 8,5 12,5 C14.5,5 16.5,6 18,8 C19.5,6 21.5,5 24,5 C28,5 31,8 31,12 C31,20 18,28 18,28 Z" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
    shield:        <path d="M18,3 L31,9 L31,17 C31,24 24,30 18,33 C12,30 5,24 5,17 L5,9 Z" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
    speech:        <path d="M5,5 h26 a2,2 0 0 1 2,2 v16 a2,2 0 0 1-2,2 h-18 l-5,5 l0,-5 h-3 a2,2 0 0 1-2,-2 v-16 a2,2 0 0 1 2,-2 Z" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
    arrow:         <polygon points="3,13 18,13 18,5 33,18 18,31 18,23 3,23" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
    badge:         <polygon points="18,3 21,6 25,5 27,8 31,9 31,13 34,16 32,19 33,23 30,25 29,29 25,29 22,32 18,31 14,32 11,29 7,29 6,25 3,23 4,19 2,16 5,13 5,9 9,8 11,5 15,6" fill="none" stroke="currentColor" strokeWidth="1"/>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" style={{ color:'var(--text2)' }}>
      {svgMap[shapeKey] || <rect x="3" y="3" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2"/>}
    </svg>
  )
}

function _UNUSED_IconPreview({ icon, size = 20, color = 'currentColor' }) {
  const paths = Array.isArray(icon.path) ? icon.path : [icon.path]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => <path key={i} d={d}/>)}
    </svg>
  )
}

export default function BottomToolbar({ activeTool, onToolChange, canvasRef, zoom, onZoomChange, onZoomFit }) {
  const fileInputRef  = useRef(null)
  const frameFileRef  = useRef(null)
  const barRef        = useRef(null)
  const [openDropdown, setOpenDropdown]   = useState(null)
  const [iconSearch,   setIconSearch]     = useState('')
  const [iconCategory, setIconCategory]   = useState('all')
  const [frameSize,    setFrameSize]      = useState({ w: 500, h: 500 })
  const [showCustom,   setShowCustom]     = useState(false)
  const [frameTab,     setFrameTab]       = useState('basic') // basic | geometric | special | letters | digits

  useEffect(() => {
    const h=(e)=>{if(barRef.current&&!barRef.current.contains(e.target)){setOpenDropdown(null);setShowCustom(false)}}
    document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h)
  },[])

  const toggle=(id)=>setOpenDropdown(p=>p===id?null:id)

  const addShape=useCallback((id)=>{
    const h=canvasRef.current; if(!h) return
    const map={rect:()=>h.addRect(),circle:()=>h.addCircle(),triangle:()=>h.addTriangle(),
      star:()=>h.addStar(),pentagon:()=>h.addPentagon(),hexagon:()=>h.addHexagon(),
      diamond:()=>h.addDiamond(),arrow:()=>h.addArrow(),line:()=>h.addLine(),accentline:()=>h.addAccentLine()}
    map[id]?.(); setOpenDropdown(null); onToolChange('select')
  },[canvasRef, onToolChange])

  const addText=useCallback((id)=>{
    const h=canvasRef.current; if(!h) return
    const map={title:()=>h.addTitle(),subtitle:()=>h.addSubtitle(),tag:()=>h.addTag(),body:()=>h.addText()}
    map[id]?.(); setOpenDropdown(null); onToolChange('select')
  },[canvasRef, onToolChange])

  const addElement=useCallback((id)=>{
    const h=canvasRef.current; if(!h) return
    const map={logo:()=>h.addLogo(),gradient:()=>h.addGradientOverlay(),imagearea:()=>h.addImageArea()}
    map[id]?.(); setOpenDropdown(null); onToolChange('select')
  },[canvasRef, onToolChange])

  const addFrameWithShape = useCallback((shapeKey, w, h) => {
    canvasRef.current?.addFrameShape(shapeKey, w, h)
    setOpenDropdown(null); onToolChange('select')
  }, [canvasRef, onToolChange])

  const addIcon = useCallback((iconData) => {
    canvasRef.current?.addIconToCanvas(iconData)
    setOpenDropdown(null); onToolChange('select')
  }, [canvasRef, onToolChange])

  // Keyboard shortcuts
  useEffect(()=>{
    const down=(e)=>{
      const tag=e.target?.tagName; if(['INPUT','TEXTAREA','SELECT'].includes(tag)) return
      if(e.metaKey||e.ctrlKey||e.altKey) return
      const k=e.key.toLowerCase()
      if(k==='v'){e.preventDefault();onToolChange('select')}
      else if(k==='r'){e.preventDefault();addShape('rect')}
      else if(k==='o'){e.preventDefault();addShape('circle')}
      else if(k==='l'){e.preventDefault();addShape('line')}
      else if(k==='t'){e.preventDefault();addText('body')}
      else if(k==='i'){e.preventDefault();fileInputRef.current?.click()}
      else if(k==='f'){e.preventDefault();toggle('frames')}
    }
    window.addEventListener('keydown',down); return()=>window.removeEventListener('keydown',down)
  },[addShape, addText, onToolChange])

  // Filtered icons
  const filteredIcons = ALL_ICONS.filter(icon => {
    const matchCat   = iconCategory === 'all' || icon.category === iconCategory
    const matchSearch = !iconSearch || icon.label.toLowerCase().includes(iconSearch.toLowerCase())
    return matchCat && matchSearch
  })

  // Frame shape keys by tab
  const basicShapes     = ['rect','rounded-rect','circle','ellipse']
  const geometricShapes = ['triangle','diamond','hexagon','pentagon','octagon','star','star-4','cross']
  const specialShapes   = ['heart','shield','speech','arrow','badge']

  const TOOLS=[
    {id:'select',  icon:PointerIcon, label:'Select',   shortcut:'V'},
    {id:'shape',   icon:RectIcon,    label:'Shapes',   shortcut:'R', hasDropdown:true},
    {id:'text',    icon:TextIc,      label:'Text',     shortcut:'T', hasDropdown:true},
    {id:'frames',  icon:FrameIc,     label:'Frames',   shortcut:'F', hasDropdown:true},
    {id:'icons',   icon:IconIc,      label:'Icons',    shortcut:'',  hasDropdown:true},
    {id:'elements',icon:CompIc,      label:'Elements', shortcut:'',  hasDropdown:true},
    {id:'image',   icon:ImgUpIc,     label:'Image',    shortcut:'I'},
  ]

  const Panel=({title,children,wide=false,tall=false})=>(
    <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50
      bg-[#080808] backdrop-blur-3xl border border-elite-600/40 rounded-xl shadow-2xl shadow-black py-1
      ${wide?'w-[340px]':tall?'w-72':'w-48'}`}>
      {title&&<div className="px-3 py-1.5 border-b border-elite-600/20">
        <span className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">{title}</span>
      </div>}
      <div className="py-0.5 max-h-[420px] overflow-y-auto">{children}</div>
    </div>
  )
  const Item=({children,onClick})=>(
    <button onClick={onClick} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-warm-muted hover:text-warm hover:bg-accent/8 transition-colors cursor-pointer">{children}</button>
  )

  return (
    <>
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={(e)=>{const f=e.target.files?.[0];if(f&&canvasRef.current)canvasRef.current.addImageFromFile(f);if(fileInputRef.current)fileInputRef.current.value='';onToolChange('select')}}
        className="hidden"/>

      <div ref={barRef} className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 bg-elite-800/95 backdrop-blur-xl rounded-2xl px-1.5 py-1 border border-elite-600/30 shadow-2xl shadow-black/50">
        {TOOLS.map(tool=>{
          const TIc=tool.icon; const isActive=activeTool===tool.id||openDropdown===tool.id
          return (
            <div key={tool.id} className="relative">
              <button onClick={()=>{
                if(tool.id==='image'){fileInputRef.current?.click();return}
                if(tool.hasDropdown){toggle(tool.id);return}
                onToolChange(tool.id); setOpenDropdown(null)
              }} title={`${tool.label}${tool.shortcut?` (${tool.shortcut})`:''}`}
                className={`relative flex items-center justify-center gap-0.5 w-10 h-10 rounded-xl transition-all duration-150 cursor-pointer group
                  ${isActive?'bg-accent/15 text-accent':'text-warm-muted hover:text-warm hover:bg-elite-700/60'}`}>
                <TIc size={20}/>{tool.hasDropdown&&<span className="absolute bottom-0.5 right-0.5 opacity-50"><ChevD/></span>}
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-elite-700 text-warm text-[10px] px-2.5 py-1 rounded-lg font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity border border-elite-600/40 shadow-lg">
                  {tool.label}{tool.shortcut&&<span className="ml-1.5 text-warm-faint font-mono text-[9px]">{tool.shortcut}</span>}
                </span>
              </button>

              {/* ── Shape dropdown ────────────────────────────────────── */}
              {tool.id==='shape'&&openDropdown==='shape'&&(
                <Panel title="Shapes & Lines">
                  {SHAPES.map(s=>{const SI=s.icon||RectIcon;return(
                    <Item key={s.id} onClick={()=>addShape(s.id)}>
                      {s.icon?<SI size={16}/>:<CircleIc size={16}/>}
                      <span className="flex-1 text-[11px]">{s.label}</span>
                      {s.shortcut&&<kbd className="text-[9px] text-warm-faint font-mono bg-elite-700/60 px-1.5 py-0.5 rounded">{s.shortcut}</kbd>}
                    </Item>
                  )})}
                </Panel>
              )}

              {/* ── Text dropdown ──────────────────────────────────────── */}
              {tool.id==='text'&&openDropdown==='text'&&(
                <Panel title="Text">
                  {TEXTS.map(t=><Item key={t.id} onClick={()=>addText(t.id)}><TextIc size={14}/><div className="flex-1"><div className="text-[11px]">{t.label}</div><div className="text-[9px] text-warm-faint">{t.desc}</div></div></Item>)}
                </Panel>
              )}

              {/* ── Frames dropdown ────────────────────────────────────── */}
              {tool.id==='frames'&&openDropdown==='frames'&&(
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-[340px]
                  bg-[#080808] border border-elite-600/40 rounded-xl shadow-2xl shadow-black">

                  {/* Header + size presets */}
                  <div className="px-3 pt-2.5 pb-2 border-b border-elite-600/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">Frames</span>
                      <span className="text-[9px] text-warm-faint">Double-click frame to add image</span>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {FRAME_PRESETS.map(p=>(
                        <button key={p.label} onClick={()=>setFrameSize({w:p.w,h:p.h})}
                          className={`text-[9px] px-2 py-1 rounded-md border transition-colors cursor-pointer
                            ${frameSize.w===p.w&&frameSize.h===p.h?'bg-accent/15 border-accent/30 text-accent':'border-elite-600/40 text-warm-faint hover:text-warm hover:border-warm-faint'}`}>
                          {p.label}
                        </button>
                      ))}
                      <button onClick={()=>setShowCustom(!showCustom)}
                        className="text-[9px] px-2 py-1 rounded-md border border-elite-600/40 text-warm-faint hover:text-warm hover:border-warm-faint transition-colors cursor-pointer">
                        Custom…
                      </button>
                    </div>
                    {showCustom&&(
                      <div className="flex items-center gap-2 mt-2">
                        <input type="number" value={frameSize.w} onChange={e=>setFrameSize(s=>({...s,w:parseInt(e.target.value)||s.w}))}
                          className="w-16 bg-elite-700 border border-elite-600/40 rounded px-2 py-1 text-[11px] text-warm outline-none focus:border-accent/60 text-center"
                          placeholder="W"/>
                        <span className="text-warm-faint text-xs">×</span>
                        <input type="number" value={frameSize.h} onChange={e=>setFrameSize(s=>({...s,h:parseInt(e.target.value)||s.h}))}
                          className="w-16 bg-elite-700 border border-elite-600/40 rounded px-2 py-1 text-[11px] text-warm outline-none focus:border-accent/60 text-center"
                          placeholder="H"/>
                        <span className="text-[10px] text-warm-faint">{frameSize.w}×{frameSize.h}px</span>
                      </div>
                    )}
                  </div>

                  {/* Shape tabs */}
                  <div className="flex border-b border-elite-600/20">
                    {[['basic','Basic'],['geometric','Geo'],['special','Special'],['letters','A–Z'],['digits','0–9']].map(([id,lbl])=>(
                      <button key={id} onClick={()=>setFrameTab(id)}
                        className={`flex-1 py-1.5 text-[10px] font-medium transition-colors cursor-pointer
                          ${frameTab===id?'text-accent border-b-2 border-accent':'text-warm-faint hover:text-warm'}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>

                  {/* Shape grid */}
                  <div className="p-2 max-h-[200px] overflow-y-auto">
                    {frameTab === 'basic' && (
                      <div className="grid grid-cols-4 gap-1.5">
                        {basicShapes.map(key=>(
                          <button key={key} onClick={()=>addFrameWithShape(key,frameSize.w,frameSize.h)}
                            title={FRAME_SHAPES[key]?.label}
                            className="flex flex-col items-center gap-1 p-2 rounded-lg border border-elite-600/30 hover:border-accent/40 hover:bg-accent/8 transition-all cursor-pointer group">
                            <FrameShapePreview shapeKey={key} size={32}/>
                            <span className="text-[8px] text-warm-faint group-hover:text-accent truncate w-full text-center">{FRAME_SHAPES[key]?.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {frameTab === 'geometric' && (
                      <div className="grid grid-cols-4 gap-1.5">
                        {geometricShapes.map(key=>(
                          <button key={key} onClick={()=>addFrameWithShape(key,frameSize.w,frameSize.h)}
                            title={FRAME_SHAPES[key]?.label}
                            className="flex flex-col items-center gap-1 p-2 rounded-lg border border-elite-600/30 hover:border-accent/40 hover:bg-accent/8 transition-all cursor-pointer group">
                            <FrameShapePreview shapeKey={key} size={32}/>
                            <span className="text-[8px] text-warm-faint group-hover:text-accent truncate w-full text-center">{FRAME_SHAPES[key]?.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {frameTab === 'special' && (
                      <div className="grid grid-cols-4 gap-1.5">
                        {specialShapes.map(key=>(
                          <button key={key} onClick={()=>addFrameWithShape(key,frameSize.w,frameSize.h)}
                            title={FRAME_SHAPES[key]?.label}
                            className="flex flex-col items-center gap-1 p-2 rounded-lg border border-elite-600/30 hover:border-accent/40 hover:bg-accent/8 transition-all cursor-pointer group">
                            <FrameShapePreview shapeKey={key} size={32}/>
                            <span className="text-[8px] text-warm-faint group-hover:text-accent truncate w-full text-center">{FRAME_SHAPES[key]?.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {frameTab === 'letters' && (
                      <div className="grid grid-cols-7 gap-1">
                        {LETTERS.map(ch=>(
                          <button key={ch} onClick={()=>addFrameWithShape(ch,frameSize.w,frameSize.h)}
                            className="w-9 h-9 flex items-center justify-center rounded-lg border border-elite-600/30 hover:border-accent/40 hover:bg-accent/8 text-warm-muted hover:text-accent transition-all cursor-pointer font-bold text-[14px]"
                            style={{fontFamily:'Impact,sans-serif'}}>
                            {ch}
                          </button>
                        ))}
                      </div>
                    )}
                    {frameTab === 'digits' && (
                      <div className="grid grid-cols-5 gap-1.5">
                        {DIGITS.map(ch=>(
                          <button key={ch} onClick={()=>addFrameWithShape(ch,frameSize.w,frameSize.h)}
                            className="h-10 flex items-center justify-center rounded-lg border border-elite-600/30 hover:border-accent/40 hover:bg-accent/8 text-warm-muted hover:text-accent transition-all cursor-pointer font-bold text-[18px]"
                            style={{fontFamily:'Impact,sans-serif'}}>
                            {ch}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Icons dropdown ─────────────────────────────────────── */}
              {tool.id==='icons'&&openDropdown==='icons'&&(
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-[340px]
                  bg-[#080808] border border-elite-600/40 rounded-xl shadow-2xl shadow-black">

                  {/* Search + category filter */}
                  <div className="p-2 border-b border-elite-600/20 space-y-1.5">
                    <div className="flex items-center gap-2 bg-elite-700 border border-elite-600/40 rounded-lg px-2.5 py-1.5">
                      <SearchIc size={13} className="text-warm-faint flex-shrink-0"/>
                      <input value={iconSearch} onChange={e=>setIconSearch(e.target.value)}
                        placeholder="Search icons…"
                        className="flex-1 bg-transparent text-[11px] text-warm placeholder-warm-faint outline-none min-w-0"/>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {[{id:'all',label:'All'},...ICON_CATEGORIES.map(c=>({id:c.id,label:c.label}))].map(cat=>(
                        <button key={cat.id} onClick={()=>setIconCategory(cat.id)}
                          className={`text-[9px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer
                            ${iconCategory===cat.id?'bg-accent/15 border-accent/30 text-accent':'border-elite-600/40 text-warm-faint hover:text-warm'}`}>
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Icon grid */}
                  <div className="p-2 max-h-[260px] overflow-y-auto">
                    {filteredIcons.length === 0 ? (
                      <p className="text-[11px] text-warm-faint text-center py-4">No icons found</p>
                    ) : (
                      <div className="grid grid-cols-7 gap-1">
                        {filteredIcons.map(icon=>(
                          <button key={icon.id} onClick={()=>addIcon(icon)} title={icon.label}
                            className="w-10 h-10 flex items-center justify-center rounded-lg border border-elite-600/30 hover:border-accent/40 hover:bg-accent/8 text-warm-muted hover:text-accent transition-all cursor-pointer group">
                            <IconPreview icon={icon} size={18}/>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-1.5 border-t border-elite-600/20">
                    <p className="text-[9px] text-warm-faint">Heroicons MIT • {filteredIcons.length} icons</p>
                  </div>
                </div>
              )}

              {/* ── Elements dropdown ──────────────────────────────────── */}
              {tool.id==='elements'&&openDropdown==='elements'&&(
                <Panel title="Elements">
                  {ELEMENTS.map(el=><Item key={el.id} onClick={()=>addElement(el.id)}><CompIc size={14}/><div className="flex-1"><div className="text-[11px]">{el.label}</div><div className="text-[9px] text-warm-faint">{el.desc}</div></div></Item>)}
                </Panel>
              )}
            </div>
          )
        })}
      </div>

      {/* Zoom strip */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-0 bg-elite-800/90 backdrop-blur-xl rounded-xl border border-elite-600/30 shadow-xl shadow-black/40 overflow-hidden">
        <button onClick={()=>onZoomChange(Math.max(10,zoom-10))} className="w-9 h-9 flex items-center justify-center text-warm-muted hover:text-warm hover:bg-elite-700/60 transition-colors cursor-pointer text-sm font-medium">−</button>
        <span className="w-12 text-center text-[11px] text-warm-muted font-mono select-none">{zoom}%</span>
        <button onClick={()=>onZoomChange(Math.min(500,zoom+10))} className="w-9 h-9 flex items-center justify-center text-warm-muted hover:text-warm hover:bg-elite-700/60 transition-colors cursor-pointer text-sm font-medium">+</button>
        <div className="w-px h-5 bg-elite-600/30"/>
        <button onClick={onZoomFit} className="px-3 h-9 flex items-center justify-center text-[11px] text-warm-muted font-semibold tracking-wide hover:text-warm hover:bg-elite-700/60 transition-colors cursor-pointer uppercase">FIT</button>
      </div>
    </>
  )
}
