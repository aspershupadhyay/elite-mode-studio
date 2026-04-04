import { useEffect, useState, useCallback, useRef } from 'react'
import type { RefObject } from 'react'
import * as fabric from 'fabric'
import { EyeIcon, EyeOffIcon, TextLayerIcon, ImageLayerIcon, ShapeLayerIcon,
         GradientLayerIcon, LineLayerIcon, TagLayerIcon, LayersIcon } from '../icons/Icons'
import '@/types/fabric-custom'
import type { FabricObject, Canvas as FabricCanvas } from 'fabric'
import type { CanvasHandle } from '@/types/canvas'
import { LayerRow } from './layer/LayerRow'
import { DeletedLayerBar } from './layer/DeletedLayerBar'
import type { DeletedLayerItem } from './layer/DeletedLayerBar'

// ── Types ────────────────────────────────────────────────────────────────────
export interface LayerPanelProps {
  canvas: FabricCanvas | null
  selectedObject: FabricObject | null
  canvasRef: RefObject<CanvasHandle | null>
  tick: number
  collapsed?: boolean
  onToggleCollapse?: () => void
}

interface LayerTreeNode {
  obj: FabricObject
  label: string
  iconKey: string
  isGroup: boolean
  children?: LayerTreeNode[]
}

// ── Icons map ────────────────────────────────────────────────────────────────
const TYPE_ICONS: Record<string, React.ComponentType<Record<string, unknown>>> = {
  title:       TextLayerIcon,
  text:        TextLayerIcon,
  tag:         TagLayerIcon,
  image:       ImageLayerIcon,
  shape:       ShapeLayerIcon,
  gradient:    GradientLayerIcon,
  line:        LineLayerIcon,
  frame: (p: Record<string, unknown>) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="2" y="2" width="20" height="20" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="M21 15l-5-5L5 21"/>
    </svg>
  ),
  icon: (p: Record<string, unknown>) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  logo: (p: Record<string, unknown>) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="10"/>
      <path d="M8 12l2 2 4-4"/>
    </svg>
  ),
  group: (p: Record<string, unknown>) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="3" width="8" height="8" rx="1"/>
      <rect x="13" y="13" width="8" height="8" rx="1"/>
    </svg>
  ),
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const BUILTIN_ELITE_TYPES = new Set(['title','text','tag','image','frame','background','logo','code','icon','shape','line','gradient','accent_line','group'])

/** Content-aware label: shows actual text content, shape names, frame shapes, icon ids */
function autoLabel(obj: FabricObject, index: number): string {
  if (obj.eliteLabel) return obj.eliteLabel

  const t = obj.eliteType || ''
  const textObj = obj as FabricObject & { text?: string }
  const truncText = (s: string, max = 22): string => {
    const clean = s.replace(/\n/g, ' ').trim()
    return clean.length > max ? clean.slice(0, max) + '...' : clean
  }

  // Elite types — content-aware labels
  if (t === 'title' && textObj.text)  return truncText(textObj.text)
  if (t === 'title')                  return 'Title'
  if (t === 'text' && textObj.text)   return truncText(textObj.text)
  if (t === 'text')                   return 'Body Text'
  if (t === 'tag' && textObj.text)    return truncText(textObj.text)
  if (t === 'tag')                    return 'Tag / Badge'
  if (t === 'gradient')               return 'Gradient Overlay'
  if (t === 'logo')                   return 'Logo'
  if (t === 'frame') {
    const shape = (obj as FabricObject & { eliteFrameShape?: string }).eliteFrameShape
    if (shape) {
      const name = shape.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      return `${name} Frame`
    }
    return 'Frame'
  }
  if (t === 'icon') {
    const iconId = (obj as FabricObject & { eliteIconId?: string }).eliteIconId
    if (iconId) {
      const name = iconId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      return `${name} Icon`
    }
    return 'Icon'
  }
  if (t === 'image')   return 'Image'
  if (t === 'shape')   return 'Shape'
  if (t === 'line')    return 'Line'

  // Custom slot — show field id as label
  if (t && !BUILTIN_ELITE_TYPES.has(t)) return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  // Fabric type fallback — show content for text, descriptive names for shapes
  const ft = obj.type || ''
  if ((ft === 'textbox' || ft === 'i-text') && textObj.text) return truncText(textObj.text)
  if (ft === 'textbox' || ft === 'i-text') return `Text ${index + 1}`
  if (ft === 'image')    return 'Pasted Image'
  if (ft === 'rect')     return 'Rectangle'
  if (ft === 'circle')   return 'Circle'
  if (ft === 'triangle') return 'Triangle'
  if (ft === 'ellipse')  return 'Ellipse'
  if (ft === 'polygon')  return 'Polygon'
  if (ft === 'group')    return `Group`
  if (ft === 'path')     return 'Path'
  if (ft === 'line')     return 'Line'
  return `Layer ${index + 1}`
}

