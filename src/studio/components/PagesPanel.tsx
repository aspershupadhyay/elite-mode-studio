/**
 * PagesPanel — premium two-state page strip.
 *
 * Closed: slim pill bar with dot indicators, gradient-masked, clickable.
 * Open:   thumbnail cards with numbered badges, drag-reorder, context menu.
 *
 * All colors are resolved from design-system CSS variables — zero hardcoded values.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { FileText, Copy, LayoutTemplate, Pencil, ArrowLeft, ArrowRight, Trash2, Plus } from 'lucide-react'
import type { MouseEvent, DragEvent, KeyboardEvent } from 'react'
import type { Page, Template } from '@/types/domain'
import { getTemplates } from '../data/templateStorage'

// ── Constants ─────────────────────────────────────────────────────────────────
const THUMB_W  = 72
const THUMB_H  = 96
const OPEN_H   = THUMB_H + 40
const CLOSED_H = 36

// ── Props ─────────────────────────────────────────────────────────────────────
interface PagesPanelProps {
  pages:             Page[]
  activePage:        number
  onSwitch:          (index: number) => void
  onAddBlank:        () => void
  onDuplicate:       (index: number) => void
  onDelete:          (index: number) => void
  onRename:          (index: number, name: string) => void
  onReorder:         (fromIndex: number, toIndex: number) => void
  onAddFromTemplate: (templateJSON: string) => void
  collapsed?:        boolean
  onToggleCollapse?: () => void
}

// ── Chevron toggle button ─────────────────────────────────────────────────────
function ChevronBtn({ open, onClick }: { open: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      title={open ? 'Hide pages  Ctrl+Shift+P' : 'Show pages  Ctrl+Shift+P'}
      style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
        border: '1px solid var(--border)',
        background: 'var(--bg3)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text2)',
        transition: 'transform .22s cubic-bezier(0.34,1.56,0.64,1), box-shadow .15s, background .15s, color .15s',
      }}
      onMouseEnter={e => {
        const b = e.currentTarget as HTMLButtonElement
        b.style.transform = 'scale(1.08) translateY(-1px)'
        b.style.boxShadow = '0 4px 14px color-mix(in srgb, var(--bg) 60%, transparent)'
        b.style.color = 'var(--accent)'
        b.style.background = 'var(--bg2)'
        b.style.borderColor = 'color-mix(in srgb, var(--accent) 40%, transparent)'
      }}
      onMouseLeave={e => {
        const b = e.currentTarget as HTMLButtonElement
        b.style.transform = ''
        b.style.boxShadow = ''
        b.style.color = 'var(--text2)'
        b.style.background = 'var(--bg3)'
        b.style.borderColor = 'var(--border)'
      }}
    >
      {/* Inline SVG so we can control stroke-width precisely */}
      <svg
        width="12" height="12" viewBox="0 0 12 12" fill="none"
        style={{
          transition: 'transform .3s cubic-bezier(0.34,1.56,0.64,1)',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        }}
      >
        <path d="M2 8L6 4L10 8"
          stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

// ── Progress track (closed state) ────────────────────────────────────────────
function ProgressTrack({
  total, active, onJump,
}: { total: number; active: number; onJump: (i: number) => void }) {
  const progress = total > 1 ? active / (total - 1) : 0

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const target = Math.round(ratio * (total - 1))
    onJump(Math.max(0, Math.min(total - 1, target)))
  }

  return (
    <div
      onClick={handleClick}
      title={`Page ${active + 1} of ${total} — click to jump`}
      style={{
        flex: 1, height: 20,
        display: 'flex', alignItems: 'center',
        cursor: 'pointer', padding: '0 2px',
      }}
    >
      {/* Track */}
      <div style={{
        flex: 1, height: 3, borderRadius: 999,
        background: 'color-mix(in srgb, var(--text) 9%, transparent)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Fill */}
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: `max(${progress * 100}%, 12px)`,
          background: 'var(--accent)',
          borderRadius: 999,
          transition: 'width .3s cubic-bezier(0.34,1.56,0.64,1)',
          boxShadow: '0 0 6px color-mix(in srgb, var(--accent) 50%, transparent)',
        }} />
      </div>
    </div>
  )
}

