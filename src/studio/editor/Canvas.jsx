/**
 * Canvas.jsx — Fabric.js design surface
 *
 * Architecture overview:
 *   constants.js  – colour tokens + getAccentColor()
 *   defaults.js   – addDefaultElements(), buildHighlightStyles()
 *   clipboard.js  – pasteFromSystemClipboard()  ← NEW: paste images/text from web
 *
 * The component exposes every canvas operation through useImperativeHandle so
 * parent components (DesignStudio, Toolbar, BottomToolbar, ContextMenu …) can
 * call them via a ref without prop-drilling callbacks.
 */

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import * as fabric from 'fabric'
import { BG, TEXT_PRIMARY, TEXT_MUTED, SURFACE, ELITE_CUSTOM_PROPS, getAccentColor } from '../canvas/constants.js'
import { addDefaultElements, buildHighlightStyles } from '../canvas/defaults.js'
import { pasteFromSystemClipboard, copyToSystemClipboard } from '../canvas/clipboard.js'
import { FRAME_SHAPES, LETTERS, DIGITS, addFrame, applyImageToFrame, refitFrame, clearFrameImage, loadFileIntoFrame, findFrameAtPoint, highlightFrame, clearFrameHighlight } from '../canvas/frames.js'
import { findSnaps, applySnap, buildResizeGuides } from '../canvas/snapping.js'

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const DesignCanvas = forwardRef(({ width, height, onSelectionChange, onHistoryChange, onContextMenu, onGuidesChange, onPanChange, onZoomChange, rulerGuides }, ref) => {

  // ── Refs ────────────────────────────────────────────────────────────────────
  const canvasRef    = useRef(null)   // <canvas> DOM element
  const fabricRef    = useRef(null)   // Fabric.Canvas instance
  const containerRef = useRef(null)   // outer scroll/pan container div

  // History
  const historyRef   = useRef([])
  const historyIdx   = useRef(-1)
  const isRestoring  = useRef(false)

  // Internal Fabric clipboard (Cmd+C / Cmd+V within the canvas)
  const internalClipRef = useRef(null)

  // Deleted objects recyclable via the Layer panel recycle bin
  const deletedLayersRef = useRef([])

  // Pan / zoom
  const isPanning    = useRef(false)
  const isSpaceDown  = useRef(false)
  const lastMouse    = useRef({ x: 0, y: 0 })

  // ── Ref mirrors for zoom/pan ─────────────────────────────────────────────
  // React state (zoom, pan) drives rendering but cannot be read inside
  // stale event-handler closures that were created on mount.
  // These refs are always current and safe to read in any callback.
  const zoomRef = useRef(0.8)
  const panRef  = useRef({ x: 0, y: 0 })

  // Frame currently highlighted during a drag-over operation (OS file drag)
  const dragOverFrameRef = useRef(null)

  // Frame highlighted when a canvas image object is dragged over it
  const canvasImgDragFrameRef = useRef(null)

  // Latest ruler guides (ref mirror to avoid stale closures in canvas event handlers)
  const rulerGuidesRef = useRef(rulerGuides)
  useEffect(() => { rulerGuidesRef.current = rulerGuides }, [rulerGuides])

  // Latest onPanChange callback (ref mirror)
  const onPanChangeRef = useRef(onPanChange)
  useEffect(() => { onPanChangeRef.current = onPanChange }, [onPanChange])

  // Latest onZoomChange callback (ref mirror)
  const onZoomChangeRef = useRef(onZoomChange)
  useEffect(() => { onZoomChangeRef.current = onZoomChange }, [onZoomChange])

  // Live accent — updated by updateAccentColor() when Appearance settings change
  const accentRef = useRef(getAccentColor())
  const getAccent = () => accentRef.current

  // ── State ───────────────────────────────────────────────────────────────────
  const [zoom, setZoomState] = useState(0.8)
  const [pan,  setPan]       = useState({ x: 0, y: 0 })

  // ─────────────────────────────────────────────────────────────────────────────
  // HISTORY
  // ─────────────────────────────────────────────────────────────────────────────

  const saveHistory = useCallback(() => {
    const c = fabricRef.current
    if (!c || isRestoring.current) return
    const json = JSON.stringify(c.toJSON(ELITE_CUSTOM_PROPS))
    historyRef.current = historyRef.current.slice(0, historyIdx.current + 1)
    historyRef.current.push(json)
    historyIdx.current = historyRef.current.length - 1
    if (historyRef.current.length > 50) { historyRef.current.shift(); historyIdx.current-- }
    onHistoryChange()
  }, [onHistoryChange])

  const restoreFromHistory = useCallback(() => {
    const c    = fabricRef.current; if (!c) return
    const json = historyRef.current[historyIdx.current]; if (!json) return
    isRestoring.current = true
    c.loadFromJSON(JSON.parse(json)).then(() => {
      c.renderAll()
      isRestoring.current = false
      onSelectionChange(null)
      setTimeout(() => onHistoryChange(), 30)
    })
  }, [onSelectionChange, onHistoryChange])

  const undo = useCallback(() => {
    if (historyIdx.current <= 0) return
    historyIdx.current--; restoreFromHistory()
  }, [restoreFromHistory])

  const redo = useCallback(() => {
    if (historyIdx.current >= historyRef.current.length - 1) return
    historyIdx.current++; restoreFromHistory()
  }, [restoreFromHistory])

  // ─────────────────────────────────────────────────────────────────────────────
  // ZOOM & PAN
  // ─────────────────────────────────────────────────────────────────────────────

  const calculateZoom = useCallback(() => {
    requestAnimationFrame(() => {
      if (!containerRef.current) return
      const cw = containerRef.current.clientWidth  - 100
      const ch = containerRef.current.clientHeight - 140
      if (cw <= 0 || ch <= 0) return
      const newZoom = Math.max(0.1, Math.min(cw / width, ch / height, 0.6))
      setZoomState(newZoom)
      zoomRef.current = newZoom          // keep ref in sync
      const zeroPan = { x: 0, y: 0 }
      setPan(zeroPan)
      panRef.current = zeroPan           // keep ref in sync
      onPanChangeRef.current?.(zeroPan)
      onZoomChangeRef.current?.(Math.round(newZoom * 100))  // keep parent zoom in sync
    })
  }, [width, height])

  // ─────────────────────────────────────────────────────────────────────────────
  // SHAPE TOOLS
  // Each function creates a Fabric object, assigns eliteType/eliteLabel,
  // adds it to the canvas and saves a history snapshot.
  // ─────────────────────────────────────────────────────────────────────────────

  const addText = useCallback(() => {
    const c = fabricRef.current; if (!c) return
    const t = new fabric.Textbox('Your text', {
      left:80, top:Math.round(height*0.5), width:width-160,
      fontSize:64, fill:TEXT_PRIMARY, fontFamily:'Inter, sans-serif',
      fontWeight:'700', textAlign:'left', lineHeight:1.2, editable:true,
    })
    t.eliteType='text'; t.eliteLabel='Text'
    c.add(t); c.setActiveObject(t); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])

  const addRect = useCallback(() => {
    const c = fabricRef.current; if (!c) return
    const r = new fabric.Rect({ left:width*0.2, top:height*0.3, width:width*0.3, height:height*0.15,
      fill:SURFACE, stroke:getAccent(), strokeWidth:2, strokeUniform:true, rx:8, ry:8 })
    r.eliteType='shape'; r.eliteLabel='Rectangle'
    c.add(r); c.setActiveObject(r); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])

  const addCircle = useCallback(() => {
    const c = fabricRef.current; if (!c) return
    const o = new fabric.Circle({ left:width*0.35, top:height*0.35,
      radius:Math.min(width,height)*0.08, fill:SURFACE, stroke:getAccent(), strokeWidth:2, strokeUniform:true })
    o.eliteType='shape'; o.eliteLabel='Circle'
    c.add(o); c.setActiveObject(o); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])

  const addLine = useCallback(() => {
    const c = fabricRef.current; if (!c) return
    const l = new fabric.Line([width*0.15, height*0.5, width*0.85, height*0.5],
      { stroke:getAccent(), strokeWidth:3, strokeUniform:true, strokeLineCap:'round' })
    l.eliteType='line'; l.eliteLabel='Line'
    c.add(l); c.setActiveObject(l); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])

  const addTriangle = useCallback(() => {
    const c = fabricRef.current; if (!c) return
    const t = new fabric.Triangle({ left:width*0.35, top:height*0.3, width:width*0.15, height:height*0.15,
      fill:SURFACE, stroke:getAccent(), strokeWidth:2, strokeUniform:true })
    t.eliteType='shape'; t.eliteLabel='Triangle'
    c.add(t); c.setActiveObject(t); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])

  // Polygon helper used by star, pentagon, hexagon, diamond, arrow
  const _makePolygon = useCallback((pts, label) => {
    const c = fabricRef.current; if (!c) return
    const s = new fabric.Polygon(pts, { left:width*0.35, top:height*0.3,
      fill:SURFACE, stroke:getAccent(), strokeWidth:2, strokeUniform:true })
    s.eliteType='shape'; s.eliteLabel=label
    c.add(s); c.setActiveObject(s); c.renderAll(); saveHistory()
  }, [width, height, saveHistory])

  const addStar     = useCallback(() => {
    const r=Math.min(width,height)*0.08, pts=[]
    for(let i=0;i<10;i++){const a=(Math.PI/5)*i-Math.PI/2; pts.push({x:(i%2?r*0.45:r)*Math.cos(a),y:(i%2?r*0.45:r)*Math.sin(a)})}
    _makePolygon(pts,'Star')
  },[_makePolygon, width, height])
  const addPentagon = useCallback(()=>_makePolygon(Array.from({length:5},(_,i)=>({x:Math.min(width,height)*0.08*Math.cos((2*Math.PI/5)*i-Math.PI/2),y:Math.min(width,height)*0.08*Math.sin((2*Math.PI/5)*i-Math.PI/2)})),'Pentagon'),[_makePolygon,width,height])
  const addHexagon  = useCallback(()=>_makePolygon(Array.from({length:6},(_,i)=>({x:Math.min(width,height)*0.08*Math.cos((Math.PI/3)*i),y:Math.min(width,height)*0.08*Math.sin((Math.PI/3)*i)})),'Hexagon'),[_makePolygon,width,height])
  const addDiamond  = useCallback(()=>{const s=Math.min(width,height)*0.1;_makePolygon([{x:0,y:-s},{x:s,y:0},{x:0,y:s},{x:-s,y:0}],'Diamond')},[_makePolygon,width,height])
  const addArrow    = useCallback(()=>_makePolygon([{x:0,y:-30},{x:60,y:-30},{x:60,y:-60},{x:120,y:0},{x:60,y:60},{x:60,y:30},{x:0,y:30}],'Arrow'),[_makePolygon])

  // ─────────────────────────────────────────────────────────────────────────────
  // TEXT TOOLS
  // ─────────────────────────────────────────────────────────────────────────────

  const addTitle = useCallback(() => {
    const c=fabricRef.current; if(!c) return
    const t=new fabric.Textbox('Your Title',{left:48,top:Math.round(height*0.56),width:width-96,
      fontSize:72,fill:TEXT_PRIMARY,fontFamily:'Inter, sans-serif',fontWeight:'800',textAlign:'left',lineHeight:1.12,charSpacing:20,editable:true})
    t.eliteType='title'; t.eliteLabel='Title'
    c.add(t); c.setActiveObject(t); c.renderAll(); saveHistory()
  },[width,height,saveHistory])

  const addSubtitle = useCallback(() => {
    const c=fabricRef.current; if(!c) return
    const t=new fabric.Textbox('Subtitle text here',{left:48,top:Math.round(height*0.76),width:width-96,
      fontSize:26,fill:TEXT_MUTED,fontFamily:'Inter, sans-serif',fontWeight:'400',textAlign:'left',lineHeight:1.4,editable:true})
    t.eliteType='text'; t.eliteLabel='Subtitle'
    c.add(t); c.setActiveObject(t); c.renderAll(); saveHistory()
  },[width,height,saveHistory])

  const addTag = useCallback(() => {
    const c=fabricRef.current; if(!c) return
    const t=new fabric.Textbox('#tag',{left:48,top:height-80,width:200,
      fontSize:16,fill:getAccent(),fontFamily:'Inter, sans-serif',fontWeight:'600',editable:true})
    t.eliteType='tag'; t.eliteLabel='Tag'
    c.add(t); c.setActiveObject(t); c.renderAll(); saveHistory()
  },[height,saveHistory])

  // ─────────────────────────────────────────────────────────────────────────────
  // ELEMENT TOOLS (composite objects)
  // ─────────────────────────────────────────────────────────────────────────────

  const addAccentLine = useCallback(() => {
    const c=fabricRef.current; if(!c) return
    const l=new fabric.Rect({left:0,top:height-6,width,height:6,fill:getAccent()})
    l.eliteType='line'; l.eliteLabel='Accent Line'
    c.add(l); c.setActiveObject(l); c.renderAll(); saveHistory()
  },[width,height,saveHistory])

  const addLogo = useCallback(() => {
    const c=fabricRef.current; if(!c) return
    const r=Math.round(width*0.055), A=getAccent()
    const outer=new fabric.Circle({radius:r+4,fill:'transparent',stroke:A,strokeWidth:3,strokeUniform:true,originX:'center',originY:'center',left:0,top:0})
    const inner=new fabric.Circle({radius:r,fill:'#1A1A1A',stroke:A+'44',strokeWidth:1,strokeUniform:true,originX:'center',originY:'center',left:0,top:0})
    const txt  =new fabric.Text('EM',{fontSize:Math.round(r*0.8),fill:A,fontFamily:'Inter, sans-serif',fontWeight:'700',originX:'center',originY:'center',left:0,top:0})
    const g    =new fabric.Group([outer,inner,txt],{left:width/2,top:height*0.5,originX:'center',originY:'center'})
    g.eliteType='logo'; g.eliteLabel='Logo'
    c.add(g); c.setActiveObject(g); c.renderAll(); saveHistory()
  },[width,height,saveHistory])

  const addGradientOverlay = useCallback(() => {
    const c=fabricRef.current; if(!c) return
    const gH=Math.round(height*0.12)
    const rect=new fabric.Rect({left:0,top:Math.round(height*0.55)-gH,width,height:gH,strokeWidth:0})
    rect.set('fill',new fabric.Gradient({type:'linear',coords:{x1:0,y1:0,x2:0,y2:gH},
      colorStops:[{offset:0,color:'rgba(17,17,17,0)'},{offset:1,color:'rgba(17,17,17,1)'}]}))
    rect.eliteType='gradient'; rect.eliteLabel='Gradient Overlay'
    c.add(rect); c.setActiveObject(rect); c.renderAll(); saveHistory()
  },[width,height,saveHistory])

  const addImageArea = useCallback(() => {
    const c=fabricRef.current; if(!c) return
    const a=new fabric.Rect({left:0,top:0,width,height:Math.round(height*0.55),fill:'#1E1E1E',strokeWidth:0})
    a.eliteType='image_area'; a.eliteLabel='Image Area'
    c.add(a); c.sendObjectToBack(a); c.renderAll(); saveHistory()
  },[width,height,saveHistory])

  // ─────────────────────────────────────────────────────────────────────────────
  // IMAGE — FILE UPLOAD (bottom toolbar file picker)
  // ─────────────────────────────────────────────────────────────────────────────

  const addImageFromFile = useCallback((file) => {
    const c=fabricRef.current; if(!c) return
    const reader=new FileReader()
    reader.onload=(ev)=>{
      const imgEl=new Image()
      imgEl.onload=()=>{
        const maxW=width*0.6, maxH=height*0.6
        const scale=Math.min(maxW/imgEl.width,maxH/imgEl.height,1)
        const pattern=new fabric.Pattern({source:imgEl,repeat:'no-repeat'})
        // originX/Y: 'center' → pattern (0,0) = center of rect
        // center formula: tx = -imgW*scale/2
        pattern.patternTransform=[scale,0,0,scale,-imgEl.width*scale/2,-imgEl.height*scale/2]
        const rect=new fabric.Rect({
          left:width/2,top:height/2,originX:'center',originY:'center',
          width:imgEl.width*scale,height:imgEl.height*scale,
          fill:pattern,stroke:'transparent',strokeWidth:0,
        })
        const name=file.name.replace(/\.[^/.]+$/,'')||'Image'
        rect.eliteType='image'; rect.eliteLabel=name
        c.add(rect); c.setActiveObject(rect); c.renderAll(); saveHistory()
      }
      imgEl.src=ev.target.result
    }
    reader.readAsDataURL(file)
  },[width,height,saveHistory])

  // ─────────────────────────────────────────────────────────────────────────────
  // OBJECT OPERATIONS  (delete, duplicate, order, transform, group)
  // ─────────────────────────────────────────────────────────────────────────────

  const deleteSelected = useCallback(() => {
    const c=fabricRef.current; if(!c) return
    const active=c.getActiveObject(); if(!active) return
    const objs=active instanceof fabric.ActiveSelection ? active.getObjects() : [active]
    if(active instanceof fabric.ActiveSelection) c.discardActiveObject()
    objs.forEach(obj=>{
      deletedLayersRef.current.push({ label:obj.eliteLabel||'Element', type:obj.eliteType||'shape',
        json:obj.toObject(ELITE_CUSTOM_PROPS), deletedAt:Date.now() })
      c.remove(obj)
    })
    c.discardActiveObject(); c.renderAll(); saveHistory(); onHistoryChange()
  },[saveHistory,onHistoryChange])

  const duplicateSelected = useCallback(() => {
    const c=fabricRef.current; if(!c) return
    const active=c.getActiveObject(); if(!active) return
    active.clone(ELITE_CUSTOM_PROPS).then(cloned=>{
      cloned.set({left:(cloned.left||0)+30,top:(cloned.top||0)+30})
      cloned.eliteLabel=(cloned.eliteLabel||'')+' copy'
      c.add(cloned); c.setActiveObject(cloned); c.renderAll(); saveHistory()
    })
  },[saveHistory])

  const selectAll = useCallback(() => {
    const c=fabricRef.current; if(!c) return
    c.setActiveObject(new fabric.ActiveSelection(c.getObjects(),{canvas:c})); c.renderAll()
  },[])

  // Internal copy/paste (canvas-to-canvas, not system clipboard)
  const copyInternal  = useCallback(()=>{
    const c=fabricRef.current; if(!c) return
    c.getActiveObject()?.clone(ELITE_CUSTOM_PROPS).then(cl=>{internalClipRef.current=cl})
  },[])
  const pasteInternal = useCallback(()=>{
    const c=fabricRef.current; if(!c||!internalClipRef.current) return
    internalClipRef.current.clone(ELITE_CUSTOM_PROPS).then(cl=>{
      cl.set({left:(cl.left||0)+30,top:(cl.top||0)+30})
      c.add(cl); c.setActiveObject(cl); c.renderAll(); saveHistory()
    })
  },[saveHistory])

  const bringToFront = useCallback(()=>{const c=fabricRef.current;if(!c)return;const o=c.getActiveObject();if(!o)return;c.bringObjectToFront(o);c.renderAll();saveHistory()},[saveHistory])
  const sendToBack   = useCallback(()=>{const c=fabricRef.current;if(!c)return;const o=c.getActiveObject();if(!o)return;c.sendObjectToBack(o);c.renderAll();saveHistory()},[saveHistory])
  const bringForward = useCallback(()=>{const c=fabricRef.current;if(!c)return;const o=c.getActiveObject();if(!o)return;const arr=c.getObjects();const idx=arr.indexOf(o);if(idx<arr.length-1){c.moveObjectTo(o,idx+1);c.renderAll();saveHistory()}},[saveHistory])
  const sendBackward = useCallback(()=>{const c=fabricRef.current;if(!c)return;const o=c.getActiveObject();if(!o)return;const arr=c.getObjects();const idx=arr.indexOf(o);if(idx>0){c.moveObjectTo(o,idx-1);c.renderAll();saveHistory()}},[saveHistory])

  const flipH = useCallback(()=>{const c=fabricRef.current;if(!c)return;const o=c.getActiveObject();if(!o)return;o.set('flipX',!o.flipX);c.renderAll();saveHistory()},[saveHistory])
  const flipV = useCallback(()=>{const c=fabricRef.current;if(!c)return;const o=c.getActiveObject();if(!o)return;o.set('flipY',!o.flipY);c.renderAll();saveHistory()},[saveHistory])

  const toggleVisibility = useCallback(()=>{const c=fabricRef.current;if(!c)return;const o=c.getActiveObject();if(!o)return;o.set('visible',!o.visible);c.discardActiveObject();c.renderAll();saveHistory()},[saveHistory])
  const toggleLock       = useCallback(()=>{
    const c=fabricRef.current;if(!c)return;const o=c.getActiveObject();if(!o)return
    const locked=!o.selectable
    o.set({selectable:!locked,evented:!locked,lockMovementX:locked,lockMovementY:locked,lockScalingX:locked,lockScalingY:locked,lockRotation:locked})
    if(locked) c.discardActiveObject(); c.renderAll(); saveHistory()
  },[saveHistory])

  const groupSelected = useCallback(()=>{
    const c=fabricRef.current;if(!c)return
    const sel=c.getActiveObject();if(!(sel instanceof fabric.ActiveSelection))return
    const objs=sel.getObjects();if(objs.length<2)return
    c.discardActiveObject(); objs.forEach(o=>c.remove(o))
    const g=new fabric.Group(objs);g.eliteType='group';g.eliteLabel='Group'
    c.add(g);c.setActiveObject(g);c.renderAll();saveHistory()
  },[saveHistory])

  const ungroupSelected = useCallback(()=>{
    const c=fabricRef.current;if(!c)return
    const active=c.getActiveObject()
    if(!(active instanceof fabric.Group)||active instanceof fabric.ActiveSelection) return
    const items=[...active.getObjects()]
    const gMatrix=active.calcTransformMatrix()
    c.remove(active);c.discardActiveObject()
    items.forEach(item=>{
      const d=fabric.util.qrDecompose(fabric.util.multiplyTransformMatrices(gMatrix,item.calcTransformMatrix()))
      item.set({left:d.translateX,top:d.translateY,scaleX:d.scaleX,scaleY:d.scaleY,
                angle:d.angle,skewX:d.skewX||0,flipX:false,flipY:false,originX:'left',originY:'top'})
      item.setCoords(); c.add(item)
    })
    c.setActiveObject(new fabric.ActiveSelection(items,{canvas:c})); c.renderAll(); saveHistory()
  },[saveHistory])

  // Deleted-layer recycle bin (used by LayerPanel)
  const getDeletedLayers    = useCallback(()=>[...deletedLayersRef.current],[])
  const restoreDeletedLayer = useCallback((index)=>{
    const c=fabricRef.current;if(!c)return
    const items=deletedLayersRef.current;if(index<0||index>=items.length)return
    const item=items[index]; deletedLayersRef.current=items.filter((_,i)=>i!==index)
    fabric.util.enlivenObjects([item.json]).then(objs=>{
      if(objs.length>0){c.add(objs[0]);c.setActiveObject(objs[0]);c.renderAll();saveHistory();onHistoryChange()}
    })
  },[saveHistory,onHistoryChange])

  // ─────────────────────────────────────────────────────────────────────────────
  // EXPORT & IMPORT
  // ─────────────────────────────────────────────────────────────────────────────

  const exportJSON = useCallback(()=>{
    const c=fabricRef.current;if(!c)return'{}'
    return JSON.stringify(c.toJSON(ELITE_CUSTOM_PROPS),null,2)
  },[])

  const importJSON = useCallback((json)=>{
    const c=fabricRef.current;if(!c)return
    isRestoring.current=true
    c.loadFromJSON(JSON.parse(json)).then(()=>{c.renderAll();isRestoring.current=false;saveHistory()})
  },[saveHistory])

  const exportPNG = useCallback((multiplier=3)=>{
    const c=fabricRef.current;if(!c)return
    const url=c.toDataURL({format:'png',quality:1,multiplier})
    const a=document.createElement('a');a.href=url;a.download=`design_${width}x${height}_${multiplier}x.png`;a.click()
  },[width,height])

  const changeSize = useCallback((w,h)=>{
    const c=fabricRef.current;if(!c)return
    c.setDimensions({width:w,height:h});c.renderAll();calculateZoom();saveHistory()
  },[calculateZoom,saveHistory])

  const setCanvasBg = useCallback((color)=>{
    const c=fabricRef.current;if(!c)return;c.set('backgroundColor',color);c.renderAll();saveHistory()
  },[saveHistory])

  // ─────────────────────────────────────────────────────────────────────────────
  // FRAME TOOLS  (Canva-style image frames that clip images to shapes)
  // ─────────────────────────────────────────────────────────────────────────────

  const addFrameShape = useCallback((shapeKey, frameW, frameH) => {
    const c = fabricRef.current; if (!c) return
    const cx = width  / 2
    const cy = height / 2
    const frame = addFrame(c, cx, cy, shapeKey, frameW || 500, frameH || 500, accentRef.current)
    if (frame) saveHistory()
  }, [width, height, saveHistory])

  // Assign an image File to a specific frame
  const loadImageIntoFrame = useCallback((frame, file) => {
    const c = fabricRef.current; if (!c) return
    loadFileIntoFrame(frame, file, () => {
      c.renderAll(); saveHistory()
    })
  }, [saveHistory])

  // Change fit mode of the selected frame
  const setFrameFitMode = useCallback((frame, mode) => {
    if (!frame || frame.eliteType !== 'frame') return
    frame.eliteFitMode = mode
    refitFrame(frame)
    fabricRef.current?.renderAll()
    saveHistory()
  }, [saveHistory])

  // Set image offset within frame (manual pan for crop effect)
  const setFrameImageOffset = useCallback((frame, dx, dy) => {
    if (!frame || frame.eliteType !== 'frame') return
    frame.eliteImageOffsetX = dx
    frame.eliteImageOffsetY = dy
    refitFrame(frame)
    fabricRef.current?.renderAll()
    saveHistory()
  }, [saveHistory])

  // Set image zoom within frame
  const setFrameImageScale = useCallback((frame, scale) => {
    if (!frame || frame.eliteType !== 'frame') return
    frame.eliteImageScale = scale
    refitFrame(frame)
    fabricRef.current?.renderAll()
    saveHistory()
  }, [saveHistory])

  // Remove image from frame (back to placeholder)
  const clearFrameImageFn = useCallback((frame) => {
    if (!frame || frame.eliteType !== 'frame') return
    clearFrameImage(frame, accentRef.current)
    fabricRef.current?.renderAll()
    saveHistory()
  }, [saveHistory])

  // ── Frame image loader ────────────────────────────────────────────────────
  // Shared by drag-drop AND Cmd+V paste-into-frame.
  function _loadFileAndApplyToFrame(frame, file, fabricCanvas, onSave) {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const imgEl = new window.Image()
      imgEl.onload = () => {
        applyImageToFrame(frame, imgEl)
        fabricCanvas?.renderAll()
        onSave?.()
      }
      imgEl.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ICON TOOLS  (SVG path icons placed as fabric.Path objects)
  // ─────────────────────────────────────────────────────────────────────────────

  const addIconToCanvas = useCallback((iconData, color, size) => {
    const c = fabricRef.current; if (!c) return
    const iconSize  = size  || Math.min(width, height) * 0.15
    const iconColor = color || accentRef.current

    // Each icon may be a string (single path) or array of paths
    const pathStrings = Array.isArray(iconData.path) ? iconData.path : [iconData.path]

    if (pathStrings.length === 1) {
      // Single path — create one fabric.Path
      const p = new fabric.Path(pathStrings[0], {
        left:  width  / 2,
        top:   height / 2,
        originX: 'center',
        originY: 'center',
        fill: 'transparent',
        stroke: iconColor,
        strokeWidth: 1.5,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      })
      // Scale to desired size (paths are 24×24 viewport)
      const scale = iconSize / 24
      p.set({ scaleX: scale, scaleY: scale })
      p.eliteType  = 'icon'
      p.eliteLabel = iconData.label
      p.eliteIconId   = iconData.id
      p.eliteIconPath = iconData.path
      c.add(p); c.setActiveObject(p); c.renderAll(); saveHistory()
    } else {
      // Multi-path icon — group all paths
      const paths = pathStrings.map(d => new fabric.Path(d, {
        fill: 'transparent',
        stroke: iconColor,
        strokeWidth: 1.5,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        originX: 'center',
        originY: 'center',
        left: 0,
        top: 0,
      }))
      const group = new fabric.Group(paths, {
        left:  width  / 2,
        top:   height / 2,
        originX: 'center',
        originY: 'center',
      })
      const scale = iconSize / 24
      group.set({ scaleX: scale, scaleY: scale })
      group.eliteType  = 'icon'
      group.eliteLabel = iconData.label
      c.add(group); c.setActiveObject(group); c.renderAll(); saveHistory()
    }
  }, [width, height, saveHistory])

  // ─────────────────────────────────────────────────────────────────────────────
  // AI CONTENT HELPERS  (used inside applyGeneratedContent below)
  // ─────────────────────────────────────────────────────────────────────────────

  function _applyTitle(obj, text, highlightWords, accent) {
    obj.set('text', text.toUpperCase())
    if (highlightWords?.trim()) {
      try { obj.initDimensions() } catch {}
      const words = highlightWords.split(',').map(w => w.trim().toUpperCase()).filter(Boolean)
      obj.set('styles', buildHighlightStyles(obj, words, accent, '800'))
    } else {
      obj.set('styles', {})
    }
    obj.dirty = true
  }

  function _autoFitText(obj) {
    if (!obj.width || !obj.height) return
    const maxH = obj.height * (obj.scaleY || 1)
    let fs = obj.fontSize || 24
    const minFs = 8
    while (fs > minFs) {
      obj.set('fontSize', fs)
      try { obj.initDimensions() } catch { break }
      const h = obj.calcTextHeight ? obj.calcTextHeight() : (obj.height || 0)
      if (h <= maxH) break
      fs -= 1
    }
    obj.dirty = true
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC API  (useImperativeHandle — everything canvasRef.current.X can call)
  // ─────────────────────────────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    // History
    undo, redo,
    canUndo: () => historyIdx.current > 0,
    canRedo: () => historyIdx.current < historyRef.current.length - 1,

    // Shape tools
    addText, addRect, addCircle, addLine, addImageArea, addImageFromFile,
    addTriangle, addStar, addPentagon, addHexagon, addDiamond, addArrow,

    // Text tools
    addTitle, addSubtitle, addTag,

    // Element tools
    addAccentLine, addLogo, addGradientOverlay,

    // Frame tools (Canva-style)
    addFrameShape, loadImageIntoFrame, setFrameFitMode,
    setFrameImageOffset, setFrameImageScale, clearFrameImage: clearFrameImageFn,
    FRAME_SHAPES,

    // Icon tools
    addIconToCanvas,

    // Object operations
    deleteSelected, duplicateSelected, selectAll,
    copy: copyInternal, paste: pasteInternal,
    bringToFront, sendToBack, bringForward, sendBackward,
    flipH, flipV, toggleVisibility, toggleLock,
    groupSelected, ungroupSelected,
    getDeletedLayers, restoreDeletedLayer,

    // Export / import
    exportJSON, importJSON, exportPNG, changeSize, setCanvasBg,
    getCanvas: () => fabricRef.current,
    // Small thumbnail for pages panel (JPEG, 12% scale ≈ 120px wide for 1080px canvas)
    getThumb: () => fabricRef.current?.toDataURL({ format: 'jpeg', quality: 0.7, multiplier: 0.12 }),

    // Zoom
    setZoom: (p) => {
      const z = Math.max(0.1, Math.min(5, p / 100))
      zoomRef.current = z
      setZoomState(z)
    },
    getZoom:  () => Math.round(zoom * 100),
    zoomToFit: () => calculateZoom(),

    // ── Reset to default template ──────────────────────────────────────────
    resetToDefault: () => {
      const c = fabricRef.current; if (!c) return
      c.clear()
      c.set('backgroundColor', BG)
      addDefaultElements(c, c.width, c.height, accentRef.current)
      c.renderAll()
      saveHistory()
    },

    // ── Theme: update accent colour live ───────────────────────────────────
    // Called by DesignStudio every 500ms when it detects var(--green) changed.
    updateAccentColor: (newColor) => {
      accentRef.current = newColor
      const c = fabricRef.current; if (!c) return
      // Update Fabric's selection handle colour
      fabric.FabricObject.prototype.set({
        cornerColor:      newColor,
        cornerStrokeColor: newColor,
        borderColor:      newColor + '99',
      })
      // Recolour accent-typed objects already on the canvas
      c.getObjects().forEach(obj => {
        if (obj.eliteType === 'tag')  { obj.set('fill', newColor); obj.dirty = true }
        if (obj.eliteType === 'line' && obj.eliteLabel === 'Accent Line') {
          obj.set('fill', newColor); obj.dirty = true
        }
      })
      c.renderAll()
    },

    // ── AI content injection ───────────────────────────────────────────────
    // Works with ANY template — eliteType markers are used when present;
    // falls back to smart heuristic (font-size ranking) for custom templates.
    applyGeneratedContent: ({ title, highlight_words, subtitle, tag } = {}) => {
      const c = fabricRef.current; if (!c) return
      const accent = accentRef.current || getAccentColor()

      // Collect all text objects (including inside groups)
      const allObjs = []
      const collect = (objs) => {
        objs.forEach(o => {
          if (o instanceof fabric.Group) collect(o.getObjects())
          else allObjs.push(o)
        })
      }
      collect(c.getObjects())

      const textObjs = allObjs.filter(o =>
        o.type === 'textbox' || o.type === 'i-text' || o.type === 'text'
      )

      // ── Pass 1: explicit eliteType matches ────────────────────────────────
      let titleMatched    = false
      let subtitleMatched = false
      let tagMatched      = false

      textObjs.forEach(obj => {
        if (obj.eliteType === 'title' && title) {
          _applyTitle(obj, title, highlight_words, accent); titleMatched = true
        }
        if (obj.eliteType === 'text' && subtitle) {
          obj.set('text', subtitle); obj.set('styles', {}); obj.dirty = true; subtitleMatched = true
        }
        if (obj.eliteType === 'tag') {
          obj.set('fill', accent)
          if (tag) { obj.set('text', tag); obj.dirty = true }
          tagMatched = true
        }
      })

      // ── Pass 2: heuristic fallback for un-tagged custom templates ─────────
      // Sort by fontSize desc → biggest = title, next = subtitle, smallest = tag
      if (!titleMatched || !subtitleMatched || !tagMatched) {
        const sorted = [...textObjs].sort((a, b) => (b.fontSize || 0) - (a.fontSize || 0))

        if (!titleMatched && title && sorted[0]) {
          _applyTitle(sorted[0], title, highlight_words, accent)
        }
        if (!subtitleMatched && subtitle && sorted[1]) {
          sorted[1].set('text', subtitle); sorted[1].set('styles', {}); sorted[1].dirty = true
        }
        if (!tagMatched && sorted.length >= 3) {
          const tagObj = sorted[sorted.length - 1]   // smallest text = tag/badge
          tagObj.set('fill', accent)
          if (tag) { tagObj.set('text', tag); tagObj.dirty = true }
        }
      }

      // ── Auto-size: shrink font if title overflows its bounding box ────────
      textObjs.forEach(obj => {
        if (!obj.dirty) return
        _autoFitText(obj)
      })

      c.renderAll()
      setTimeout(() => saveHistory(), 50)
    },

    // ── System clipboard paste (NEW) ───────────────────────────────────────
    // Called from the keyboard handler below (Cmd+V when canvas is focused)
    // and exposed here so Toolbar / ContextMenu can also trigger it.
    pasteFromClipboard: () => pasteFromSystemClipboard({
      canvas: fabricRef.current,
      width, height,
      accent: accentRef.current,
      saveHistory,
    }),

    // ── Canvas bounds in container-relative pixels ─────────────────────────
    // Used by RulerGuides to position rulers relative to the canvas element.
    getCanvasBounds: () => {
      if (!canvasRef.current || !containerRef.current) return null
      const cRect = canvasRef.current.getBoundingClientRect()
      const pRect = containerRef.current.getBoundingClientRect()
      return {
        left:   cRect.left - pRect.left,
        top:    cRect.top  - pRect.top,
        width:  cRect.width,
        height: cRect.height,
      }
    },

    // ── Current pan offset ─────────────────────────────────────────────────
    getPan: () => ({ ...panRef.current }),
  }))

  // ─────────────────────────────────────────────────────────────────────────────
  // CANVAS INIT  (runs once on mount)
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!canvasRef.current || fabricRef.current) return

    // --- Bootstrap Fabric canvas ---
    const canvas = new fabric.Canvas(canvasRef.current, {
      width, height,
      backgroundColor: BG,
      selection: true,
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireRightClick: true,
    })

    // --- Selection handle styling (accent-aware) ---
    const initAccent = getAccentColor()
    accentRef.current = initAccent
    fabric.FabricObject.prototype.set({
      transparentCorners:  false,
      cornerColor:         initAccent,
      cornerStrokeColor:   initAccent,
      cornerSize:          8,
      cornerStyle:         'circle',
      borderColor:         initAccent + '99',
      borderScaleFactor:   1.5,
      padding:             6,
    })

    // --- Selection events ---
    canvas.on('selection:created', e => onSelectionChange(e.selected?.[0] || null))
    canvas.on('selection:updated', e => onSelectionChange(e.selected?.[0] || null))
    canvas.on('selection:cleared', ()  => onSelectionChange(null))
    canvas.on('object:modified',   e   => { if (e.target) onSelectionChange(e.target); saveHistory() })

    // ── Keep image layer in sync when a frame is moved / scaled / rotated ───
    // When a frame with an associated fabric.Image layer is transformed,
    // we must update both the image position and the clipPath position to match.
    const syncFrameImageLayer = (frame) => {
      if (!frame || frame.eliteType !== 'frame') return
      const imgLayer = frame._elitePrevFabricImg
      const clip     = frame._eliteClip
      if (!imgLayer || !clip) return

      const center = frame.getCenterPoint()
      const fw     = frame.width  || 500
      const fh     = frame.height || 500
      const fmode  = frame.eliteFitMode      || 'fill'
      const offX   = frame.eliteImageOffsetX || 0
      const offY   = frame.eliteImageOffsetY || 0
      const extra  = frame.eliteImageScale   || 1
      const iw     = imgLayer.width  || 1
      const ih     = imgLayer.height || 1

      // Re-compute image position in CANVAS space (not local)
      // image is placed relative to frame center
      let imgW, imgH, imgRelLeft, imgRelTop
      if (fmode === 'fill') {
        const scale = Math.max(fw / iw, fh / ih) * extra
        imgW = iw * scale; imgH = ih * scale
        imgRelLeft = -imgW / 2 + offX; imgRelTop = -imgH / 2 + offY
      } else if (fmode === 'fit') {
        const scale = Math.min(fw / iw, fh / ih) * extra
        imgW = iw * scale; imgH = ih * scale
        imgRelLeft = -imgW / 2 + offX; imgRelTop = -imgH / 2 + offY
      } else if (fmode === 'stretch') {
        imgW = fw * extra; imgH = fh * extra
        imgRelLeft = -fw / 2 + offX; imgRelTop = -fh / 2 + offY
      } else {
        imgW = iw * extra; imgH = ih * extra
        imgRelLeft = -iw * extra / 2 + offX; imgRelTop = -ih * extra / 2 + offY
      }

      // Apply frame's transform to the relative position
      const angle   = (frame.angle || 0) * Math.PI / 180
      const cos     = Math.cos(angle)
      const sin     = Math.sin(angle)
      const sx      = frame.scaleX || 1
      const sy      = frame.scaleY || 1
      const absLeft = center.x + (imgRelLeft * cos - imgRelTop * sin) * sx
      const absTop  = center.y + (imgRelLeft * sin + imgRelTop * cos) * sy

      imgLayer.set({
        left:   absLeft,
        top:    absTop,
        scaleX: (imgW / (imgLayer.getOriginalSize?.()?.width  || imgLayer.width  || 1)) * sx,
        scaleY: (imgH / (imgLayer.getOriginalSize?.()?.height || imgLayer.height || 1)) * sy,
        angle:  frame.angle || 0,
        originX: 'left',
        originY: 'top',
      })
      imgLayer.setCoords()

      // Update the clipPath to match the frame's new position
      clip.set({
        left:   center.x,
        top:    center.y,
        angle:  frame.angle  || 0,
        scaleX: frame.scaleX || 1,
        scaleY: frame.scaleY || 1,
      })
      clip.setCoords()
    }

    canvas.on('object:moving',   e => syncFrameImageLayer(e.target))
    canvas.on('object:scaling',  e => syncFrameImageLayer(e.target))
    canvas.on('object:rotating', e => syncFrameImageLayer(e.target))

    // ── Canvas-image → frame: highlight frame when dragging a canvas image ───
    canvas.on('object:moving', (e) => {
      const obj = e.target
      if (obj?.eliteType !== 'image') {
        // Clear any leftover highlight if a non-image is dragged
        if (canvasImgDragFrameRef.current) {
          clearFrameHighlight(canvasImgDragFrameRef.current)
          canvasImgDragFrameRef.current = null
          canvas.renderAll()
        }
        return
      }
      // Find the frame under the dragged image's center
      const center = obj.getCenterPoint()
      const frame  = findFrameAtPoint(canvas, center.x, center.y)
      if (frame !== canvasImgDragFrameRef.current) {
        if (canvasImgDragFrameRef.current) clearFrameHighlight(canvasImgDragFrameRef.current)
        if (frame) highlightFrame(frame, accentRef.current)
        canvasImgDragFrameRef.current = frame
        canvas.renderAll()
      }
    })

    // ── Smart snap guide lines (Figma / Canva style) ──────────────────────────
    // Fires while dragging: compute snap, apply position, emit guide data.
    canvas.on('object:moving', (e) => {
      if (!e.target) return
      const snaps = findSnaps(e.target, canvas, rulerGuidesRef.current)
      applySnap(e.target, snaps)

      if (onGuidesChange && containerRef.current && canvasRef.current) {
        const cRect  = canvasRef.current.getBoundingClientRect()
        const pRect  = containerRef.current.getBoundingClientRect()
        onGuidesChange({
          ...snaps,
          _originX:   cRect.left - pRect.left,
          _originY:   cRect.top  - pRect.top,
        })
      }
    })

    // Show size tooltip while resizing/rotating
    canvas.on('object:scaling', (e) => {
      if (!e.target || !onGuidesChange || !containerRef.current || !canvasRef.current) return
      const cRect  = canvasRef.current.getBoundingClientRect()
      const pRect  = containerRef.current.getBoundingClientRect()
      onGuidesChange({
        ...buildResizeGuides(e.target),
        _originX: cRect.left - pRect.left,
        _originY: cRect.top  - pRect.top,
      })
    })

    // Clear guides on mouse up + handle canvas-image drop onto frame
    canvas.on('mouse:up', () => {
      onGuidesChange?.(null)

      // Canvas-image → frame: if a canvas image was dropped onto a frame, apply it
      const targetFrame = canvasImgDragFrameRef.current
      if (targetFrame) {
        clearFrameHighlight(targetFrame)
        canvasImgDragFrameRef.current = null

        const active = canvas.getActiveObject()
        if (active?.eliteType === 'image') {
          // Extract the HTMLImageElement from the Pattern fill or fabric.Image
          const imgEl = (active.fill instanceof fabric.Pattern)
            ? active.fill.source
            : (active instanceof fabric.Image ? active.getElement?.() : null)

          if (imgEl) {
            applyImageToFrame(targetFrame, imgEl)
            canvas.remove(active)
            canvas.setActiveObject(targetFrame)
            canvas.renderAll()
            saveHistory()
          }
        }
        canvas.renderAll()
      }
    })

    // --- Context menu (right-click) ---
    canvas.on('mouse:down', opt => {
      if (opt.e?.button === 2 && onContextMenu) {
        opt.e.preventDefault(); opt.e.stopPropagation()
        onContextMenu(opt.e.clientX, opt.e.clientY)
      }
    })

    // --- Double-click image area OR frame → open file picker ---
    canvas.on('mouse:dblclick', opt => {
      const target = opt.target
      if (!target) return
      if (target.eliteType === 'image_area' || target.eliteType === 'frame') {
        const input = document.createElement('input'); input.type='file'; input.accept='image/*'
        input.onchange = e => {
          const f = e.target?.files?.[0]; if (!f) return
          if (target.eliteType === 'frame') {
            // Load image into frame (clips to frame shape)
            loadFileIntoFrame(target, f, () => { canvas.renderAll(); saveHistory() })
          } else {
            addImageFromFile(f)
          }
        }
        input.click()
      }
    })

    // --- Text editing: prevent Fabric's textarea from causing page reflow ---
    canvas.on('text:editing:entered', () => {
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      const ta = canvasRef.current?.nextElementSibling
      if (ta?.tagName === 'TEXTAREA') {
        Object.assign(ta.style, {
          position:'fixed', top:'0', left:'0',
          opacity:'0', pointerEvents:'none',
          resize:'none', overflow:'hidden', width:'1px', height:'1px',
        })
      }
      if (containerRef.current) { containerRef.current.scrollTop=0; containerRef.current.scrollLeft=0 }
    })

    // ── Drag & drop from OS + paste via Cmd+V ────────────────────────────────
    //
    // THREE problems solved here:
    //
    // 1. STALE CLOSURE: pan/zoom are React state captured once at mount.
    //    We use zoomRef (always-current mirror ref) instead.
    //
    // 2. COORDINATE MATH: The <canvas> element is CSS-scaled via its parent div.
    //    getBoundingClientRect() already accounts for the CSS transform, so:
    //      canvasX = (screenX - rect.left) / zoomRef.current
    //    We do NOT subtract pan because the canvas ELEMENT itself moves with pan.
    //
    // 3. DROP-INTO-FRAME vs PASTE-INTO-FRAME:
    //    When a frame is the active/selected object AND the user pastes a clipboard
    //    image (Cmd+V), we route the image INTO that frame instead of placing it
    //    as a new standalone image. Same rule applies for drag-drop.
    //
    const canvasEl = canvasRef.current

    // ── convertScreenToCanvas: robust coord conversion ─────────────────────
    // Uses the canvas element's own bounding rect (post-CSS-transform).
    const convertScreenToCanvas = (screenX, screenY) => {
      const rect = canvasEl.getBoundingClientRect()
      return {
        x: (screenX - rect.left) / zoomRef.current,
        y: (screenY - rect.top)  / zoomRef.current,
      }
    }

    // ── Drag-over: highlight whichever frame is under cursor ───────────────
    const handleDragOver = (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      if (!fabricRef.current) return

      const { x, y } = convertScreenToCanvas(e.clientX, e.clientY)
      const frame = findFrameAtPoint(fabricRef.current, x, y)

      if (frame !== dragOverFrameRef.current) {
        if (dragOverFrameRef.current) {
          clearFrameHighlight(dragOverFrameRef.current)
        }
        if (frame) {
          highlightFrame(frame, accentRef.current)
        }
        dragOverFrameRef.current = frame
        fabricRef.current.renderAll()
      }
    }

    // ── Drag-leave: always clear highlight ─────────────────────────────────
    const handleDragLeave = (e) => {
      // Only clear when leaving the canvas element itself (not its children)
      if (e.relatedTarget && canvasEl.contains(e.relatedTarget)) return
      if (dragOverFrameRef.current) {
        clearFrameHighlight(dragOverFrameRef.current)
        fabricRef.current?.renderAll()
      }
      dragOverFrameRef.current = null
    }

    // ── Drop: route image file into frame or standalone ────────────────────
    const handleDrop = (e) => {
      e.preventDefault()
      e.stopPropagation()

      // Clear any active highlight
      if (dragOverFrameRef.current) {
        clearFrameHighlight(dragOverFrameRef.current)
      }

      const file = e.dataTransfer?.files?.[0]
      if (!file || !file.type.startsWith('image/')) {
        dragOverFrameRef.current = null
        fabricRef.current?.renderAll()
        return
      }

      if (!fabricRef.current) { dragOverFrameRef.current = null; return }

      // Prefer the frame we were hovering over; fall back to hit-test at drop point
      const { x, y } = convertScreenToCanvas(e.clientX, e.clientY)
      const frame = dragOverFrameRef.current
        ?? findFrameAtPoint(fabricRef.current, x, y)

      dragOverFrameRef.current = null
      fabricRef.current.renderAll()

      if (frame) {
        // ── Route into frame ───────────────────────────────────────────────
        _loadFileAndApplyToFrame(frame, file, fabricRef.current, saveHistory)
      } else {
        // ── Standalone image ───────────────────────────────────────────────
        addImageFromFile(file)
      }
    }

    canvasEl.addEventListener('dragover',   handleDragOver)
    canvasEl.addEventListener('dragleave',  handleDragLeave)
    canvasEl.addEventListener('drop',       handleDrop)

    // --- Initial layout ---
    fabricRef.current = canvas
    addDefaultElements(canvas, width, height, initAccent)
    saveHistory()
    setTimeout(() => calculateZoom(), 50)

    return () => {
      canvas.dispose()
      fabricRef.current = null
      canvasEl.removeEventListener('dragover',  handleDragOver)
      canvasEl.removeEventListener('dragleave', handleDragLeave)
      canvasEl.removeEventListener('drop',      handleDrop)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────────
  // KEYBOARD SHORTCUTS
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const down = async (e) => {
      const tag = e.target?.tagName
      const isEditingText = ['INPUT','TEXTAREA','SELECT'].includes(tag)
      const isMeta = e.metaKey || e.ctrlKey

      // History
      if (isMeta && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); return }
      if (isMeta &&  e.shiftKey && e.key === 'Z') { e.preventDefault(); redo(); return }

      if (isEditingText) return  // don't intercept while typing in inputs

      // ── Cmd+V → system clipboard paste ──────────────────────────────────
      // Priority:
      //   1. If a frame is currently selected → paste image INTO the frame
      //   2. Otherwise try system clipboard (image first, then text)
      //   3. Fall back to internal Fabric copy
      if (isMeta && e.key === 'v') {
        e.preventDefault()

        const activeFrame = (() => {
          const active = fabricRef.current?.getActiveObject()
          return active?.eliteType === 'frame' ? active : null
        })()

        if (activeFrame) {
          // ── Paste into selected frame via clipboard API ──────────────────
          try {
            const items = await navigator.clipboard.read()
            for (const item of items) {
              const imageType = item.types.find(t => t.startsWith('image/'))
              if (imageType) {
                const blob    = await item.getType(imageType)
                const dataUrl = await new Promise((res, rej) => {
                  const r = new FileReader()
                  r.onload  = () => res(r.result)
                  r.onerror = rej
                  r.readAsDataURL(blob)
                })
                const imgEl = new window.Image()
                imgEl.onload = () => {
                  applyImageToFrame(activeFrame, imgEl)
                  fabricRef.current?.renderAll()
                  saveHistory()
                }
                imgEl.src = dataUrl
                return
              }
            }
          } catch {
            // clipboard.read() may be blocked — fall through to internal paste
          }
          // If no image in clipboard, fall through to internal paste
          pasteInternal()
          return
        }

        // ── Normal paste (no frame selected) ────────────────────────────────
        pasteFromSystemClipboard({
          canvas: fabricRef.current,
          width, height,
          accent: accentRef.current,
          saveHistory,
        }).then(result => {
          if (!result.success) pasteInternal()
        })
        return
      }

      if (isMeta && e.key === 'c') {
        e.preventDefault()
        copyInternal()
        // Also write the selected object to the OS clipboard as PNG (Figma-style)
        copyToSystemClipboard(fabricRef.current).catch(() => {/* silently ignore if blocked */})
        return
      }
      if (isMeta && e.key === 'd')            { e.preventDefault(); duplicateSelected(); return }
      if (isMeta && e.key === 'a')            { e.preventDefault(); selectAll(); return }
      if (isMeta && !e.shiftKey && e.key==='g'){ e.preventDefault(); groupSelected(); return }
      if (isMeta &&  e.shiftKey && e.key==='G'){ e.preventDefault(); ungroupSelected(); return }
      if (e.key === ']')                       { e.preventDefault(); bringToFront(); return }
      if (e.key === '[')                       { e.preventDefault(); sendToBack(); return }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const active = fabricRef.current?.getActiveObject()
        if (active && !active.isEditing) { e.preventDefault(); deleteSelected() }
        return
      }
      if (e.key === ' ' && !isSpaceDown.current) {
        isSpaceDown.current = true
        if (containerRef.current) containerRef.current.style.cursor = 'grab'
      }
      if (e.key === 'Escape') { fabricRef.current?.discardActiveObject(); fabricRef.current?.renderAll() }
    }

    const up = (e) => {
      if (e.key === ' ') {
        isSpaceDown.current = false
        if (containerRef.current) containerRef.current.style.cursor = 'default'
      }
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup',   up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [undo, redo, copyInternal, pasteInternal, duplicateSelected, selectAll, groupSelected,
      ungroupSelected, bringToFront, sendToBack, deleteSelected, saveHistory, width, height])

  // Recalculate zoom when container resizes
  useEffect(() => {
    window.addEventListener('resize', calculateZoom)
    return () => window.removeEventListener('resize', calculateZoom)
  }, [calculateZoom])

  // ─────────────────────────────────────────────────────────────────────────────
  // PAN EVENT HANDLERS  (Space+drag or middle-click)
  // ─────────────────────────────────────────────────────────────────────────────

  const handlePointerDown = (e) => {
    if (!isSpaceDown.current && e.button !== 1) return
    e.preventDefault(); isPanning.current = true
    lastMouse.current = { x: e.clientX, y: e.clientY }
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing'
  }
  const handlePointerMove = (e) => {
    if (!isPanning.current) return
    e.preventDefault()
    const dx = e.clientX - lastMouse.current.x
    const dy = e.clientY - lastMouse.current.y
    const newPan = { x: panRef.current.x + dx, y: panRef.current.y + dy }
    panRef.current = newPan          // keep ref current BEFORE setState
    setPan(newPan)
    onPanChangeRef.current?.(newPan)
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }
  const handlePointerUp = () => {
    if (!isPanning.current) return
    isPanning.current = false
    if (containerRef.current) containerRef.current.style.cursor = isSpaceDown.current ? 'grab' : 'default'
  }

  // ── Wheel / trackpad zoom ────────────────────────────────────────────────────
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    // Ctrl+wheel = pinch-to-zoom gesture on trackpad (or Ctrl+scroll on mouse)
    // Plain scroll = two-finger scroll → pan vertically; Shift+scroll → pan horizontally
    if (e.ctrlKey || e.metaKey) {
      // Zoom centred on cursor position
      const delta   = e.deltaY * -0.005
      const newZoom = Math.max(0.05, Math.min(zoomRef.current * (1 + delta), 4))
      zoomRef.current = newZoom
      setZoomState(newZoom)
      onZoomChangeRef.current?.(Math.round(newZoom * 100))
    } else {
      // Scroll = pan
      const dx = e.shiftKey ? -e.deltaY : -e.deltaX
      const dy = e.shiftKey ? 0          : -e.deltaY
      const newPan = { x: panRef.current.x + dx, y: panRef.current.y + dy }
      panRef.current = newPan
      setPan(newPan)
      onPanChangeRef.current?.(newPan)
    }
  }, [])

  // Attach wheel listener as non-passive so preventDefault() works
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      className="absolute inset-0 overflow-hidden"
      style={{ background: 'var(--bg)', touchAction: 'none' }}
    >
      {/* Subtle dot grid backdrop */}
      <div className="absolute inset-0 opacity-[0.03]"
           style={{ backgroundImage:'radial-gradient(circle,#fff 1px,transparent 1px)', backgroundSize:'24px 24px' }}/>

      {/* Canvas centred with pan/zoom transform */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div style={{
          transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isPanning.current ? 'none' : 'transform 0.1s ease-out',
        }}
             className="shadow-2xl shadow-black/60 rounded-lg">
          <canvas ref={canvasRef}/>
        </div>
      </div>
    </div>
  )
})

DesignCanvas.displayName = 'DesignCanvas'
export default DesignCanvas
