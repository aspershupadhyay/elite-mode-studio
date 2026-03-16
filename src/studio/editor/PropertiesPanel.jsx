import { useState, useEffect, useMemo, useRef } from 'react'
import * as fabric from 'fabric'
import { FONT_REGISTRY, FONT_CATEGORIES, loadGoogleFont } from '../data/fonts.js'
import { MoveIcon, MaximizeIcon, SunIcon, DropletIcon,
         AlignLeftIcon, AlignCenterIcon, AlignRightIcon,
         BoldIcon, ItalicIcon, UnderlineIcon, ChevronDownIcon } from '../icons/Icons.jsx'
import { loadFileIntoFrame, refitFrame } from '../canvas/frames.js'

const COLOR_PALETTE=['#FFFFFF','#EAEAEA','#CCCCCC','#999999','#666666','#444444','#222222','#111111',
  '#FF4444','#FF6B6B','#FF8C42','#FFA62F','#FFD93D','#FFE066','#B8F2E6','#AED9E0',
  '#4488FF','#5C7AEA','#8B5CF6','#A78BFA','#C084FC','#E879F9','#F472B6','#FB7185',
  '#0BDA76','#34D399','#2DD4BF','#22D3EE','#38BDF8','#60A5FA','#818CF8','#A78BFA',
  '#10B981','#059669','#047857','#065F46','#064E3B','#F59E0B','#D97706','#B45309',]
const BG_PALETTE=['#111111','#1A1A1A','#0A0A0A','#181818','#1E1E1E','#222222','#2A2A2A','#333333',
  '#0D1117','#161B22','#1C2128','#0E131A','#141A23','#112240','#1A2744','#0A192F',
  '#1B1B2F','#162447','#241b2f','#2D132C','#1F0C29','#0c0c1d','#100e1e','#141022',
  '#FFFFFF','#F5F5F5','#FAFAFA','#F0F0F0','#E8E8E8','#0BDA76','#0FA968','#0D8B56',]