function resolveIconKey(obj: FabricObject): string {
  if (obj.eliteType) return obj.eliteType
  const ft = obj.type || ''
  if (ft === 'textbox' || ft === 'i-text') return 'text'
  if (ft === 'image')  return 'image'
  if (ft === 'group')  return 'group'
  if (ft === 'path' || ft === 'line') return 'line'
  return 'shape'
}

function buildLayerTree(canvas: FabricCanvas): LayerTreeNode[] {
  if (!canvas) return []
  const all  = canvas.getObjects()
  const tree: LayerTreeNode[] = []
  let idx = 0
  for (let i = all.length - 1; i >= 0; i--) {
    const obj = all[i]
    if ((obj as FabricObject & { _isControlsGroup?: boolean })._isControlsGroup ||
        (obj.evented === false && obj.selectable === false)) continue
    const label   = autoLabel(obj, idx)
    const iconKey = resolveIconKey(obj)
    // Only expand groups that have no specific eliteType (or explicitly 'group').
    // Logo, icon, etc. are Groups but should appear as leaf nodes.
    const isExpandableGroup = obj instanceof fabric.Group
      && !(obj instanceof fabric.ActiveSelection)
      && (!obj.eliteType || obj.eliteType === 'group')
    if (isExpandableGroup) {
      const children = obj.getObjects().map((c, ci) => ({
        obj: c,
        label:   autoLabel(c, ci),
        iconKey: resolveIconKey(c),
        isGroup: false,
      }))
      tree.push({ obj, label, iconKey, isGroup: true, children })
    } else {
      tree.push({ obj, label, iconKey, isGroup: false })
    }
    idx++
  }
  return tree
}

// ── Component icons ──────────────────────────────────────────────────────────
const ChevronIcon = ({ open }: { open: boolean }): JSX.Element => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
       style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)

