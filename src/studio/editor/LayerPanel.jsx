import { useEffect, useState, useCallback, useRef } from 'react'
import * as fabric from 'fabric'
import { EyeIcon, EyeOffIcon, TextLayerIcon, ImageLayerIcon, ShapeLayerIcon,
         GradientLayerIcon, LineLayerIcon, TagLayerIcon, LayersIcon } from '../icons/Icons.jsx'

// ── Icons ─────────────────────────────────────────────────────────────────────
const TYPE_ICONS = {
  title:       TextLayerIcon,
  text:        TextLayerIcon,
  tag:         TagLayerIcon,
  image_area:  ImageLayerIcon,
  image:       ImageLayerIcon,
  shape:       ShapeLayerIcon,
  gradient:    GradientLayerIcon,
  line:        LineLayerIcon,
  frame: p => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="2" y="2" width="20" height="20" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="M21 15l-5-5L5 21"/>
    </svg>
  ),
  icon: p => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  logo: p => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="10"/>
      <path d="M8 12l2 2 4-4"/>
    </svg>
  ),
  group: p => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="3" width="8" height="8" rx="1"/>
      <rect x="13" y="13" width="8" height="8" rx="1"/>
    </svg>
  ),
}

const LockIcon    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
const UnlockIcon  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
const RestoreIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
const ChevronIcon = ({ open }) => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
       style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)

// ── Auto-label any object even without eliteLabel / eliteType ─────────────────
function autoLabel(obj, index) {
  if (obj.eliteLabel) return obj.eliteLabel
  const t  = obj.eliteType || ''
  if (t === 'title')  return 'Title'
  if (t === 'text')   return 'Body Text'
  if (t === 'tag')    return 'Tag / Badge'
  if (t === 'image')  return 'Image'
  if (t === 'frame')  return 'Frame'
  if (t === 'bg')     return 'Background'
  if (t === 'logo')   return 'Logo'
  // Infer from Fabric object type
  const ft = obj.type || ''
  if (ft === 'textbox' || ft === 'i-text') return `Text ${index + 1}`
  if (ft === 'image')   return `Image ${index + 1}`
  if (ft === 'rect')    return `Rectangle ${index + 1}`
  if (ft === 'circle')  return `Circle ${index + 1}`
  if (ft === 'triangle')return `Triangle ${index + 1}`
  if (ft === 'group')   return `Group ${index + 1}`
  if (ft === 'path')    return `Path ${index + 1}`
  if (ft === 'line')    return `Line ${index + 1}`
  return `Layer ${index + 1}`
}

// ── Auto-select type icon key for any object ───────────────────────────────────
function resolveIconKey(obj) {
  if (obj.eliteType) return obj.eliteType
  const ft = obj.type || ''
  if (ft === 'textbox' || ft === 'i-text') return 'text'
  if (ft === 'image')  return 'image'
  if (ft === 'group')  return 'group'
  if (ft === 'path' || ft === 'line') return 'line'
  return 'shape'
}