// ── FloatingMenu ──────────────────────────────────────────────────────────────
function MenuItem({
  icon, label, onClick, danger = false, disabled = false,
}: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      onMouseDown={e => { e.stopPropagation(); if (!disabled) onClick() }}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: 'calc(100% - 8px)', padding: '7px 14px',
        background: 'none', border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--text3)' : danger ? 'var(--status-red, #f87171)' : 'var(--text)',
        fontSize: 12, fontWeight: 500, textAlign: 'left',
        borderRadius: 6, margin: '1px 4px',
        transition: 'background .1s',
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg3)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
    >
      <span style={{ opacity: disabled ? 0.35 : 1, display: 'flex' }}>{icon}</span>
      {label}
    </button>
  )
}

function FloatingMenu({
  x, y, anchorBottom = false, children, onClose,
}: { x: number; y: number; anchorBottom?: boolean; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const id = setTimeout(() => document.addEventListener('mousedown', close), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', close) }
  }, [onClose])

  const s: React.CSSProperties = {
    position: 'fixed', zIndex: 99999,
    background: 'var(--bg2)',
    border: '1px solid color-mix(in srgb, var(--text) 8%, transparent)',
    borderRadius: 10, minWidth: 176,
    boxShadow: '0 12px 40px color-mix(in srgb, var(--bg) 80%, transparent)',
    padding: '5px 0',
    animation: 'ppFadeUp .14s cubic-bezier(0.16,1,0.3,1)',
  }
  if (anchorBottom) { s.left = x; s.bottom = window.innerHeight - y + 8 }
  else              { s.left = x; s.top    = y + 8 }
  if (typeof s.left === 'number' && s.left + 200 > window.innerWidth) s.left = window.innerWidth - 210

  return (
    <div ref={ref} style={s} onMouseDown={e => e.stopPropagation()}>{children}</div>
  )
}

// ── Thumbnail card (open state) ───────────────────────────────────────────────
interface PageCardProps {
  page: Page; index: number; isActive: boolean; isDragging: boolean
  isDropTarget: boolean; isRenaming: boolean; renameVal: string; pageCount: number
  onSwitch: () => void; onContextMenu: (e: MouseEvent<HTMLDivElement>) => void
  onDragStart: (e: DragEvent<HTMLDivElement>) => void; onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void; onDragEnd: () => void
  onDelete: (e: MouseEvent<HTMLButtonElement>) => void
  onRenameChange: (v: string) => void; onRenameBlur: () => void
  onRenameKey: (e: KeyboardEvent<HTMLInputElement>) => void
}