const Section=({icon,title,children})=>(
  <div><div className="flex items-center gap-1.5 mb-1.5">{icon&&<span className="text-warm-faint">{icon}</span>}<label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">{title}</label></div>{children}</div>
)
const NumInput=({label,value,onChange})=>(
  <div className="flex items-center bg-elite-800 border border-elite-600/40 rounded overflow-hidden">
    <span className="px-2 text-[10px] text-warm-faint font-mono bg-elite-850 py-1.5 border-r border-elite-600/30">{label}</span>
    <input type="number" value={value} onChange={e=>onChange(parseInt(e.target.value)||0)}
      className="flex-1 bg-transparent px-2 py-1.5 text-[11px] text-warm font-mono outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
  </div>
)
const StyleToggle=({icon,active,onClick})=>(
  <button onClick={onClick} className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-all duration-100 ${active?'bg-accent/15 text-accent':'text-warm-faint hover:text-warm hover:bg-elite-700'}`}>{icon}</button>
)
const ColorSwatch=({color,active,onClick,onEnter,onLeave})=>(
  <button onClick={onClick} onMouseEnter={onEnter} onMouseLeave={onLeave}
    className={`w-full aspect-square rounded-sm border cursor-pointer transition-all duration-100 hover:scale-110 ${active?'border-accent ring-1 ring-accent/50 scale-110':'border-elite-600/30 hover:border-warm-faint'}`}
    style={{backgroundColor:color}} title={color}/>
)

export default function PropertiesPanel({ selectedObject, canvas, canvasRef }) {
  const [props, setProps] = useState({
    left:0,top:0,width:0,height:0,fill:'#EAEAEA',fontSize:72,fontWeight:'800',
    fontFamily:'Inter',text:'',opacity:1,charSpacing:0,lineHeight:1.15,
    textAlign:'left',fontStyle:'normal',underline:false,stroke:'',strokeWidth:0,rx:0,
  })
  const [bgColor, setBgColor] = useState('#111111')
  const [fontSearch, setFontSearch] = useState('')
  const [showFontPicker, setShowFontPicker] = useState(false)
  const [showWeightPicker, setShowWeightPicker] = useState(false)
  const [gradTopColor, setGradTopColor] = useState('rgba(17,17,17,0)')
  const [gradBottomColor, setGradBottomColor] = useState('rgba(17,17,17,1)')
  const [gradOpacity, setGradOpacity] = useState(1)
  const logoInputRef  = useRef(null)
  const frameFileRef  = useRef(null)

  // Frame-specific state — synced from selected frame object
  const [frameFitMode,   setFrameFitMode]   = useState('fill')
  const [frameOffsetX,   setFrameOffsetX]   = useState(0)
  const [frameOffsetY,   setFrameOffsetY]   = useState(0)
  const [frameImgScale,  setFrameImgScale]  = useState(1)
  const [frameHasImage,  setFrameHasImage]  = useState(false)

  useEffect(()=>{if(canvas){const bg=(canvas).backgroundColor||'#111111';if(typeof bg==='string')setBgColor(bg)}},[canvas,selectedObject])
  useEffect(()=>{
    if(!selectedObject) return
    const fill=selectedObject.fill
    let fillStr='#EAEAEA'
    if(typeof fill==='string') fillStr=fill
    else if(fill===null||fill===undefined) fillStr='transparent'
    setProps({
      left:Math.round(selectedObject.left||0), top:Math.round(selectedObject.top||0),
      width:Math.round((selectedObject.width||0)*(selectedObject.scaleX||1)),
      height:Math.round((selectedObject.height||0)*(selectedObject.scaleY||1)),
      fill:fillStr, fontSize:(selectedObject).fontSize||72,
      fontWeight:(selectedObject).fontWeight||'400',
      fontFamily:((selectedObject).fontFamily||'Inter').replace(/, sans-serif/g,''),
      text:(selectedObject).text||'', opacity:selectedObject.opacity??1,
      charSpacing:(selectedObject).charSpacing||0, lineHeight:(selectedObject).lineHeight||1.15,
      textAlign:(selectedObject).textAlign||'left', fontStyle:(selectedObject).fontStyle||'normal',
      underline:(selectedObject).underline||false,
      stroke:(typeof selectedObject.stroke==='string'?selectedObject.stroke:'')||'',
      strokeWidth:selectedObject.strokeWidth||0, rx:(selectedObject).rx||0,
    })
    if((selectedObject).eliteType==='gradient'&&fill instanceof fabric.Gradient){
      const stops=(fill).colorStops||[]
      if(stops.length>=2){setGradTopColor(stops[0].color||'rgba(17,17,17,0)');setGradBottomColor(stops[1].color||'rgba(17,17,17,1)')}
      setGradOpacity(selectedObject.opacity??1)
    }
    // Sync frame properties
    if((selectedObject).eliteType==='frame'){
      setFrameFitMode(selectedObject.eliteFitMode||'fill')
      setFrameOffsetX(selectedObject.eliteImageOffsetX||0)
      setFrameOffsetY(selectedObject.eliteImageOffsetY||0)
      setFrameImgScale(selectedObject.eliteImageScale||1)
      setFrameHasImage(!!selectedObject.eliteImageSrc||!!selectedObject._eliteImageEl)
    }
  }, [selectedObject])

  const update=(key,value)=>{
    if(!selectedObject||!canvas) return
    if(key==='width') selectedObject.set('scaleX',value/(selectedObject.width||1))
    else if(key==='height') selectedObject.set('scaleY',value/(selectedObject.height||1))
    else if(key==='rx'){
      const sX=selectedObject.scaleX||1, sY=selectedObject.scaleY||1
      selectedObject.set({rx:value/sX,ry:value/sY})
      if(selectedObject.clipPath) selectedObject.clipPath.set({rx:value/sX,ry:value/sY})
    } else selectedObject.set(key,value)
    selectedObject.dirty=true; canvas.renderAll(); setProps(p=>({...p,[key]:value}))
  }
  const preview=(key,value)=>{
    if(!selectedObject||!canvas) return
    if(key==='fontFamily'){loadGoogleFont(value);selectedObject.set('fontFamily',`${value}, sans-serif`)}
    else selectedObject.set(key,value)
    selectedObject.dirty=true; canvas.renderAll()
  }
  const clearPreview=(key)=>{
    if(!selectedObject||!canvas) return
    const orig=props[key]
    if(key==='fontFamily') selectedObject.set('fontFamily',`${orig}, sans-serif`)
    else selectedObject.set(key,orig)
    selectedObject.dirty=true; canvas.renderAll()
  }
  const updateGradient=(top,bot)=>{
    if(!selectedObject||!canvas||(selectedObject).eliteType!=='gradient') return
    const h=(selectedObject.height||100)*(selectedObject.scaleY||1)
    selectedObject.set('fill',new fabric.Gradient({type:'linear',coords:{x1:0,y1:0,x2:0,y2:h},
      colorStops:[{offset:0,color:top},{offset:1,color:bot}]}))
    canvas.renderAll(); setGradTopColor(top); setGradBottomColor(bot)
  }
  const updateBgColor=(color)=>{setBgColor(color);canvasRef.current?.setCanvasBg(color)}

  // ── Frame helpers ─────────────────────────────────────────────────────────
  const applyFrameFit = (mode) => {
    if (!selectedObject || selectedObject.eliteType !== 'frame') return
    selectedObject.eliteFitMode = mode
    refitFrame(selectedObject)
    canvas?.renderAll()
    setFrameFitMode(mode)
  }
  const applyFrameOffset = (dx, dy) => {
    if (!selectedObject || selectedObject.eliteType !== 'frame') return
    selectedObject.eliteImageOffsetX = dx
    selectedObject.eliteImageOffsetY = dy
    refitFrame(selectedObject)
    canvas?.renderAll()
    setFrameOffsetX(dx); setFrameOffsetY(dy)
  }
  const applyFrameScale = (scale) => {
    if (!selectedObject || selectedObject.eliteType !== 'frame') return
    selectedObject.eliteImageScale = scale
    refitFrame(selectedObject)
    canvas?.renderAll()
    setFrameImgScale(scale)
  }
  const replaceFrameImage = (file) => {
    if (!selectedObject || selectedObject.eliteType !== 'frame') return
    loadFileIntoFrame(selectedObject, file, () => {
      canvas?.renderAll()
      setFrameHasImage(true)
    })
  }
  const clearFrameImg = () => {
    if (!selectedObject || selectedObject.eliteType !== 'frame' || !canvas) return
    canvasRef.current?.clearFrameImage(selectedObject)
    setFrameHasImage(false)
    setFrameOffsetX(0); setFrameOffsetY(0); setFrameImgScale(1)
  }
  const resetFramePan = () => applyFrameOffset(0, 0)

  const filteredFonts=useMemo(()=>{
    if(!fontSearch) return FONT_REGISTRY
    const q=fontSearch.toLowerCase(); return FONT_REGISTRY.filter(f=>f.family.toLowerCase().includes(q))
  },[fontSearch])

  const eliteType=(selectedObject)?.eliteType||''
  const isText=selectedObject instanceof fabric.Textbox||selectedObject instanceof fabric.FabricText
  const isImage=eliteType==='image'||selectedObject instanceof fabric.FabricImage
  const isFrame=eliteType==='frame'
  const isIcon=eliteType==='icon'
  const isGroup=selectedObject instanceof fabric.Group&&!(selectedObject instanceof fabric.ActiveSelection)
  const isLogo=eliteType==='logo', isGradient=eliteType==='gradient'
  const hasStringFill=typeof selectedObject?.fill==='string'
  const isShape=['shape','line','image_area'].includes(eliteType)
  const supportsRadius=!isFrame&&(isImage||isLogo||(selectedObject?.type==='rect'&&!['gradient','line','accent_line'].includes(eliteType)))

  // Empty state — canvas bg
  if(!selectedObject) return (
    <div className="w-full h-full bg-elite-900 border-l border-elite-600/25 flex flex-col overflow-hidden select-none">
      <div className="px-4 py-3 border-b border-elite-600/25">
        <h3 className="text-[11px] font-semibold text-accent uppercase tracking-widest">Canvas</h3>
        <span className="text-[10px] text-warm-faint">Background & settings</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <Section icon={<DropletIcon/>} title="Card Background">
          <div className="flex items-center gap-2 mb-2">
            <input type="color" value={bgColor} onChange={e=>updateBgColor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5"/>
            <input type="text" value={bgColor} onChange={e=>updateBgColor(e.target.value)}
              className="flex-1 bg-elite-800 border border-elite-600/40 rounded px-2 py-1 text-[11px] text-warm font-mono focus:border-accent/60 outline-none"/>
          </div>
          <div className="grid grid-cols-8 gap-1">
            {BG_PALETTE.map((c,i)=><ColorSwatch key={i} color={c} active={bgColor.toLowerCase()===c.toLowerCase()} onClick={()=>updateBgColor(c)}/>)}
          </div>
        </Section>
        <p className="text-[11px] text-warm-faint text-center pt-4">Select an element to edit its properties</p>
      </div>
    </div>
  )

  return (
    <div className="w-full h-full bg-elite-900 border-l border-elite-600/25 flex flex-col overflow-hidden select-none">
      <div className="px-4 py-3 border-b border-elite-600/25">
        <h3 className="text-[11px] font-semibold text-accent uppercase tracking-widest">{(selectedObject).eliteLabel||'Element'}</h3>
        <span className="text-[10px] text-warm-faint">{eliteType}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <Section icon={<MoveIcon/>} title="Position">
          <div className="grid grid-cols-2 gap-2"><NumInput label="X" value={props.left} onChange={v=>update('left',v)}/><NumInput label="Y" value={props.top} onChange={v=>update('top',v)}/></div>
        </Section>
        <Section icon={<MaximizeIcon/>} title="Size">
          <div className="grid grid-cols-2 gap-2"><NumInput label="W" value={props.width} onChange={v=>update('width',v)}/><NumInput label="H" value={props.height} onChange={v=>update('height',v)}/></div>
        </Section>
        {supportsRadius&&(
          <Section title="Corner Radius">
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={Math.min(props.width,props.height)/2||100} step={1} value={props.rx||0} onChange={e=>update('rx',parseInt(e.target.value))} className="flex-1 accent-accent h-1"/>
              <div className="w-16"><NumInput label="R" value={props.rx||0} onChange={v=>update('rx',v)}/></div>
            </div>
          </Section>
        )}
        <Section icon={<SunIcon/>} title="Opacity">
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={1} step={0.01} value={props.opacity} onChange={e=>update('opacity',parseFloat(e.target.value))} className="flex-1 accent-accent h-1"/>
            <span className="text-[10px] text-warm-faint font-mono w-8 text-right">{Math.round(props.opacity*100)}%</span>
          </div>
        </Section>
        {!isGradient&&!isImage&&!isFrame&&!isIcon&&(
          <Section icon={<DropletIcon/>} title="Fill">
            <div className="flex items-center gap-2 mb-2">
              <input type="color" value={hasStringFill?props.fill:'#1A1A1A'} onChange={e=>update('fill',e.target.value)} className="w-7 h-7 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5"/>
              <input type="text" value={hasStringFill?props.fill:'gradient'} onChange={e=>update('fill',e.target.value)} className="flex-1 bg-elite-800 border border-elite-600/40 rounded px-2 py-1 text-[11px] text-warm font-mono focus:border-accent/60 outline-none"/>
              <button onClick={()=>update('fill','transparent')} className="px-2 py-1 text-[10px] text-warm-faint bg-elite-800 border border-elite-600/40 rounded hover:border-accent/40 cursor-pointer" title="No fill">∅</button>
            </div>
            <div className="grid grid-cols-8 gap-1">{COLOR_PALETTE.map((c,i)=><ColorSwatch key={i} color={c} active={props.fill.toLowerCase()===c.toLowerCase()} onClick={()=>update('fill',c)} onEnter={()=>preview('fill',c)} onLeave={()=>clearPreview('fill')}/>)}</div>
          </Section>
        )}
        {(isShape||eliteType==='shape'||isLogo||isImage)&&!isFrame&&!isIcon&&(
          <Section title="Stroke">
            <div className="flex items-center gap-2 mb-2 w-full">
              <input type="color" value={props.stroke||'#0BDA76'} onChange={e=>update('stroke',e.target.value)} className="w-7 h-7 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5 shrink-0"/>
              <input type="text" value={props.stroke||'#0BDA76'} onChange={e=>update('stroke',e.target.value)} className="flex-1 min-w-0 bg-elite-800 border border-elite-600/40 rounded px-2 py-1 text-[11px] text-warm font-mono focus:border-accent/60 outline-none uppercase"/>
              <div className="w-16 shrink-0"><NumInput label="W" value={props.strokeWidth||0} onChange={v=>update('strokeWidth',v)}/></div>
              <button onClick={()=>{update('stroke','transparent');update('strokeWidth',0)}} className="px-2 py-1 text-[10px] text-warm-faint bg-elite-800 border border-elite-600/40 rounded hover:border-accent/40 cursor-pointer shrink-0" title="No stroke">∅</button>
            </div>
          </Section>
        )}

        {isGradient&&(
          <Section title="Gradient Colors">
            <div className="space-y-2">
              {[[gradTopColor,'Top',0],[gradBottomColor,'Bottom',1]].map(([color,label])=>(
                <div key={label} className="flex items-center gap-2">
                  <span className="text-[10px] text-warm-faint w-10">{label}</span>
                  <input type="color" value="#111111" onChange={e=>{
                    const v=e.target.value; const r=parseInt(v.slice(1,3),16),g=parseInt(v.slice(3,5),16),b=parseInt(v.slice(5,7),16)
                    const rgba=`rgba(${r},${g},${b},${label==='Top'?0:1})`
                    if(label==='Top')updateGradient(rgba,gradBottomColor); else updateGradient(gradTopColor,rgba)
                  }} className="w-6 h-6 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5"/>
                  <span className="text-[10px] text-warm-faint flex-1 font-mono">{color}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] text-warm-faint w-10">Fade</span>
                <input type="range" min={0} max={1} step={0.05} value={gradOpacity}
                  onChange={e=>{const v=parseFloat(e.target.value);setGradOpacity(v);update('opacity',v)}} className="flex-1 accent-accent h-1"/>
                <span className="text-[10px] text-warm-faint font-mono w-8 text-right">{Math.round(gradOpacity*100)}%</span>
              </div>
            </div>
          </Section>
        )}
        {isLogo&&(
          <Section title="Logo Image">
            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden"
              onChange={e=>{
                const file=e.target.files?.[0]
                if(file&&selectedObject&&canvas){
                  const reader=new FileReader()
                  reader.onload=(ev)=>{
                    const imgEl=new Image()
                    imgEl.onload=()=>{
                      const obj=selectedObject
                      const targetW=(obj.width||120)*(obj.scaleX||1)
                      const targetH=(obj.height||120)*(obj.scaleY||1)
                      const scale=Math.min(targetW/imgEl.width,targetH/imgEl.height)
                      const tx=(targetW-imgEl.width*scale)/2
                      const ty=(targetH-imgEl.height*scale)/2
                      const pattern=new fabric.Pattern({source:imgEl,repeat:'no-repeat'})
                      pattern.patternTransform=[scale,0,0,scale,tx,ty]
                      const logoRect=new fabric.Rect({
                        left:obj.left,top:obj.top,width:targetW,height:targetH,
                        originX:obj.originX||'center',originY:obj.originY||'center',
                        fill:pattern,stroke:'#0BDA76',strokeWidth:0,
                        rx:obj.rx||0,ry:obj.ry||0,
                      })
                      logoRect.eliteType='logo'
                      logoRect.eliteLabel=file.name.replace(/\.[^/.]+$/,'')||'Logo'
                      logoRect.rawW=imgEl.width; logoRect.rawH=imgEl.height
                      canvas.remove(obj)
                      canvas.add(logoRect)
                      canvas.setActiveObject(logoRect)
                      canvas.renderAll()
                    }
                    imgEl.src=ev.target.result
                  }
                  reader.readAsDataURL(file)
                }
                e.target.value=''
              }}/>
            <button onClick={()=>logoInputRef.current?.click()}
              className="w-full py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent text-[11px] font-semibold hover:bg-accent/20 transition-colors cursor-pointer">
              Replace Logo Image
            </button>
            <p className="text-[9px] text-warm-faint mt-1 text-center">PNG, JPEG, SVG or WebP — replaces the seal</p>
          </Section>
        )}
        {/* ── FRAME PROPERTIES ──────────────────────────────────────── */}
        {isFrame&&(
          <>
            {/* Hidden file picker for replacing frame image */}
            <input ref={frameFileRef} type="file" accept="image/*" className="hidden"
              onChange={e=>{ const f=e.target.files?.[0]; if(f) replaceFrameImage(f); e.target.value='' }}/>

            {/* Frame info banner */}
            <div className="flex items-center gap-2 px-2.5 py-2 bg-accent/8 border border-accent/20 rounded-lg">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent flex-shrink-0">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-accent font-semibold">{selectedObject.eliteFrameShape?.toUpperCase() || 'Frame'}</p>
                <p className="text-[9px] text-warm-faint">{selectedObject.eliteFrameW}×{selectedObject.eliteFrameH}px · {frameHasImage ? 'Image loaded' : 'No image — double-click to add'}</p>
              </div>
            </div>

            {/* Image actions */}
            <Section title="Image">
              <div className="flex gap-2">
                <button onClick={()=>frameFileRef.current?.click()}
                  className="flex-1 py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent text-[11px] font-semibold hover:bg-accent/20 transition-colors cursor-pointer">
                  {frameHasImage ? 'Replace' : '+ Add Image'}
                </button>
                {frameHasImage&&(
                  <button onClick={clearFrameImg}
                    className="px-3 py-2 rounded-lg bg-elite-700 border border-elite-600/40 text-warm-faint text-[11px] hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/8 transition-colors cursor-pointer">
                    Clear
                  </button>
                )}
              </div>
            </Section>

            {/* Fit mode */}
            <Section title="Fit Mode">
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id:'fill',    label:'Fill',     desc:'Cover entire frame', icon:'M3 3h18v18H3z' },
                  { id:'fit',     label:'Fit',      desc:'Show whole image',   icon:'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3' },
                  { id:'stretch', label:'Stretch',  desc:'Distort to fit',     icon:'M5 9V5m0 0h4M5 5l5 5m9-1V5m0 0h-4m4 0l-5 5M5 15v4m0 0h4m-4 0l5-5m9 5l-5-5m5 5v-4m0 4h-4' },
                  { id:'none',    label:'Original', desc:'Natural size',       icon:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6v4l3 3' },
                ].map(m=>(
                  <button key={m.id} onClick={()=>applyFrameFit(m.id)}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all cursor-pointer text-left
                      ${frameFitMode===m.id ? 'bg-accent/12 border-accent/40 text-accent' : 'bg-elite-800 border-elite-600/40 text-warm-faint hover:border-warm-faint hover:text-warm'}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                      {m.icon.split('M').filter(Boolean).map((d,i)=><path key={i} d={`M${d}`}/>)}
                    </svg>
                    <div>
                      <p className="text-[10px] font-semibold leading-none">{m.label}</p>
                      <p className="text-[9px] opacity-60 mt-0.5">{m.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </Section>

            {/* Pan / crop — only relevant when fill or none mode is active */}
            {(frameFitMode === 'fill' || frameFitMode === 'none') && frameHasImage && (
              <Section title="Crop / Pan">
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-warm-faint">Horizontal</span>
                      <span className="text-[10px] text-warm-faint font-mono">{frameOffsetX}px</span>
                    </div>
                    <input type="range" min={-500} max={500} step={5} value={frameOffsetX}
                      onChange={e=>applyFrameOffset(parseInt(e.target.value),frameOffsetY)}
                      className="w-full accent-accent h-1 cursor-pointer"/>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-warm-faint">Vertical</span>
                      <span className="text-[10px] text-warm-faint font-mono">{frameOffsetY}px</span>
                    </div>
                    <input type="range" min={-500} max={500} step={5} value={frameOffsetY}
                      onChange={e=>applyFrameOffset(frameOffsetX,parseInt(e.target.value))}
                      className="w-full accent-accent h-1 cursor-pointer"/>
                  </div>
                  {(frameOffsetX !== 0 || frameOffsetY !== 0) && (
                    <button onClick={resetFramePan}
                      className="text-[10px] text-warm-faint hover:text-warm cursor-pointer transition-colors">
                      ↺ Reset pan to center
                    </button>
                  )}
                </div>
              </Section>
            )}

            {/* Image zoom within frame */}
            {frameHasImage && (
              <Section title="Image Zoom">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-warm-faint">Scale</span>
                    <span className="text-[10px] text-warm-faint font-mono">{Math.round(frameImgScale * 100)}%</span>
                  </div>
                  <input type="range" min={0.25} max={4} step={0.05} value={frameImgScale}
                    onChange={e=>applyFrameScale(parseFloat(e.target.value))}
                    className="w-full accent-accent h-1 cursor-pointer"/>
                  <div className="flex justify-between text-[9px] text-warm-faint mt-0.5">
                    <span>25%</span><span>100%</span><span>400%</span>
                  </div>
                </div>
              </Section>
            )}

            {/* Tip */}
            <div className="px-2.5 py-2 bg-elite-700/40 rounded-lg">
              <p className="text-[9px] text-warm-faint leading-relaxed">
                <span className="text-warm-muted font-medium">Tips: </span>
                Double-click frame on canvas to add/swap image · Drag an image from your files directly onto the frame · Use Pan to adjust crop position
              </p>
            </div>
          </>
        )}

        {/* ── ICON PROPERTIES ───────────────────────────────────────── */}
        {isIcon&&!isFrame&&(
          <Section title="Icon Color & Size">
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-warm-faint uppercase tracking-widest block mb-1">Stroke Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={props.stroke||'#0BDA76'} onChange={e=>update('stroke',e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5"/>
                  <input type="text" value={props.stroke||'#0BDA76'} onChange={e=>update('stroke',e.target.value)}
                    className="flex-1 bg-elite-800 border border-elite-600/40 rounded px-2 py-1 text-[11px] text-warm font-mono focus:border-accent/60 outline-none uppercase"/>
                </div>
                <div className="grid grid-cols-8 gap-1 mt-2">
                  {COLOR_PALETTE.map((c,i)=><ColorSwatch key={i} color={c} active={props.stroke?.toLowerCase()===c.toLowerCase()} onClick={()=>update('stroke',c)}/>)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-warm-faint w-16">Thickness</span>
                <input type="range" min={0.5} max={5} step={0.25} value={props.strokeWidth||1.5}
                  onChange={e=>update('strokeWidth',parseFloat(e.target.value))}
                  className="flex-1 accent-accent h-1"/>
                <span className="text-[10px] text-warm-faint font-mono w-8 text-right">{props.strokeWidth||1.5}px</span>
              </div>
              <div>
                <label className="text-[10px] text-warm-faint uppercase tracking-widest block mb-1">Fill</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={props.fill&&props.fill!=='transparent'?props.fill:'#000000'} onChange={e=>update('fill',e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5"/>
                  <input type="text" value={props.fill||'transparent'} onChange={e=>update('fill',e.target.value)}
                    className="flex-1 bg-elite-800 border border-elite-600/40 rounded px-2 py-1 text-[11px] text-warm font-mono focus:border-accent/60 outline-none"/>
                  <button onClick={()=>update('fill','transparent')}
                    className="px-2 py-1 text-[10px] text-warm-faint bg-elite-800 border border-elite-600/40 rounded hover:border-accent/40 cursor-pointer" title="No fill">∅</button>
                </div>
              </div>
            </div>
          </Section>
        )}

        {isGroup&&!isLogo&&!isFrame&&(
          <Section title="Group">
            <button onClick={()=>canvasRef.current?.ungroupSelected()}
              className="w-full py-2 rounded-lg bg-elite-700 border border-elite-600/30 text-warm text-[11px] font-semibold hover:bg-elite-600/50 transition-colors cursor-pointer">
              Ungroup Elements
            </button>
          </Section>
        )}
        {isText&&(
          <>
            <Section title="Font">
              <div className="relative">
                <button onClick={()=>setShowFontPicker(!showFontPicker)}
                  className="w-full flex items-center justify-between bg-elite-800 border border-elite-600/40 rounded px-2.5 py-1.5 hover:border-accent/40 transition-colors cursor-pointer">
                  <span className="text-[11px] text-warm truncate" style={{fontFamily:`'${props.fontFamily}', sans-serif`}}>{props.fontFamily}</span>
                  <ChevronDownIcon size={12} className="text-warm-faint flex-shrink-0"/>
                </button>
                {showFontPicker&&(
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-elite-800 border border-elite-600/50 rounded-lg shadow-xl shadow-black/50 max-h-[320px] flex flex-col">
                    <div className="p-2 border-b border-elite-600/30">
                      <input type="text" value={fontSearch} onChange={e=>setFontSearch(e.target.value)} placeholder="Search fonts..."
                        className="w-full bg-elite-700 border border-elite-600/40 rounded px-2 py-1.5 text-[11px] text-warm placeholder-warm-faint outline-none focus:border-accent/50"/>
                    </div>
                    <div className="flex-1 overflow-y-auto py-1">
                      {FONT_CATEGORIES.map(cat=>{
                        const fonts=filteredFonts.filter(f=>f.category===cat); if(!fonts.length) return null
                        return (<div key={cat}>
                          <div className="px-3 pt-2 pb-1 text-[9px] font-semibold text-warm-faint uppercase tracking-widest">{cat}</div>
                          {fonts.map(font=>(
                            <button key={font.family} onClick={()=>{update('fontFamily',font.family);setShowFontPicker(false);setFontSearch('')}}
                              onMouseEnter={()=>preview('fontFamily',font.family)} onMouseLeave={()=>clearPreview('fontFamily')}
                              className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors cursor-pointer ${props.fontFamily===font.family?'text-accent bg-accent/8':'text-warm-muted hover:text-warm hover:bg-elite-700/60'}`}
                              style={{fontFamily:`'${font.family}', sans-serif`}}>{font.family}</button>
                          ))}
                        </div>)
                      })}
                    </div>
                  </div>
                )}
              </div>
            </Section>
            <div className="grid grid-cols-2 gap-2">
              <Section title="Size"><NumInput label="px" value={props.fontSize} onChange={v=>update('fontSize',v)}/></Section>
              <Section title="Weight">
                <div className="relative">
                  <button onClick={()=>setShowWeightPicker(!showWeightPicker)}
                    className="w-full flex items-center justify-between bg-elite-800 border border-elite-600/40 rounded px-2.5 py-1.5 hover:border-accent/40 transition-colors cursor-pointer text-[11px] text-warm">
                    <span>{({'100':'Thin','200':'ExtraLight','300':'Light','400':'Regular','500':'Medium','600':'SemiBold','700':'Bold','800':'ExtraBold','900':'Black'}[props.fontWeight]||'Regular')}</span>
                    <ChevronDownIcon size={12} className="text-warm-faint flex-shrink-0"/>
                  </button>
                  {showWeightPicker&&(
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-elite-800 border border-elite-600/50 rounded-lg shadow-xl shadow-black/50 max-h-[250px] overflow-y-auto py-1">
                      {[['100','Thin'],['200','ExtraLight'],['300','Light'],['400','Regular'],['500','Medium'],['600','SemiBold'],['700','Bold'],['800','ExtraBold'],['900','Black']].map(([v,l])=>(
                        <button key={v} onClick={()=>{update('fontWeight',v);setShowWeightPicker(false)}}
                          onMouseEnter={()=>preview('fontWeight',v)} onMouseLeave={()=>clearPreview('fontWeight')}
                          className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors cursor-pointer ${props.fontWeight===v?'text-accent bg-accent/8':'text-warm-muted hover:text-warm hover:bg-elite-700/60'}`}
                          style={{fontWeight:v}}>{l}</button>
                      ))}
                    </div>
                  )}
                </div>
              </Section>
            </div>
            <Section title="Style">
              <div className="flex gap-1">
                <StyleToggle icon={<BoldIcon/>} active={parseInt(props.fontWeight)>=700} onClick={()=>update('fontWeight',parseInt(props.fontWeight)>=700?'400':'700')}/>
                <StyleToggle icon={<ItalicIcon/>} active={props.fontStyle==='italic'} onClick={()=>update('fontStyle',props.fontStyle==='italic'?'normal':'italic')}/>
                <StyleToggle icon={<UnderlineIcon/>} active={props.underline} onClick={()=>update('underline',!props.underline)}/>
                <div className="w-px h-6 bg-elite-600/30 mx-1 self-center"/>
                <StyleToggle icon={<AlignLeftIcon/>}   active={props.textAlign==='left'}   onClick={()=>update('textAlign','left')}/>
                <StyleToggle icon={<AlignCenterIcon/>} active={props.textAlign==='center'} onClick={()=>update('textAlign','center')}/>
                <StyleToggle icon={<AlignRightIcon/>}  active={props.textAlign==='right'}  onClick={()=>update('textAlign','right')}/>
              </div>
            </Section>
            <Section title="Letter Spacing">
              <div className="flex items-center gap-2">
                <input type="range" min={-100} max={400} step={10} value={props.charSpacing} onChange={e=>update('charSpacing',parseInt(e.target.value))} className="flex-1 accent-accent h-1"/>
                <span className="text-[10px] text-warm-faint font-mono w-8 text-right">{props.charSpacing}</span>
              </div>
            </Section>
            <Section title="Line Height">
              <div className="flex items-center gap-2">
                <input type="range" min={0.8} max={3.0} step={0.05} value={props.lineHeight} onChange={e=>update('lineHeight',parseFloat(e.target.value))} className="flex-1 accent-accent h-1"/>
                <span className="text-[10px] text-warm-faint font-mono w-8 text-right">{props.lineHeight.toFixed(2)}</span>
              </div>
            </Section>
            <Section title="Content">
              <textarea value={props.text} onChange={e=>update('text',e.target.value)} rows={3}
                className="w-full bg-elite-800 border border-elite-600/40 rounded px-2.5 py-2 text-[11px] text-warm font-mono resize-none focus:border-accent/60 outline-none leading-relaxed"
                placeholder="Your text or {{variable}}"/>
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
