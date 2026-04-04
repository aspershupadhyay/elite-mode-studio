import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import * as fabric from 'fabric'
import type { Canvas as FabricCanvas, FabricObject } from 'fabric'
import type { CanvasHandle } from '@/types/canvas'
import type { ContentSchemaConfig } from '@/types/schema'
import { getActiveSchema, saveSchema } from '@/utils/schemaStorage'
import { getActiveProfile } from '@/utils/profileStorage'
import type { OutputField } from '@/types/profile'

interface ContextMenuProps {
  x: number
  y: number
  canvasRef: RefObject<CanvasHandle | null>
  canvas: FabricCanvas | null
  selectedObject: FabricObject | null
  onClose: () => void
  onSchemaChanged?: (schema: ContentSchemaConfig) => void
}

// ── Assign Slot popover ───────────────────────────────────────────────────────
// Writes obj.eliteType directly — same as the Properties Panel Content Slot.
// Field list comes from the active Profile, so custom fields always appear.

function AssignSlotPopover({
  object,
  profileFields,
  canvas,
  canvasRef,
  onDone,
}: {
  object: FabricObject
  profileFields: OutputField[]
  canvas: FabricCanvas | null
  canvasRef: RefObject<CanvasHandle | null>
  onDone: () => void
}): JSX.Element {
  const currentType  = object.eliteType  ?? ''
  const currentLabel = object.eliteLabel ?? ''

  const [slotType,  setSlotType]  = useState(currentType)
  const [slotLabel, setSlotLabel] = useState(currentLabel)

  const inp: React.CSSProperties = {
    width: '100%', padding: '5px 8px', fontSize: 11, boxSizing: 'border-box',
    background: 'var(--surface-3)', color: 'var(--text-primary)',
    border: '1px solid var(--border-default)', borderRadius: 6, outline: 'none',
  }
  const lbl: React.CSSProperties = {
    fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600,
  }

  const handleApply = (): void => {
    if (!canvas) return
    const val = slotType.trim().toLowerCase().replace(/\s+/g, '_')
    object.eliteType  = (val || undefined) as typeof object.eliteType
    object.eliteLabel = slotLabel.trim() || undefined
    canvas.renderAll()
    // Save to history so the slot assignment survives template saves
    canvasRef.current?.saveHistory()
    onDone()
  }

  return (
    <div style={{
      padding: '10px 12px 12px',
      borderTop: '1px solid var(--border-subtle)',
      background: 'var(--surface-1)',
    }}>
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Assign slot for: <strong style={{ color: 'var(--text-primary)' }}>
          {currentLabel || currentType || 'this element'}
        </strong>
      </p>

      {/* Slot type — combo of profile fields + free-type */}
      <div style={{ marginBottom: 8 }}>
        <p style={lbl}>Slot type</p>
        <input
          list="ctx-slot-types"
          value={slotType}
          placeholder="e.g. title, stat, hook…"
          style={inp}
          onChange={e => setSlotType(e.target.value)}
        />
        <datalist id="ctx-slot-types">
          {profileFields.filter(f => f.enabled).map(f => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </datalist>
      </div>

      {/* Display label */}
      <div style={{ marginBottom: 10 }}>
        <p style={lbl}>Display label <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></p>
        <input
          value={slotLabel}
          placeholder="e.g. Main Title"
          style={inp}
          onChange={e => setSlotLabel(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={handleApply}
          style={{
            flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 600,
            background: 'var(--accent)', color: 'var(--accent-fg)',
            border: 'none', borderRadius: 6, cursor: 'pointer',
          }}
        >
          Apply
        </button>
        <button
          onClick={onDone}
          style={{
            flex: 1, padding: '6px 0', fontSize: 11,
            background: 'var(--surface-3)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main ContextMenu ──────────────────────────────────────────────────────────

export default function ContextMenu({
  x, y, canvasRef, canvas, selectedObject, onClose, onSchemaChanged,
}: ContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const isMac = navigator.platform.toUpperCase().includes('MAC')
  const MOD = isMac ? '⌘' : 'Ctrl'

  const [pos,           setPos]           = useState({ left: x, top: y })
  const [showSlot,      setShowSlot]      = useState(false)
  const [activeSchema,  setActiveSchema]  = useState<ContentSchemaConfig>(() => getActiveSchema())
  const [profileFields] = useState<OutputField[]>(() => getActiveProfile().outputFields)

  // Reposition once mounted and again when popover opens (changes menu height)
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const mh = el.offsetHeight
    const mw = el.offsetWidth
    const left = Math.min(x, window.innerWidth  - mw - 8)
    const top  = y + mh > window.innerHeight - 8 ? Math.max(8, y - mh) : y
    setPos({ left, top })
  }, [x, y, showSlot])

  useEffect(() => {
    setActiveSchema(getActiveSchema())
  }, [])

  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', click)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', click)
      document.removeEventListener('keydown', key)
    }
  }, [onClose])

  const h            = canvasRef.current
  const hasSelection = !!selectedObject
  const isGroup      = selectedObject instanceof fabric.Group && !(selectedObject instanceof fabric.ActiveSelection)
  const hasMultiple  = (canvas?.getActiveObjects().length ?? 0) > 1
  const run          = (fn: () => void): void => { fn(); onClose() }

  const eliteLabel       = selectedObject?.eliteLabel
  const isLockedInSchema = !!(eliteLabel && activeSchema.singlePost?.lockedElements.includes(eliteLabel))

  const Item = ({
    label, shortcut, onClick, disabled, danger, accent,
  }: {
    label: string; shortcut?: string; onClick: () => void
    disabled?: boolean; danger?: boolean; accent?: boolean
  }): JSX.Element => (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '5px 12px', background: 'none', border: 'none',
        cursor: disabled ? 'default' : 'pointer', outline: 'none',
        borderRadius: 4,
        margin: '0 3px',
        maxWidth: 'calc(100% - 6px)',
        color: disabled
          ? 'rgba(255,255,255,0.25)'
          : danger  ? '#ef4444'
          : accent  ? 'var(--accent)'
          : 'rgba(255,255,255,0.88)',
        fontSize: 12,
        fontWeight: 450,
        transition: 'background 0.08s',
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
    >
      <span>{label}</span>
      {shortcut && (
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'SF Mono, Menlo, monospace', marginLeft: 16, fontWeight: 400 }}>
          {shortcut}
        </span>
      )}
    </button>
  )

  const Divider = (): JSX.Element => (
    <div style={{ margin: '3px 8px', borderTop: '1px solid rgba(255,255,255,0.06)' }} />
  )

  const handleLockToggle = (): void => {
    if (!eliteLabel) { onClose(); return }
    const existing   = activeSchema.singlePost?.lockedElements ?? []
    const nextLocked = isLockedInSchema
      ? existing.filter(l => l !== eliteLabel)
      : [...existing, eliteLabel]
    const updated: ContentSchemaConfig = {
      ...activeSchema,
      singlePost: activeSchema.singlePost
        ? { ...activeSchema.singlePost, lockedElements: nextLocked }
        : { templateId: '', slotMapping: [], allowUserCustomization: true, lockedElements: nextLocked },
    }
    try {
      saveSchema(updated); setActiveSchema(updated); onSchemaChanged?.(updated)
      if (selectedObject && canvas) {
        const lock = !isLockedInSchema
        selectedObject.set({
          selectable: !lock, evented: !lock,
          lockMovementX: lock, lockMovementY: lock,
          lockScalingX: lock, lockScalingY: lock, lockRotation: lock,
        })
        canvas.renderAll()
      }
    } catch (err) {
      console.error('[ContextMenu] lock toggle failed:', err)
    }
    onClose()
  }

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed', zIndex: 9999,
        left: pos.left, top: pos.top,
        width: 240,
        background: 'rgba(28,28,30,0.96)',
        backdropFilter: 'blur(20px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)',
        padding: '4px 0',
        userSelect: 'none',
      }}
    >
      <Item label="Cut"       shortcut={`${MOD}X`}  disabled={!hasSelection} onClick={() => run(() => { h?.copy(); h?.deleteSelected() })}/>
      <Item label="Copy"      shortcut={`${MOD}C`}  disabled={!hasSelection} onClick={() => run(() => h?.copy())}/>
      <Item label="Paste"     shortcut={`${MOD}V`}  onClick={() => run(() => { void h?.pasteFromClipboard() })}/>
      <Item label="Duplicate"  shortcut={`${MOD}D`}  disabled={!hasSelection} onClick={() => run(() => h?.duplicateSelected())}/>
      <Divider/>
      <Item label="Bring to Front" shortcut="]"    disabled={!hasSelection} onClick={() => run(() => h?.bringToFront())}/>
      <Item label="Bring Forward"                  disabled={!hasSelection} onClick={() => run(() => h?.bringForward())}/>
      <Item label="Send Backward"                  disabled={!hasSelection} onClick={() => run(() => h?.sendBackward())}/>
      <Item label="Send to Back"   shortcut="["    disabled={!hasSelection} onClick={() => run(() => h?.sendToBack())}/>
      <Divider/>
      <Item label="Group"   shortcut={`${MOD}G`}   disabled={!hasMultiple} onClick={() => run(() => h?.groupSelected())}/>
      <Item label="Ungroup" shortcut={`${MOD}⇧G`}  disabled={!isGroup}    onClick={() => run(() => h?.ungroupSelected())}/>
      <Divider/>
      <Item label="Flip Horizontal" disabled={!hasSelection} onClick={() => run(() => h?.flipHorizontal())}/>
      <Item label="Flip Vertical"   disabled={!hasSelection} onClick={() => run(() => h?.flipV())}/>
      <Divider/>
      <Item label="Show / Hide"   disabled={!hasSelection} onClick={() => run(() => h?.toggleVisibility())}/>
      <Item label="Lock / Unlock" disabled={!hasSelection} onClick={() => run(() => h?.toggleLock())}/>
      <Divider/>
      <Item
        label="Assign Content Slot..."
        disabled={!hasSelection}
        accent
        onClick={() => setShowSlot(v => !v)}
      />
      <Item
        label={isLockedInSchema ? 'Unlock Schema Element' : 'Lock Schema Element'}
        disabled={!hasSelection || !eliteLabel}
        accent
        onClick={handleLockToggle}
      />
      <Divider/>
      <Item label="Delete" shortcut="⌫" disabled={!hasSelection} danger onClick={() => run(() => h?.deleteSelected())}/>

      {showSlot && selectedObject && (
        <AssignSlotPopover
          object={selectedObject}
          profileFields={profileFields}
          canvas={canvas}
          canvasRef={canvasRef}
          onDone={() => { setShowSlot(false); onClose() }}
        />
      )}
    </div>
  )
}