function PageCard({
  page, index, isActive, isDragging, isDropTarget, isRenaming,
  renameVal, pageCount, onSwitch, onContextMenu,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onDelete, onRenameChange, onRenameBlur, onRenameKey,
}: PageCardProps) {
  return (
    <div
      className="pp-wrap"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 6, flexShrink: 0, position: 'relative',
        opacity: isDragging ? 0.3 : 1,
        transition: 'opacity .15s',
      }}
    >
      {/* Drop indicator */}
      {isDropTarget && (
        <div style={{
          position: 'absolute', left: -3, top: 0, bottom: 20,
          width: 2, background: 'var(--accent)',
          borderRadius: 2, zIndex: 10, pointerEvents: 'none',
        }} />
      )}

      {/* Card shell */}
      <div
        onClick={onSwitch}
        onContextMenu={onContextMenu}
        className={`pp-card${isActive ? ' pp-card--active' : ''}`}
        style={{
          position: 'relative',
          width: THUMB_W, height: THUMB_H,
          borderRadius: 10,
          border: `2px solid ${isActive ? 'var(--accent)' : 'color-mix(in srgb, var(--text) 7%, transparent)'}`,
          boxShadow: isActive
            ? '0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent), 0 0 24px color-mix(in srgb, var(--accent) 14%, transparent), 0 6px 20px color-mix(in srgb, var(--bg) 80%, transparent)'
            : '0 2px 10px color-mix(in srgb, var(--bg) 70%, transparent)',
          background: 'transparent',
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'border-color .18s, box-shadow .18s, transform .16s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Thumbnail */}
        {page.thumbnail
          ? <img src={page.thumbnail} alt="" draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                <rect x="3" y="3" width="16" height="16" rx="3"
                  stroke="color-mix(in srgb, var(--text) 10%, transparent)" strokeWidth="1.5" />
                <rect x="6" y="7.5"  width="10" height="1.5" rx="0.75"
                  fill="color-mix(in srgb, var(--text) 7%, transparent)" />
                <rect x="6" y="11"   width="7"  height="1.5" rx="0.75"
                  fill="color-mix(in srgb, var(--text) 5%, transparent)" />
                <rect x="6" y="14.5" width="5"  height="1.5" rx="0.75"
                  fill="color-mix(in srgb, var(--text) 3%, transparent)" />
              </svg>
            </div>
          )
        }

        {/* Active accent bar */}
        {isActive && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: 'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 60%, transparent))',
          }} />
        )}

        {/* Delete button — top-right, visible on hover via CSS */}
        {pageCount > 1 && (
          <button
            onClick={onDelete}
            title="Delete page"
            className="pp-del"
            style={{
              position: 'absolute', top: 5, right: 5,
              width: 20, height: 20, borderRadius: 6,
              background: 'color-mix(in srgb, var(--bg) 85%, transparent)',
              border: '1px solid color-mix(in srgb, var(--text) 12%, transparent)',
              color: 'var(--status-red, #f87171)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0, transition: 'opacity .15s, background .12s', padding: 0,
              backdropFilter: 'blur(6px)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--status-red, #ef4444) 22%, transparent)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--bg) 85%, transparent)' }}
          >
            <Trash2 size={9} />
          </button>
        )}

        {/* Inline rename */}
        {isRenaming && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'color-mix(in srgb, var(--bg) 92%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 7px', backdropFilter: 'blur(6px)',
          }}>
            <input
              autoFocus value={renameVal}
              onClick={e => e.stopPropagation()}
              onChange={e => onRenameChange(e.target.value)}
              onBlur={onRenameBlur}
              onKeyDown={onRenameKey}
              style={{
                width: '100%',
                background: 'color-mix(in srgb, var(--text) 6%, transparent)',
                border: '1px solid var(--accent)',
                borderRadius: 5, color: 'var(--text)',
                fontSize: 9, padding: '4px 6px',
                outline: 'none', textAlign: 'center', fontWeight: 600,
              }}
            />
          </div>
        )}
      </div>

      {/* Number badge — centered inside card, pinned to bottom */}
      <div
        className="pp-badge"
        style={{
          position: 'absolute',
          bottom: 7,
          left: '50%',
          transform: 'translateX(-50%)',
          minWidth: 20, height: 20,
          padding: '0 6px',
          borderRadius: 20,
          background: isActive
            ? 'var(--accent)'
            : 'color-mix(in srgb, var(--bg2) 94%, transparent)',
          border: `1.5px solid ${isActive
            ? 'color-mix(in srgb, var(--accent) 60%, transparent)'
            : 'color-mix(in srgb, var(--text) 14%, transparent)'}`,
          color: isActive ? '#fff' : 'var(--text3)',
          fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          letterSpacing: '0.03em', lineHeight: 1,
          backdropFilter: 'blur(8px)',
          boxShadow: isActive
            ? '0 2px 8px color-mix(in srgb, var(--accent) 40%, transparent)'
            : '0 1px 4px color-mix(in srgb, var(--bg) 60%, transparent)',
          transition: 'opacity .15s, background .18s, color .18s, box-shadow .18s',
          zIndex: 3,
          whiteSpace: 'nowrap',
        }}
      >
        {index + 1}
      </div>

    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PagesPanel({
  pages, activePage,
  onSwitch, onAddBlank, onDuplicate, onDelete, onRename, onReorder, onAddFromTemplate,
  collapsed = false, onToggleCollapse,
}: PagesPanelProps): JSX.Element {

  const [showAddMenu,        setShowAddMenu]        = useState(false)
  const [addMenuAnchor,      setAddMenuAnchor]      = useState({ x: 0, y: 0 })
  const [ctxMenu,            setCtxMenu]            = useState<{ index: number; x: number; y: number } | null>(null)
  const [renamingIdx,        setRenamingIdx]        = useState<number | null>(null)
  const [renameVal,          setRenameVal]          = useState('')
  const [dragFrom,           setDragFrom]           = useState<number | null>(null)
  const [dragOver,           setDragOver]           = useState<number | null>(null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [savedTemplates,     setSavedTemplates]     = useState<Template[]>([])
  const [tplAnchor,          setTplAnchor]          = useState({ x: 0, y: 0 })

  const scrollRef = useRef<HTMLDivElement>(null)

  // Escape closes menus
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddMenu(false); setCtxMenu(null); setShowTemplatePicker(false)
        if (renamingIdx !== null) setRenamingIdx(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [renamingIdx])

  // Add-page menu
  const openAddMenu = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
    setAddMenuAnchor({ x: rect.left, y: rect.top })
    setShowAddMenu(v => !v)
  }

  // Context menu
  const openCtx = (e: MouseEvent<HTMLDivElement>, idx: number) => {
    e.preventDefault(); e.stopPropagation()
    setCtxMenu({ index: idx, x: e.clientX, y: e.clientY })
  }

  // Rename
  const startRename = (idx: number) => {
    setRenamingIdx(idx)
    setRenameVal(pages[idx]?.label ?? `Page ${idx + 1}`)
    setCtxMenu(null)
  }
  const commitRename = () => {
    if (renamingIdx !== null && renameVal.trim()) onRename(renamingIdx, renameVal.trim())
    setRenamingIdx(null)
  }
  const handleRenameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') setRenamingIdx(null)
  }

  // Drag-to-reorder
  const onDragStart = (e: DragEvent<HTMLDivElement>, idx: number) => {
    setDragFrom(idx); e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }
  const onDragOverCard = (e: DragEvent<HTMLDivElement>, idx: number) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(idx)
  }
  const onDrop = (e: DragEvent<HTMLDivElement>, toIdx: number) => {
    e.preventDefault()
    if (dragFrom !== null && dragFrom !== toIdx) onReorder(dragFrom, toIdx)
    setDragFrom(null); setDragOver(null)
  }
  const onDragEnd = () => { setDragFrom(null); setDragOver(null) }

  // Template picker
  const openTemplatePicker = async (ax: number, ay: number) => {
    const tpls = await getTemplates()
    setSavedTemplates(tpls)
    setTplAnchor({ x: ax, y: ay })
    setShowAddMenu(false); setShowTemplatePicker(true)
  }

  // Page reorder helpers
  const moveLeft  = useCallback((idx: number) => { if (idx > 0) onReorder(idx, idx - 1); setCtxMenu(null) }, [onReorder])
  const moveRight = useCallback((idx: number) => { if (idx < pages.length - 1) onReorder(idx, idx + 1); setCtxMenu(null) }, [onReorder, pages.length])

  // ── CLOSED STATE ─────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div style={{
        flexShrink: 0, height: CLOSED_H,
        background: 'var(--bg2)',
        display: 'flex', alignItems: 'center',
        padding: '0 12px', gap: 12,
      }}>
        {/* Current / Total — far left */}
        <span style={{
          flexShrink: 0, fontSize: 11, color: 'var(--text2)',
          fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span style={{ color: 'var(--text)' }}>{activePage + 1}</span>
          <span style={{ color: 'var(--text3)', fontWeight: 400, margin: '0 3px' }}>/</span>
          <span>{pages.length}</span>
        </span>

        {/* Progress track — center, inside pill */}
        <div style={{
          flex: 1, borderRadius: 999,
          background: 'color-mix(in srgb, var(--text) 3%, transparent)',
          border: '1px solid var(--border)',
          padding: '0 10px',
        }}>
          <ProgressTrack total={pages.length} active={activePage} onJump={onSwitch} />
        </div>

        {/* Chevron — far right, points up */}
        <ChevronBtn open={false} onClick={onToggleCollapse} />
      </div>
    )
  }

  // ── OPEN STATE ───────────────────────────────────────────────────────────
  return (
    <div style={{
      flexShrink: 0, height: OPEN_H,
      background: 'var(--bg2)',
      display: 'flex', alignItems: 'stretch',
      padding: '8px 12px',
      boxSizing: 'border-box',
      position: 'relative',
    }}>

      {/* Pill: border only, transparent, no overflow clip so shadows render fully */}
      <div style={{
        flex: 1,
        borderRadius: 14,
        background: 'transparent',
        border: '1px solid var(--border)',
        display: 'flex',
        minWidth: 0,
      }}>
        {/* Scroll viewport — clips horizontally, visible vertically */}
        <div ref={scrollRef} style={{ flex: 1, overflowX: 'auto', scrollbarWidth: 'none', overflowY: 'visible' }}>
          {/* Inner row — centered when few, scrollable when many */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            justifyContent: 'center',
            width: 'fit-content', minWidth: '100%',
            paddingTop: 12, paddingBottom: 12, paddingLeft: 16, paddingRight: 16,
            boxSizing: 'border-box',
          }}>
            {pages.map((page, i) => (
              <PageCard
                key={page.id}
                page={page} index={i}
                isActive={i === activePage}
                isDragging={i === dragFrom}
                isDropTarget={i === dragOver && dragFrom !== null && dragFrom !== i}
                isRenaming={renamingIdx === i}
                renameVal={renameVal}
                pageCount={pages.length}
                onSwitch={() => onSwitch(i)}
                onContextMenu={e => openCtx(e, i)}
                onDragStart={e => onDragStart(e, i)}
                onDragOver={e => onDragOverCard(e, i)}
                onDrop={e => onDrop(e, i)}
                onDragEnd={onDragEnd}
                onDelete={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onDelete(i) }}
                onRenameChange={setRenameVal}
                onRenameBlur={commitRename}
                onRenameKey={handleRenameKey}
              />
            ))}

            {/* Ghost "Add page" card */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <button
                onClick={openAddMenu}
                title="Add page"
                className="pp-add"
                style={{
                  width: THUMB_W, height: THUMB_H,
                  borderRadius: 10,
                  border: '1.5px dashed color-mix(in srgb, var(--text) 14%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--text3)',
                  background: 'transparent',
                  transition: 'border-color .16s, color .16s, background .16s',
                }}
                onMouseEnter={e => {
                  const b = e.currentTarget as HTMLButtonElement
                  b.style.borderColor = 'var(--accent)'
                  b.style.color = 'var(--accent)'
                  b.style.background = 'color-mix(in srgb, var(--accent) 6%, transparent)'
                }}
                onMouseLeave={e => {
                  const b = e.currentTarget as HTMLButtonElement
                  b.style.borderColor = 'color-mix(in srgb, var(--text) 14%, transparent)'
                  b.style.color = 'var(--text3)'
                  b.style.background = 'transparent'
                }}
              >
                <Plus size={16} strokeWidth={1.5} />
              </button>
              <div style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: '0.02em' }}>Add</div>
            </div>
          </div>
        </div>

        {/* Chevron — right edge of pill, separator on left */}
        <div style={{
          flexShrink: 0,
          borderLeft: '1px solid color-mix(in srgb, var(--text) 8%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 10px', alignSelf: 'stretch',
        }}>
          <ChevronBtn open={true} onClick={onToggleCollapse} />
        </div>
      </div>

      {/* ── Add-page menu ─────────────────────────────────────────────────── */}
      {showAddMenu && (
        <FloatingMenu x={addMenuAnchor.x} y={addMenuAnchor.y} anchorBottom onClose={() => setShowAddMenu(false)}>
          <MenuItem icon={<FileText size={13} />}       label="Blank Page"     onClick={() => { onAddBlank(); setShowAddMenu(false) }} />
          <MenuItem icon={<Copy size={13} />}            label="Duplicate Page" onClick={() => { onDuplicate(activePage); setShowAddMenu(false) }} />
          <div style={{ height: 1, background: 'color-mix(in srgb, var(--text) 6%, transparent)', margin: '4px 0' }} />
          <MenuItem icon={<LayoutTemplate size={13} />}  label="From Template"  onClick={() => openTemplatePicker(addMenuAnchor.x, addMenuAnchor.y)} />
        </FloatingMenu>
      )}

      {/* ── Context menu ──────────────────────────────────────────────────── */}
      {ctxMenu && (
        <FloatingMenu x={ctxMenu.x} y={ctxMenu.y} anchorBottom onClose={() => setCtxMenu(null)}>
          <MenuItem icon={<Pencil size={13} />}     label="Rename"      onClick={() => startRename(ctxMenu.index)} />
          <MenuItem icon={<Copy size={13} />}        label="Duplicate"   onClick={() => { onDuplicate(ctxMenu.index); setCtxMenu(null) }} />
          <div style={{ height: 1, background: 'color-mix(in srgb, var(--text) 6%, transparent)', margin: '4px 0' }} />
          <MenuItem icon={<ArrowLeft size={13} />}  label="Move Left"   onClick={() => moveLeft(ctxMenu.index)}   disabled={ctxMenu.index === 0} />
          <MenuItem icon={<ArrowRight size={13} />} label="Move Right"  onClick={() => moveRight(ctxMenu.index)}  disabled={ctxMenu.index === pages.length - 1} />
          <div style={{ height: 1, background: 'color-mix(in srgb, var(--text) 6%, transparent)', margin: '4px 0' }} />
          <MenuItem icon={<Trash2 size={13} />}     label="Delete Page" onClick={() => { onDelete(ctxMenu.index); setCtxMenu(null) }} danger disabled={pages.length <= 1} />
        </FloatingMenu>
      )}

      {/* ── Template picker ───────────────────────────────────────────────── */}
      {showTemplatePicker && (
        <FloatingMenu x={tplAnchor.x} y={tplAnchor.y} anchorBottom onClose={() => setShowTemplatePicker(false)}>
          <div style={{
            padding: '8px 14px 4px',
            fontSize: 10, fontWeight: 700, color: 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            Saved Templates
          </div>
          {savedTemplates.length === 0
            ? <div style={{ padding: '8px 14px 12px', fontSize: 12, color: 'var(--text3)' }}>No saved templates yet.</div>
            : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '6px 14px 12px', maxWidth: 272 }}>
                {savedTemplates.map(t => (
                  <button
                    key={t.id}
                    onMouseDown={e => { e.stopPropagation(); onAddFromTemplate(t.canvas_json); setShowTemplatePicker(false) }}
                    title={t.name}
                    style={{
                      width: 60, background: 'var(--bg3)',
                      border: '1px solid color-mix(in srgb, var(--text) 7%, transparent)',
                      borderRadius: 6, cursor: 'pointer', padding: 0, overflow: 'hidden',
                      transition: 'border-color .15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'color-mix(in srgb, var(--text) 7%, transparent)' }}
                  >
                    {t.thumbnail
                      ? <img src={t.thumbnail} alt={t.name} style={{ width: '100%', height: 46, objectFit: 'cover', display: 'block' }} />
                      : <div style={{ height: 46, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--text3)' }}>No preview</div>
                    }
                    <div style={{ fontSize: 8, color: 'var(--text2)', padding: '3px 5px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name}
                    </div>
                  </button>
                ))}
              </div>
            )
          }
        </FloatingMenu>
      )}

      <style>{`
        .pp-wrap:hover .pp-del  { opacity: 1 !important; }
        .pp-wrap:hover .pp-badge { opacity: 0.45 !important; }

        .pp-card:not(.pp-card--active):hover {
          border-color: color-mix(in srgb, var(--text) 20%, transparent) !important;
          box-shadow: 0 8px 28px color-mix(in srgb, var(--bg) 75%, transparent) !important;
          transform: translateY(-3px) scale(1.04) !important;
        }
        .pp-card--active:hover {
          box-shadow:
            0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent),
            0 0 28px color-mix(in srgb, var(--accent) 16%, transparent),
            0 8px 24px color-mix(in srgb, var(--bg) 80%, transparent) !important;
          transform: translateY(-2px) scale(1.03) !important;
        }

        div[style*="scrollbar-width: none"]::-webkit-scrollbar { display: none; }

        @keyframes ppFadeUp {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)  scale(1); }
        }
      `}</style>
    </div>
  )
}