// ── Build flat layer list from ALL canvas objects (no eliteType filter) ────────
function buildLayerTree(canvas) {
  if (!canvas) return []
  const all = canvas.getObjects()
  const tree = []
  let idx = 0
  for (let i = all.length - 1; i >= 0; i--) {
    const obj = all[i]
    // Skip Fabric.js internal helpers (selection overlays, etc.)
    if (obj._isControlsGroup || obj.evented === false && obj.selectable === false) continue
    const label    = autoLabel(obj, idx)
    const iconKey  = resolveIconKey(obj)
    if (obj instanceof fabric.Group && !(obj instanceof fabric.ActiveSelection)) {
      const children = obj.getObjects().map((c, ci) => ({
        obj: c,
        label:   autoLabel(c, ci),
        iconKey: resolveIconKey(c),
      }))
      tree.push({ obj, label, iconKey, isGroup: true, children })
    } else {
      tree.push({ obj, label, iconKey, isGroup: false })
    }
    idx++
  }
  return tree
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function LayerPanel({ canvas, selectedObject, canvasRef, tick }) {
  const [layers, setLayers]             = useState([])
  const [deletedLayers, setDeletedLayers] = useState([])
  const [showRecycleBin, setShowRecycleBin] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  const [renamingIdx, setRenamingIdx]   = useState(null)   // layer key being renamed
  const [renameVal, setRenameVal]       = useState('')
  const renameInputRef                  = useRef(null)

  // Drag-to-reorder state
  const dragSrcRef  = useRef(null)   // { obj, fromIdx }
  const [dragOver, setDragOver] = useState(null)  // index being hovered

  // ── Refresh ────────────────────────────────────────────────────────────────
  const refresh = useCallback(() => {
    if (!canvas) return
    setLayers(buildLayerTree(canvas))
    if (canvasRef.current) setDeletedLayers(canvasRef.current.getDeletedLayers())
  }, [canvas, canvasRef])

  // Refresh on canvas events
  useEffect(() => {
    if (!canvas) return
    refresh()
    canvas.on('object:added',    refresh)
    canvas.on('object:removed',  refresh)
    canvas.on('object:modified', refresh)
    return () => {
      canvas.off('object:added',    refresh)
      canvas.off('object:removed',  refresh)
      canvas.off('object:modified', refresh)
    }
  }, [canvas, refresh])

  // ── KEY FIX: refresh on every undo/redo tick ───────────────────────────────
  useEffect(() => { refresh() }, [tick, refresh])

  // Refresh when selection changes
  useEffect(() => { refresh() }, [selectedObject, refresh])

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingIdx !== null) renameInputRef.current?.select()
  }, [renamingIdx])

  // ── Layer actions ──────────────────────────────────────────────────────────
  const selectLayer = (obj) => {
    if (!canvas) return
    canvas.setActiveObject(obj)
    canvas.renderAll()
  }

  const toggleVis = (obj, e) => {
    e.stopPropagation()
    obj.set('visible', !obj.visible)
    canvas?.renderAll()
    refresh()
  }

  const toggleLock = (obj, e) => {
    e.stopPropagation()
    const locked = !obj.selectable
    obj.set({
      selectable: locked, evented: locked,
      lockMovementX: !locked, lockMovementY: !locked,
      lockScalingX: !locked, lockScalingY: !locked,
      lockRotation: !locked,
    })
    canvas?.renderAll()
    refresh()
  }

  const startRename = (key, currentLabel, e) => {
    e.stopPropagation()
    setRenamingIdx(key)
    setRenameVal(currentLabel)
  }

  const commitRename = (obj) => {
    if (renameVal.trim()) {
      obj.eliteLabel = renameVal.trim()
      canvas?.renderAll()
    }
    setRenamingIdx(null)
    refresh()
  }

  const toggleGroup = (key, e) => {
    e.stopPropagation()
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // ── Drag-to-reorder ────────────────────────────────────────────────────────
  const onDragStart = (obj, e) => {
    dragSrcRef.current = obj
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', '')
  }

  const onDragOver = (i, e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(i)
  }

  const onDrop = (targetObj, e) => {
    e.preventDefault()
    setDragOver(null)
    const src = dragSrcRef.current
    if (!src || !canvas || src === targetObj) return
    const objs = canvas.getObjects()
    const srcIdx = objs.indexOf(src)
    const tgtIdx = objs.indexOf(targetObj)
    if (srcIdx < 0 || tgtIdx < 0) return
    canvas.moveObjectTo(src, tgtIdx)
    canvas.renderAll()
    canvasRef.current?.exportJSON && refresh()
    refresh()
  }

  const onDragEnd = () => { dragSrcRef.current = null; setDragOver(null) }

  // ── Render a single layer row ──────────────────────────────────────────────
  // item can be a full tree-node {obj,label,iconKey} OR a bare fabric object
  const renderRow = (item, key, depth = 0) => {
    const obj        = item?.obj ?? item           // support both forms
    const rowLabel   = item?.label ?? autoLabel(obj, key)
    const iconKey    = item?.iconKey ?? resolveIconKey(obj)
    const isSelected = obj === selectedObject
    const isVisible  = obj.visible !== false
    const isLocked   = obj.selectable === false
    const IC         = TYPE_ICONS[iconKey] || ShapeLayerIcon
    const isRenaming = renamingIdx === key
    const isDragOver = dragOver === key

    return (
      <div
        key={key}
        draggable
        onDragStart={e => onDragStart(obj, e)}
        onDragOver={e => onDragOver(key, e)}
        onDrop={e => onDrop(obj, e)}
        onDragEnd={onDragEnd}
        onClick={() => selectLayer(obj)}
        onDoubleClick={e => startRename(key, rowLabel, e)}
        style={{ paddingLeft: 8 + depth * 14 }}
        className={[
          'w-full py-[6px] pr-2 flex items-center gap-1.5 text-left transition-all duration-75',
          'cursor-pointer select-none group relative',
          isSelected
            ? 'bg-accent/10 border-l-[2px] border-accent'
            : 'border-l-[2px] border-transparent hover:bg-white/[0.04]',
          isDragOver ? 'outline outline-1 outline-accent/50' : '',
        ].join(' ')}
      >
        {/* Drag handle dots */}
        <span className="flex-shrink-0 opacity-0 group-hover:opacity-30 cursor-grab active:cursor-grabbing" style={{ marginLeft: -2 }}>
          <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor" className="text-white">
            <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
            <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/>
            <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
          </svg>
        </span>

        {/* Type icon */}
        <span className={`flex-shrink-0 transition-colors ${isSelected ? 'text-accent' : 'text-warm-faint'}`}>
          <IC/>
        </span>

        {/* Label or rename input */}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onBlur={() => commitRename(obj)}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); commitRename(obj) }
              if (e.key === 'Escape') { setRenamingIdx(null) }
              e.stopPropagation()
            }}
            onClick={e => e.stopPropagation()}
            className="flex-1 bg-elite-700 text-warm text-[11px] font-medium px-1 py-0.5 rounded outline outline-1 outline-accent min-w-0"
            style={{ fontSize: 11 }}
          />
        ) : (
          <span className={[
            'text-[11px] font-medium truncate flex-1 transition-colors min-w-0',
            isSelected ? 'text-accent' : 'text-warm-muted group-hover:text-warm',
            !isVisible ? 'opacity-35 line-through' : '',
            isLocked   ? 'opacity-60 italic' : '',
          ].join(' ')}>
            {rowLabel}
          </span>
        )}

        {/* Lock toggle */}
        <div
          onClick={e => toggleLock(obj, e)}
          title={isLocked ? 'Unlock layer' : 'Lock layer'}
          className={[
            'flex-shrink-0 p-0.5 rounded cursor-pointer transition-all',
            isLocked
              ? 'text-accent opacity-70 hover:opacity-100'
              : 'text-warm-faint opacity-0 group-hover:opacity-50 hover:!opacity-100',
          ].join(' ')}
        >
          {isLocked ? <LockIcon/> : <UnlockIcon/>}
        </div>

        {/* Visibility toggle */}
        <div
          onClick={e => toggleVis(obj, e)}
          title={isVisible ? 'Hide layer' : 'Show layer'}
          className={[
            'flex-shrink-0 p-0.5 rounded cursor-pointer transition-all',
            isVisible
              ? 'text-warm-faint opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:text-warm'
              : 'text-warm-faint opacity-100 hover:text-warm',
          ].join(' ')}
        >
          {isVisible ? <EyeIcon size={13}/> : <EyeOffIcon size={13}/>}
        </div>
      </div>
    )
  }

  // ── Flat list of all rows (groups + children when expanded) ────────────────
  const flatList = []
  layers.forEach((item, i) => {
    const key = i
    if (item.isGroup) {
      const isOpen = expandedGroups.has(key)
      // Group header row (with expand arrow)
      flatList.push(
        <div
          key={`g${i}`}
          draggable
          onDragStart={e => onDragStart(item.obj, e)}
          onDragOver={e => onDragOver(key, e)}
          onDrop={e => onDrop(item.obj, e)}
          onDragEnd={onDragEnd}
          onClick={() => selectLayer(item.obj)}
          onDoubleClick={e => startRename(key, item.label, e)}
          className={[
            'w-full px-2 py-[6px] flex items-center gap-1.5 text-left cursor-pointer select-none group',
            'transition-all duration-75 border-l-[2px]',
            item.obj === selectedObject
              ? 'bg-accent/10 border-accent'
              : 'border-transparent hover:bg-white/[0.04]',
          ].join(' ')}
        >
          <button
            onClick={e => toggleGroup(key, e)}
            className="flex-shrink-0 text-warm-faint hover:text-warm transition-colors p-0.5"
          >
            <ChevronIcon open={isOpen}/>
          </button>
          <span className={`flex-shrink-0 ${item.obj === selectedObject ? 'text-accent' : 'text-warm-faint'}`}>
            {TYPE_ICONS.group({})}
          </span>
          {renamingIdx === key ? (
            <input
              ref={renameInputRef}
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onBlur={() => commitRename(item.obj)}
              onKeyDown={e => {
                if (e.key === 'Enter')  { e.preventDefault(); commitRename(item.obj) }
                if (e.key === 'Escape') { setRenamingIdx(null) }
                e.stopPropagation()
              }}
              onClick={e => e.stopPropagation()}
              className="flex-1 bg-elite-700 text-warm text-[11px] font-medium px-1 py-0.5 rounded outline outline-1 outline-accent min-w-0"
            />
          ) : (
            <span className={[
              'text-[11px] font-medium truncate flex-1',
              item.obj === selectedObject ? 'text-accent' : 'text-warm-muted group-hover:text-warm',
            ].join(' ')}>
              {item.label}
              <span className="text-warm-faint ml-1 font-normal opacity-50">({item.children.length})</span>
            </span>
          )}
        </div>
      )
      // Children (when expanded)
      if (isOpen) {
        item.children.forEach((child, ci) => {
          flatList.push(renderRow(child, `g${i}c${ci}`, 1))
        })
      }
    } else {
      flatList.push(renderRow(item, key, 0))
    }
  })

  // Total visible layer count (top-level only)
  const topCount = layers.length

  return (
    <div className="w-full h-full bg-elite-900 border-r border-elite-600/25 flex flex-col overflow-hidden select-none">
      {/* Header */}
      <div className="px-4 py-3 border-b border-elite-600/25 flex items-center gap-2 flex-shrink-0">
        <LayersIcon size={13} className="text-warm-faint"/>
        <h3 className="text-[11px] font-semibold text-warm-muted uppercase tracking-widest">Layers</h3>
        <span className="ml-auto text-[10px] text-warm-faint font-mono">{topCount}</span>
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto py-0.5 min-h-0">
        {flatList}
        {flatList.length === 0 && (
          <p className="text-warm-faint text-[11px] px-4 py-8 text-center">No elements on canvas</p>
        )}
      </div>

      {/* Recycle bin */}
      {deletedLayers.length > 0 && (
        <div className="border-t border-elite-600/25 flex-shrink-0">
          <button
            onClick={() => setShowRecycleBin(!showRecycleBin)}
            className="w-full px-4 py-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-warm-faint hover:text-warm transition-colors cursor-pointer"
          >
            <RestoreIcon/>
            <span>Deleted ({deletedLayers.length})</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                 className={`ml-auto transition-transform ${showRecycleBin ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {showRecycleBin && (
            <div className="max-h-[160px] overflow-y-auto pb-1">
              {deletedLayers.map((item, i) => {
                const IC = TYPE_ICONS[item.type] || ShapeLayerIcon
                return (
                  <div key={i} className="w-full px-2 py-[6px] flex items-center gap-2 text-[11px] text-warm-faint group">
                    <span className="flex-shrink-0 opacity-40"><IC/></span>
                    <span className="flex-1 truncate opacity-50 line-through">{item.label}</span>
                    <button
                      onClick={() => { canvasRef.current?.restoreDeletedLayer(i); setTimeout(() => refresh(), 100) }}
                      className="flex-shrink-0 p-1 rounded text-accent/60 hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                    >
                      <RestoreIcon/>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="px-2 py-2 border-t border-elite-600/25 flex items-center gap-1 flex-shrink-0">
        {[
          ['Bring to Front (])' , () => canvasRef.current?.bringToFront(), 'M17 11 12 6 7 11M12 18V6'],
          ['Send to Back ([)',   () => canvasRef.current?.sendToBack(),    'M7 13 12 18 17 13M12 6v12'],
        ].map(([title, fn, d]) => (
          <button key={title} title={title} onClick={fn}
            className="w-7 h-7 flex items-center justify-center rounded text-warm-faint hover:text-warm hover:bg-elite-700/60 transition-colors cursor-pointer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {d.split('M').filter(Boolean).map((p, i) => <path key={i} d={`M${p}`}/>)}
            </svg>
          </button>
        ))}
        <div className="w-px h-4 bg-elite-600/30 mx-0.5"/>
        <button title="Group selected (Cmd+G)" onClick={() => canvasRef.current?.groupSelected()}
          className="w-7 h-7 flex items-center justify-center rounded text-warm-faint hover:text-warm hover:bg-elite-700/60 transition-colors cursor-pointer">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>
          </svg>
        </button>
        <button title="Ungroup (Cmd+Shift+G)" onClick={() => canvasRef.current?.ungroupSelected()}
          className="w-7 h-7 flex items-center justify-center rounded text-warm-faint hover:text-warm hover:bg-elite-700/60 transition-colors cursor-pointer">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            <line x1="10" y1="10" x2="14" y2="14"/>
          </svg>
        </button>
        <div className="ml-auto text-[9px] text-warm-faint opacity-40 font-mono pr-1">
          Dbl-click to rename
        </div>
      </div>
    </div>
  )
}