// ── Main Component ────────────────────────────────────────────────────────────
export default function LayerPanel({ canvas, selectedObject, canvasRef, tick, collapsed = false, onToggleCollapse }: LayerPanelProps): JSX.Element {
  const [layers, setLayers]               = useState<LayerTreeNode[]>([])
  const [deletedLayers, setDeletedLayers] = useState<DeletedLayerItem[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string | number>>(new Set())
  const [renamingIdx, setRenamingIdx]     = useState<string | number | null>(null)
  const [renameVal, setRenameVal]         = useState('')
  const [searchQuery, setSearchQuery]     = useState('')
  const renameInputRef                    = useRef<HTMLInputElement>(null)

  const dragSrcRef  = useRef<FabricObject | null>(null)
  const [dragOver, setDragOver] = useState<string | number | null>(null)

  const refresh = useCallback((): void => {
    if (!canvas) return
    setLayers(buildLayerTree(canvas))
    if (canvasRef.current) {
      const deleted = (canvasRef.current as CanvasHandle & { getDeletedLayers?: () => DeletedLayerItem[] }).getDeletedLayers?.()
      if (deleted) setDeletedLayers(deleted)
    }
  }, [canvas, canvasRef])

  useEffect(() => {
    if (!canvas) return
    refresh()
    canvas.on('object:added',    refresh)
    canvas.on('object:removed',  refresh)
    canvas.on('object:modified', refresh)
    canvas.on('text:changed',    refresh)
    return () => {
      canvas.off('object:added',    refresh)
      canvas.off('object:removed',  refresh)
      canvas.off('object:modified', refresh)
      canvas.off('text:changed',    refresh)
    }
  }, [canvas, refresh])

  useEffect(() => { refresh() }, [tick, refresh])
  useEffect(() => { refresh() }, [selectedObject, refresh])
  useEffect(() => {
    if (renamingIdx !== null) renameInputRef.current?.select()
  }, [renamingIdx])

  const selectLayer = (obj: FabricObject): void => {
    if (!canvas) return
    canvas.setActiveObject(obj)
    canvas.renderAll()
  }

  const toggleVis = (obj: FabricObject, e: React.MouseEvent): void => {
    e.stopPropagation()
    obj.set('visible', !obj.visible)
    canvas?.renderAll()
    refresh()
  }

  const toggleLock = (obj: FabricObject, e: React.MouseEvent): void => {
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

  const startRename = (key: string | number, currentLabel: string, e: React.MouseEvent): void => {
    e.stopPropagation()
    setRenamingIdx(key)
    setRenameVal(currentLabel)
  }

  const commitRename = (obj: FabricObject): void => {
    if (renameVal.trim()) {
      obj.eliteLabel = renameVal.trim()
      canvas?.renderAll()
    }
    setRenamingIdx(null)
    refresh()
  }

  const toggleGroup = (key: string | number, e: React.MouseEvent): void => {
    e.stopPropagation()
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const onDragStart = (obj: FabricObject, e: React.DragEvent): void => {
    dragSrcRef.current = obj
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', '')
  }

  const onDragOver = (i: string | number, e: React.DragEvent): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(i)
  }

  const onDrop = (targetObj: FabricObject, e: React.DragEvent): void => {
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
    refresh()
  }

  const onDragEnd = (): void => { dragSrcRef.current = null; setDragOver(null) }

  const renderRow = (item: LayerTreeNode, key: string | number, depth = 0): JSX.Element => {
    const obj = item.obj
    const isSelected = obj === selectedObject
    const isRenaming = renamingIdx === key
    const isDragOverRow = dragOver === key

    return (
      <LayerRow
        key={key}
        object={obj}
        label={item.label}
        iconKey={item.iconKey}
        isSelected={isSelected}
        depth={depth}
        isDragOver={isDragOverRow}
        isRenaming={isRenaming}
        renameVal={renameVal}
        rowKey={key}
        onSelect={() => selectLayer(obj)}
        onToggleVisible={(e) => toggleVis(obj, e)}
        onToggleLock={(e) => toggleLock(obj, e)}
        onDragStart={(e) => onDragStart(obj, e)}
        onDragOver={(e) => onDragOver(key, e)}
        onDrop={(e) => onDrop(obj, e)}
        onDragEnd={onDragEnd}
        onDoubleClick={(e) => startRename(key, item.label, e)}
        onRenameChange={setRenameVal}
        onRenameBlur={() => commitRename(obj)}
        onRenameKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commitRename(obj) }
          if (e.key === 'Escape') { setRenamingIdx(null) }
          e.stopPropagation()
        }}
        renameInputRef={renameInputRef}
        typeIcons={TYPE_ICONS}
      />
    )
  }

  // Filter layers by search query
  const query = searchQuery.toLowerCase().trim()
  const filteredLayers = query
    ? layers.filter(item => {
        if (item.label.toLowerCase().includes(query)) return true
        if (item.children?.some(c => c.label.toLowerCase().includes(query))) return true
        return false
      })
    : layers

  const flatList: JSX.Element[] = []
  filteredLayers.forEach((item, i) => {
    const key = i
    if (item.isGroup) {
      const isOpen = expandedGroups.has(key)
      const GroupIcon = TYPE_ICONS['group']
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
            <GroupIcon/>
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
              <span className="text-warm-faint ml-1 font-normal opacity-50">({item.children?.length})</span>
            </span>
          )}
        </div>
      )
      if (isOpen) {
        item.children?.forEach((child, ci) => {
          flatList.push(renderRow(child, `g${i}c${ci}`, 1))
        })
      }
    } else {
      flatList.push(renderRow(item, key, 0))
    }
  })

  const topCount = layers.length

  return (
    <div className="w-full h-full studio-panel border-r border-elite-600/25 flex flex-col overflow-hidden select-none">
      {/* Header */}
      <div className="px-2 py-2.5 border-b border-elite-600/25 flex items-center gap-2 flex-shrink-0 min-w-0">
        {!collapsed && <LayersIcon size={13} className="text-warm-faint flex-shrink-0"/>}
        {!collapsed && (
          <>
            <h3 className="text-[11px] font-semibold text-warm-muted uppercase tracking-widest truncate">Layers</h3>
            <span className="ml-auto text-[10px] text-warm-faint font-mono flex-shrink-0">{topCount}</span>
          </>
        )}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand Layers' : 'Collapse Layers'}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-warm-faint hover:text-warm hover:bg-white/[0.06] transition-colors cursor-pointer"
          style={{ marginLeft: collapsed ? 'auto' : undefined }}
        >
          {/* › when collapsed (expand), ‹ when expanded (collapse) */}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {collapsed
              ? <path d="M9 18l6-6-6-6"/>   /* › right arrow = expand */
              : <path d="M15 18l-6-6 6-6"/>  /* ‹ left arrow  = collapse */
            }
          </svg>
        </button>
      </div>

      {/* Search — shown when 10+ layers */}
      {!collapsed && topCount >= 10 && (
        <div className="px-2 py-1.5 border-b border-elite-600/25 flex-shrink-0">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter layers..."
            className="w-full bg-elite-800 border border-elite-600/30 rounded px-2 py-1 text-[11px] text-warm placeholder:text-warm-faint/50 focus:border-accent/50 outline-none"
          />
        </div>
      )}

      {/* Layer list — hidden when collapsed */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto py-0.5 min-h-0">
          {flatList}
          {flatList.length === 0 && (
            <p className="text-warm-faint text-[11px] px-4 py-8 text-center">
              {searchQuery ? 'No matching layers' : 'No elements'}
            </p>
          )}
        </div>
      )}

      {/* Recycle bin */}
      {!collapsed && deletedLayers.length > 0 && (
        <DeletedLayerBar
          count={deletedLayers.length}
          items={deletedLayers}
          typeIcons={TYPE_ICONS}
          onRestore={(i) => {
            (canvasRef.current as CanvasHandle & { restoreDeletedLayer?: (i: number) => void })
              ?.restoreDeletedLayer?.(i)
            setTimeout(() => refresh(), 100)
          }}
        />
      )}

      {/* Bottom toolbar — hidden when collapsed */}
      {!collapsed && <div className="px-2 py-2 border-t border-elite-600/25 flex items-center gap-1 flex-shrink-0">
        {([
          ['Bring to Front (])' , () => (canvasRef.current as CanvasHandle & { bringToFront?: () => void })?.bringToFront?.(), 'M17 11 12 6 7 11M12 18V6'],
          ['Send to Back ([)',   () => (canvasRef.current as CanvasHandle & { sendToBack?: () => void })?.sendToBack?.(),    'M7 13 12 18 17 13M12 6v12'],
        ] as [string, () => void, string][]).map(([title, fn, d]) => (
          <button key={title} title={title} onClick={fn}
            className="w-7 h-7 flex items-center justify-center rounded text-warm-faint hover:text-warm hover:bg-elite-700/60 transition-colors cursor-pointer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {d.split('M').filter(Boolean).map((p, i) => <path key={i} d={`M${p}`}/>)}
            </svg>
          </button>
        ))}
        <div className="w-px h-4 bg-elite-600/30 mx-0.5"/>
        <button title="Group selected (Cmd+G)"
          onClick={() => (canvasRef.current as CanvasHandle & { groupSelected?: () => void })?.groupSelected?.()}
          className="w-7 h-7 flex items-center justify-center rounded text-warm-faint hover:text-warm hover:bg-elite-700/60 transition-colors cursor-pointer">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>
          </svg>
        </button>
        <button title="Ungroup (Cmd+Shift+G)"
          onClick={() => canvasRef.current?.ungroupSelected()}
          className="w-7 h-7 flex items-center justify-center rounded text-warm-faint hover:text-warm hover:bg-elite-700/60 transition-colors cursor-pointer">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            <line x1="10" y1="10" x2="14" y2="14"/>
          </svg>
        </button>
        <div className="ml-auto text-[9px] text-warm-faint opacity-40 font-mono pr-1">
          Dbl-click to rename
        </div>
      </div>}
    </div>
  )
}
