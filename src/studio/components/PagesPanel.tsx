/**
 * PagesPanel — compact horizontal page strip styled as a pill/tray.
 * UI: left arrow | scrollable thumbs | + button | right arrow
 * Features: right-click context menu, drag-to-reorder, inline rename,
 * live thumbnails, scroll arrows, fade gradients.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, FileText, Copy, LayoutTemplate, Pencil, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react'
import type { MouseEvent, DragEvent, KeyboardEvent } from 'react'
import type { Page, Template } from '@/types/domain'
import { getTemplates } from '../data/templateStorage'

// ── Sizes ─────────────────────────────────────────────────────────────────────
const THUMB_W = 56
const THUMB_H = 72
const PANEL_H = THUMB_H + 24   // thumb + padding
const STRIP_H = 28

// ── Props ─────────────────────────────────────────────────────────────────────
interface PagesPanelProps {
  pages:              Page[]
  activePage:         number
  onSwitch:           (index: number) => void
  onAddBlank:         () => void
  onDuplicate:        (index: number) => void
  onDelete:           (index: number) => void
  onRename:           (index: number, name: string) => void
  onReorder:          (fromIndex: number, toIndex: number) => void
  onAddFromTemplate:  (templateJSON: string) => void
  collapsed?:         boolean
  onToggleCollapse?:  () => void
}

// ── Minimal menu item ─────────────────────────────────────────────────────────
function MenuItem({
  icon, label, onClick, danger = false, disabled = false,
}: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      onMouseDown={e => { e.stopPropagation(); if (!disabled) onClick() }}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: '6px 12px',
        background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--text3)' : danger ? '#f87171' : 'var(--text)',
        fontSize: 12, fontWeight: 500, textAlign: 'left',
        transition: 'background .1s',
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg3)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
    >
      <span style={{ opacity: disabled ? 0.4 : 1 }}>{icon}</span>
      {label}
    </button>
  )
}

// ── Floating menu container ────────────────────────────────────────────────────
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

  const style: React.CSSProperties = {
    position: 'fixed', zIndex: 99999,
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 8, minWidth: 168,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    padding: '4px 0',
    animation: 'fadeSlideUp .12s ease-out',
  }
  if (anchorBottom) {
    style.left   = x
    style.bottom = window.innerHeight - y + 4
  } else {
    style.left = x
    style.top  = y + 4
  }
  if (typeof style.left === 'number' && style.left + 200 > window.innerWidth) {
    style.left = window.innerWidth - 210
  }

  return (
    <div ref={ref} style={style} onMouseDown={e => e.stopPropagation()}>
      {children}
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
  const [canScrollLeft,      setCanScrollLeft]      = useState(false)
  const [canScrollRight,     setCanScrollRight]     = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [savedTemplates,     setSavedTemplates]     = useState<Template[]>([])
  const [tplAnchor,          setTplAnchor]          = useState({ x: 0, y: 0 })

  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Scroll state ─────────────────────────────────────────────────────────
  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }, [])

  useEffect(() => { checkScroll() }, [pages, collapsed, checkScroll])

  const scrollBy = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * (THUMB_W + 8) * 2, behavior: 'smooth' })
  }

  // ── Escape closes menus ───────────────────────────────────────────────────
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

  // ── Add menu ──────────────────────────────────────────────────────────────
  const openAddMenu = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
    setAddMenuAnchor({ x: rect.left, y: rect.top })
    setShowAddMenu(v => !v)
  }

  // ── Context menu ──────────────────────────────────────────────────────────
  const openCtx = (e: MouseEvent<HTMLDivElement>, idx: number) => {
    e.preventDefault(); e.stopPropagation()
    setCtxMenu({ index: idx, x: e.clientX, y: e.clientY })
  }

  // ── Inline rename ──────────────────────────────────────────────────────────
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

  // ── Drag to reorder ───────────────────────────────────────────────────────
  const onDragStart = (e: DragEvent<HTMLDivElement>, idx: number) => {
    setDragFrom(idx); e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }
  const onDragOver = (e: DragEvent<HTMLDivElement>, idx: number) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(idx)
  }
  const onDrop = (e: DragEvent<HTMLDivElement>, toIdx: number) => {
    e.preventDefault()
    if (dragFrom !== null && dragFrom !== toIdx) onReorder(dragFrom, toIdx)
    setDragFrom(null); setDragOver(null)
  }
  const onDragEnd = () => { setDragFrom(null); setDragOver(null) }

  // ── Template picker ───────────────────────────────────────────────────────
  const openTemplatePicker = async (anchorX: number, anchorY: number) => {
    const tpls = await getTemplates()
    setSavedTemplates(tpls)
    setTplAnchor({ x: anchorX, y: anchorY })
    setShowAddMenu(false); setShowTemplatePicker(true)
  }

  // ── Move helpers ──────────────────────────────────────────────────────────
  const moveLeft  = (idx: number) => { if (idx > 0) onReorder(idx, idx - 1); setCtxMenu(null) }
  const moveRight = (idx: number) => { if (idx < pages.length - 1) onReorder(idx, idx + 1); setCtxMenu(null) }

  // ── Collapsed strip ───────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div style={{
        flexShrink: 0, height: STRIP_H,
        background: 'var(--bg2)', borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8,
      }}>
        <button
          onClick={onToggleCollapse}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}
        >
          ▲ {pages.length} {pages.length === 1 ? 'Page' : 'Pages'}
        </button>
      </div>
    )
  }

  return (
    <div style={{
      flexShrink: 0,
      height: PANEL_H,
      background: 'var(--bg)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 8px',
      gap: 0,
      position: 'relative',
    }}>

      {/* ── Pill container ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '6px 4px',
        gap: 4,
        maxWidth: '100%',
        overflow: 'hidden',
      }}>

        {/* Left arrow */}
        <button
          onClick={() => scrollBy(-1)}
          disabled={!canScrollLeft}
          style={{
            flexShrink: 0,
            width: 22, height: 22, borderRadius: 6,
            background: 'none', border: 'none',
            cursor: canScrollLeft ? 'pointer' : 'default',
            color: canScrollLeft ? 'var(--text2)' : 'var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'color .15s',
          }}
          onMouseEnter={e => { if (canScrollLeft) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = canScrollLeft ? 'var(--text2)' : 'var(--border)' }}
        >
          <ChevronLeft size={13} />
        </button>

        {/* Scrollable track */}
        <div
          ref={scrollRef}
          onScroll={checkScroll}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            overflowX: 'auto', scrollbarWidth: 'none',
            maxWidth: 'calc(100vw - 200px)',
          }}
        >
          {pages.map((page, i) => {
            const isActive    = i === activePage
            const isDragging  = i === dragFrom
            const isDropTarget = i === dragOver && dragFrom !== null && dragFrom !== i

            return (
              <div
                key={page.id}
                draggable
                onDragStart={e => onDragStart(e, i)}
                onDragOver={e => onDragOver(e, i)}
                onDrop={e => onDrop(e, i)}
                onDragEnd={onDragEnd}
                onClick={() => onSwitch(i)}
                onContextMenu={e => openCtx(e, i)}
                className="pages-thumb"
                style={{
                  position: 'relative', flexShrink: 0,
                  width: THUMB_W, height: THUMB_H,
                  borderRadius: 8,
                  border: `2px solid ${isActive ? 'var(--green)' : isDropTarget ? 'var(--accent)' : 'transparent'}`,
                  cursor: 'pointer', overflow: 'hidden',
                  transition: 'border-color .15s, transform .1s, opacity .15s',
                  transform: isDragging ? 'scale(0.92)' : 'scale(1)',
                  opacity: isDragging ? 0.4 : 1,
                  boxShadow: isActive ? '0 0 0 1px var(--green)44, 0 2px 8px rgba(0,0,0,0.4)' : '0 1px 4px rgba(0,0,0,0.3)',
                  background: 'var(--bg)',
                }}
                title={page.label}
              >
                {/* Drop indicator bar */}
                {isDropTarget && (
                  <div style={{
                    position: 'absolute', left: -4, top: -2, bottom: -2, width: 2,
                    background: 'var(--accent)', borderRadius: 2, zIndex: 10,
                  }} />
                )}

                {/* Thumbnail */}
                {page.thumbnail
                  ? <img src={page.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} draggable={false} />
                  : (
                    <div style={{
                      width: '100%', height: '100%',
                      background: 'var(--bg3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 800, color: 'var(--text3)', letterSpacing: '-1px',
                    }}>
                      {i + 1}
                    </div>
                  )
                }

                {/* Inline rename input */}
                {renamingIdx === i && (
                  <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4,
                  }}>
                    <input
                      autoFocus
                      value={renameVal}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setRenameVal(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={handleRenameKey}
                      style={{
                        width: '100%', background: 'var(--bg3)',
                        border: '1px solid var(--accent)', borderRadius: 3,
                        color: 'var(--text)', fontSize: 9, padding: '2px 3px',
                        outline: 'none', textAlign: 'center',
                      }}
                    />
                  </div>
                )}

                {/* Delete btn — hover only */}
                {pages.length > 1 && (
                  <button
                    onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onDelete(i) }}
                    title="Delete page"
                    className="page-del-btn"
                    style={{
                      position: 'absolute', top: 3, right: 3,
                      width: 16, height: 16, borderRadius: 4,
                      background: 'rgba(0,0,0,0.8)', border: 'none',
                      color: '#f87171', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: 0, transition: 'opacity .15s', padding: 0,
                    }}
                  >
                    <Trash2 size={8} />
                  </button>
                )}

                {/* Active indicator dot */}
                {isActive && (
                  <div style={{
                    position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
                    width: 4, height: 4, borderRadius: '50%',
                    background: 'var(--green)',
                  }} />
                )}
              </div>
            )
          })}

          {/* ── Add button ──────────────────────────────────────────────── */}
          <button
            onClick={openAddMenu}
            title="Add page"
            style={{
              flexShrink: 0,
              width: THUMB_W, height: THUMB_H,
              borderRadius: 8,
              border: '1.5px dashed var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text3)',
              fontSize: 20, fontWeight: 300,
              background: 'none',
              transition: 'border-color .15s, color .15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--green)'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--green)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text3)'
            }}
          >
            +
          </button>
        </div>

        {/* Right arrow */}
        <button
          onClick={() => scrollBy(1)}
          disabled={!canScrollRight}
          style={{
            flexShrink: 0,
            width: 22, height: 22, borderRadius: 6,
            background: 'none', border: 'none',
            cursor: canScrollRight ? 'pointer' : 'default',
            color: canScrollRight ? 'var(--text2)' : 'var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'color .15s',
          }}
          onMouseEnter={e => { if (canScrollRight) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = canScrollRight ? 'var(--text2)' : 'var(--border)' }}
        >
          <ChevronRight size={13} />
        </button>
      </div>

      {/* ── Collapse toggle (subtle, bottom-right) ──────────────────────────── */}
      <button
        onClick={onToggleCollapse}
        title="Collapse pages"
        style={{
          position: 'absolute', right: 10, bottom: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text3)', fontSize: 9, fontWeight: 600,
          letterSpacing: '0.05em', textTransform: 'uppercase',
          opacity: 0.5, transition: 'opacity .15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.5' }}
      >
        ▼ hide
      </button>

      {/* ── Add menu ────────────────────────────────────────────────────────── */}
      {showAddMenu && (
        <FloatingMenu x={addMenuAnchor.x} y={addMenuAnchor.y} anchorBottom onClose={() => setShowAddMenu(false)}>
          <MenuItem icon={<FileText size={13} />}      label="Blank Page"      onClick={() => { onAddBlank(); setShowAddMenu(false) }} />
          <MenuItem icon={<Copy size={13} />}           label="Duplicate Page"  onClick={() => { onDuplicate(activePage); setShowAddMenu(false) }} />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <MenuItem icon={<LayoutTemplate size={13} />} label="From Template"   onClick={() => openTemplatePicker(addMenuAnchor.x, addMenuAnchor.y)} />
        </FloatingMenu>
      )}

      {/* ── Context menu ────────────────────────────────────────────────────── */}
      {ctxMenu && (
        <FloatingMenu x={ctxMenu.x} y={ctxMenu.y} anchorBottom onClose={() => setCtxMenu(null)}>
          <MenuItem icon={<Pencil size={13} />}     label="Rename"     onClick={() => startRename(ctxMenu.index)} />
          <MenuItem icon={<Copy size={13} />}        label="Duplicate"  onClick={() => { onDuplicate(ctxMenu.index); setCtxMenu(null) }} />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <MenuItem icon={<ArrowLeft size={13} />}  label="Move Left"  onClick={() => moveLeft(ctxMenu.index)}  disabled={ctxMenu.index === 0} />
          <MenuItem icon={<ArrowRight size={13} />} label="Move Right" onClick={() => moveRight(ctxMenu.index)} disabled={ctxMenu.index === pages.length - 1} />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <MenuItem icon={<Trash2 size={13} />}     label="Delete Page" onClick={() => { onDelete(ctxMenu.index); setCtxMenu(null) }} danger disabled={pages.length <= 1} />
        </FloatingMenu>
      )}

      {/* ── Template picker ──────────────────────────────────────────────────── */}
      {showTemplatePicker && (
        <FloatingMenu x={tplAnchor.x} y={tplAnchor.y} anchorBottom onClose={() => setShowTemplatePicker(false)}>
          <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Saved Templates
          </div>
          {savedTemplates.length === 0
            ? <div style={{ padding: '8px 12px 10px', fontSize: 12, color: 'var(--text3)' }}>No saved templates yet.</div>
            : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '6px 12px 10px', maxWidth: 260 }}>
                {savedTemplates.map(t => (
                  <button
                    key={t.id}
                    onMouseDown={e => { e.stopPropagation(); onAddFromTemplate(t.canvas_json); setShowTemplatePicker(false) }}
                    title={t.name}
                    style={{
                      width: 56, background: 'var(--bg3)',
                      border: '1px solid var(--border)', borderRadius: 5,
                      cursor: 'pointer', padding: 0, overflow: 'hidden',
                      transition: 'border-color .15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--green)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)' }}
                  >
                    {t.thumbnail
                      ? <img src={t.thumbnail} alt={t.name} style={{ width: '100%', height: 44, objectFit: 'cover', display: 'block' }} />
                      : <div style={{ height: 44, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--text3)' }}>No preview</div>
                    }
                    <div style={{ fontSize: 8, color: 'var(--text2)', padding: '2px 4px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
        .pages-thumb:hover .page-del-btn { opacity: 1 !important; }
        .pages-thumb:hover { border-color: rgba(255,255,255,0.15) !important; }
        div[style*="border: 2px solid var(--green)"].pages-thumb:hover { border-color: var(--green) !important; }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
