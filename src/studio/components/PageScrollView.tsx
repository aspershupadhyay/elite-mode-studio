/**
 * PageScrollView — Canva-style vertical page scroll.
 *
 * Each page appears as a card with:
 *   - Header: index badge, editable name, up/down, lock, duplicate, delete, add-after
 *   - Body (active page): React children (live Fabric canvas + overlays)
 *   - Body (inactive pages): static thumbnail image at the same aspect ratio
 * Footer: split "+ Add page" / dropdown button.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ChevronUp, ChevronDown, Lock, Unlock, Copy, Trash2, Plus,
  FileText, LayoutTemplate,
} from 'lucide-react'
import type { Page, Template } from '@/types/domain'
import type { CanvasSize } from '@/types/canvas'
import { getTemplates } from '../data/templateStorage'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PageScrollViewProps {
  pages: Page[]
  activePage: number
  canvasSize: CanvasSize
  onSwitch: (idx: number) => void
  onAddBlank: () => void
  onAddAfter: (afterIdx: number) => void
  onDuplicate: (idx: number) => void
  onDelete: (idx: number) => void
  onRename: (idx: number, name: string) => void
  onReorder: (from: number, to: number) => void
  onAddFromTemplate: (json: string) => void
  onLock: (idx: number, locked: boolean) => void
  onFitCanvas: () => void
  activeSlotRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
}

// ── Icon button ────────────────────────────────────────────────────────────────

function IconBtn({
  onClick, disabled = false, title, children, danger = false,
}: {
  onClick: () => void
  disabled?: boolean
  title: string
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      onClick={e => { e.stopPropagation(); if (!disabled) onClick() }}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 5,
        background: 'none', border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--border)' : danger ? '#f87171' : 'var(--text3)',
        transition: 'color .12s, background .12s',
        padding: 0, flexShrink: 0,
      }}
      onMouseEnter={e => {
        if (!disabled) {
          const el = e.currentTarget as HTMLButtonElement
          el.style.color      = danger ? '#ef4444' : 'var(--text)'
          el.style.background = 'var(--bg3)'
        }
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.color      = disabled ? 'var(--border)' : danger ? '#f87171' : 'var(--text3)'
        el.style.background = 'none'
      }}
    >
      {children}
    </button>
  )
}

// ── FloatingMenu ───────────────────────────────────────────────────────────────

function FloatingMenu({
  x, y, children, onClose,
}: { x: number; y: number; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const id = setTimeout(() => document.addEventListener('mousedown', close), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', close) }
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', zIndex: 99999,
        left: x, top: y,
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 8, minWidth: 188,
        boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
        padding: '4px 0',
        animation: 'psvFadeUp .12s ease-out',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

function MenuRow({
  icon, label, onClick,
}: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onMouseDown={e => { e.stopPropagation(); onClick() }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: '7px 14px',
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text)', fontSize: 13, fontWeight: 500, textAlign: 'left',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg3)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
    >
      {icon}
      {label}
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PageScrollView({
  pages, activePage, canvasSize,
  onSwitch, onAddBlank, onAddAfter, onDuplicate, onDelete,
  onRename, onReorder, onAddFromTemplate, onLock, onFitCanvas,
  activeSlotRef, children,
}: PageScrollViewProps): JSX.Element {

  const scrollRef     = useRef<HTMLDivElement>(null)
  const activeCardRef = useRef<HTMLDivElement | null>(null)

  const [containerWidth,  setContainerWidth]  = useState(600)
  const [containerHeight, setContainerHeight] = useState(700)
  const [renamingIdx,     setRenamingIdx]     = useState<number | null>(null)
  const [renameVal,       setRenameVal]       = useState('')
  const [addMenu,         setAddMenu]         = useState<{ x: number; y: number } | null>(null)
  const [tplMenu,         setTplMenu]         = useState<{ x: number; y: number } | null>(null)
  const [savedTemplates,  setSavedTemplates]  = useState<Template[]>([])

  // ── Container resize → card dimensions ──────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect) {
        setContainerWidth(rect.width)
        setContainerHeight(rect.height)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Active card dimensions (large, fills most of scroll area) ──────────────
  const HPAD      = 64
  const THUMB_H   = 180   // inactive page thumbnail height

  const rawActiveW = Math.max(200, containerWidth - HPAD)
  const rawActiveH = Math.round(rawActiveW * canvasSize.height / canvasSize.width)
  // Cap active card height to 72% of container so 2 cards can be seen
  const maxActiveH = Math.max(300, Math.round(containerHeight * 0.72))
  const activeCardH = Math.min(rawActiveH, maxActiveH)
  const activeCardW = Math.round(activeCardH * canvasSize.width / canvasSize.height)

  // ── Inactive thumbnail dimensions ────────────────────────────────────────────
  const thumbH = THUMB_H
  const thumbW = Math.round(thumbH * canvasSize.width / canvasSize.height)

  // Refit canvas whenever active card changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onFitCanvas() }, [activeCardW, activeCardH])

  // ── Auto-scroll active card into view ────────────────────────────────────────
  useEffect(() => {
    activeCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activePage])

  // ── Escape closes rename / menus ─────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setRenamingIdx(null); setAddMenu(null); setTplMenu(null) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // ── Rename helpers ────────────────────────────────────────────────────────────
  const startRename = useCallback((idx: number) => {
    setRenamingIdx(idx)
    setRenameVal(pages[idx]?.label ?? `Page ${idx + 1}`)
  }, [pages])

  const commitRename = useCallback(() => {
    if (renamingIdx !== null && renameVal.trim()) {
      onRename(renamingIdx, renameVal.trim())
    }
    setRenamingIdx(null)
  }, [renamingIdx, renameVal, onRename])

  // ── Template picker ───────────────────────────────────────────────────────────
  const openTplMenu = async (anchorX: number, anchorY: number) => {
    const tpls = await getTemplates()
    setSavedTemplates(tpls)
    setAddMenu(null)
    setTplMenu({ x: anchorX, y: anchorY })
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        background: 'var(--bg)',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--border) transparent',
      }}
    >
      <div style={{
        padding: '28px 40px 48px',
        display: 'flex', flexDirection: 'column', gap: 20,
        minHeight: '100%', boxSizing: 'border-box',
      }}>

        {/* ── Page cards ──────────────────────────────────────────────────────── */}
        {pages.map((page, i) => {
          const isActive = i === activePage

          return (
            <div
              key={page.id}
              ref={isActive ? (el): void => { activeCardRef.current = el } : undefined}
            >
              {/* Header row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                height: 36, marginBottom: 8, paddingLeft: 2,
              }}>
                {/* Page number badge */}
                <span style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--text3)',
                  minWidth: 20, textAlign: 'center', flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {i + 1}
                </span>

                {/* Editable page name */}
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  {renamingIdx === i ? (
                    <input
                      autoFocus
                      value={renameVal}
                      onChange={e => setRenameVal(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setRenamingIdx(null)
                      }}
                      onClick={e => e.stopPropagation()}
                      style={{
                        width: '100%', background: 'var(--bg3)',
                        border: '1px solid var(--accent)', borderRadius: 4,
                        color: 'var(--text)', fontSize: 12, padding: '3px 7px',
                        outline: 'none',
                      }}
                    />
                  ) : (
                    <span
                      onDoubleClick={() => startRename(i)}
                      title={`${page.label} (double-click to rename)`}
                      style={{
                        fontSize: 12, fontWeight: 600,
                        color: isActive ? 'var(--text)' : 'var(--text2)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        display: 'block', cursor: 'text', maxWidth: '100%',
                      }}
                    >
                      {page.label}
                    </span>
                  )}
                </div>

                {/* Up */}
                <IconBtn onClick={() => onReorder(i, i - 1)} disabled={i === 0} title="Move up">
                  <ChevronUp size={14} />
                </IconBtn>

                {/* Down */}
                <IconBtn
                  onClick={() => onReorder(i, i + 1)}
                  disabled={i === pages.length - 1}
                  title="Move down"
                >
                  <ChevronDown size={14} />
                </IconBtn>

                {/* Lock / unlock */}
                <IconBtn
                  onClick={() => onLock(i, !page.locked)}
                  title={page.locked ? 'Unlock page' : 'Lock page'}
                >
                  {page.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </IconBtn>

                {/* Duplicate */}
                <IconBtn onClick={() => onDuplicate(i)} title="Duplicate page">
                  <Copy size={13} />
                </IconBtn>

                {/* Delete */}
                <IconBtn
                  onClick={() => onDelete(i)}
                  disabled={pages.length <= 1}
                  title="Delete page"
                  danger
                >
                  <Trash2 size={13} />
                </IconBtn>

                {/* Add page after this one */}
                <IconBtn onClick={() => onAddAfter(i)} title="Add page after">
                  <Plus size={14} />
                </IconBtn>
              </div>

              {/* Card body */}
              <div
                ref={isActive ? activeSlotRef : undefined}
                onClick={!isActive && !page.locked ? () => onSwitch(i) : undefined}
                style={{
                  width: isActive ? activeCardW : thumbW,
                  height: isActive ? activeCardH : thumbH,
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: isActive ? 4 : 4,
                  cursor: isActive ? 'default' : page.locked ? 'not-allowed' : 'pointer',
                  boxShadow: isActive
                    ? '0 0 0 2px var(--green), 0 6px 24px rgba(0,0,0,0.4)'
                    : '0 2px 8px rgba(0,0,0,0.22)',
                  transition: 'box-shadow .15s',
                  background: '#ffffff',
                  flexShrink: 0,
                }}
              >
                {isActive ? (
                  /* Live canvas + overlays rendered here */
                  children
                ) : (
                  page.thumbnail ? (
                    <img
                      src={page.thumbnail}
                      alt={page.label}
                      draggable={false}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%',
                      background: 'var(--bg3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 40, fontWeight: 800, color: 'var(--border)',
                      userSelect: 'none',
                    }}>
                      {i + 1}
                    </div>
                  )
                )}

                {/* Lock overlay — inactive locked pages */}
                {page.locked && !isActive && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(0,0,0,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none',
                  }}>
                    <div style={{
                      background: 'rgba(0,0,0,0.65)', borderRadius: 8,
                      padding: '8px 16px',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <Lock size={14} color="white" />
                      <span style={{ color: 'white', fontSize: 12, fontWeight: 600 }}>Locked</span>
                    </div>
                  </div>
                )}

                {/* Lock banner — active locked page */}
                {page.locked && isActive && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0,
                    background: 'rgba(239,68,68,0.92)',
                    padding: '6px 12px',
                    display: 'flex', alignItems: 'center', gap: 6,
                    zIndex: 50, pointerEvents: 'none',
                  }}>
                    <Lock size={12} color="white" />
                    <span style={{ color: 'white', fontSize: 11, fontWeight: 600 }}>
                      Page is locked — click the unlock icon above to edit
                    </span>
                  </div>
                )}

                {/* Hover ring on inactive cards */}
                {!isActive && (
                  <div className="psv-hover-ring" style={{
                    position: 'absolute', inset: 0, borderRadius: 6,
                    border: '2px solid transparent',
                    transition: 'border-color .12s',
                    pointerEvents: 'none',
                  }} />
                )}
              </div>
            </div>
          )
        })}

        {/* ── Add page footer ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, paddingTop: 4 }}>
          {/* Main add button */}
          <button
            onClick={onAddBlank}
            style={{
              flex: 1, height: 46,
              background: 'var(--bg2)', border: '1.5px solid var(--border)',
              borderRight: 'none',
              borderRadius: '10px 0 0 10px',
              color: 'var(--text2)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'background .12s, border-color .12s, color .12s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background  = 'var(--bg3)'
              el.style.borderColor = 'var(--green)'
              el.style.color       = 'var(--text)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background  = 'var(--bg2)'
              el.style.borderColor = 'var(--border)'
              el.style.color       = 'var(--text2)'
            }}
          >
            <Plus size={14} />
            Add page
          </button>

          {/* Dropdown toggle */}
          <button
            onClick={e => {
              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
              setAddMenu(v => v ? null : { x: rect.left - 140, y: rect.bottom + 4 })
            }}
            style={{
              width: 46, height: 46, flexShrink: 0,
              background: 'var(--bg2)', border: '1.5px solid var(--border)',
              borderRadius: '0 10px 10px 0',
              color: 'var(--text3)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background .12s, border-color .12s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background  = 'var(--bg3)'
              el.style.borderColor = 'var(--green)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background  = 'var(--bg2)'
              el.style.borderColor = 'var(--border)'
            }}
          >
            <ChevronDown size={14} />
          </button>
        </div>

      </div>

      {/* ── Add menu ──────────────────────────────────────────────────────────── */}
      {addMenu && (
        <FloatingMenu x={addMenu.x} y={addMenu.y} onClose={() => setAddMenu(null)}>
          <MenuRow
            icon={<FileText size={14} />}
            label="Blank page"
            onClick={() => { onAddBlank(); setAddMenu(null) }}
          />
          <MenuRow
            icon={<Copy size={14} />}
            label="Duplicate current"
            onClick={() => { onDuplicate(activePage); setAddMenu(null) }}
          />
          <MenuRow
            icon={<LayoutTemplate size={14} />}
            label="From template"
            onClick={() => { void openTplMenu(addMenu.x, addMenu.y) }}
          />
        </FloatingMenu>
      )}

      {/* ── Template picker ───────────────────────────────────────────────────── */}
      {tplMenu && (
        <FloatingMenu x={tplMenu.x} y={tplMenu.y} onClose={() => setTplMenu(null)}>
          <div style={{
            padding: '6px 14px 4px',
            fontSize: 10, fontWeight: 700, color: 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            Saved Templates
          </div>
          {savedTemplates.length === 0 ? (
            <div style={{ padding: '8px 14px 10px', fontSize: 12, color: 'var(--text3)' }}>
              No saved templates yet.
            </div>
          ) : (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 8,
              padding: '6px 14px 10px', maxWidth: 280,
            }}>
              {savedTemplates.map(t => (
                <button
                  key={t.id}
                  onMouseDown={() => { onAddFromTemplate(t.canvas_json); setTplMenu(null) }}
                  title={t.name}
                  style={{
                    width: 60, background: 'var(--bg3)',
                    border: '1px solid var(--border)', borderRadius: 5,
                    cursor: 'pointer', padding: 0, overflow: 'hidden',
                    transition: 'border-color .15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--green)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)' }}
                >
                  {t.thumbnail ? (
                    <img
                      src={t.thumbnail}
                      alt={t.name}
                      style={{ width: '100%', height: 48, objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{
                      height: 48, background: 'var(--bg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, color: 'var(--text3)',
                    }}>
                      No preview
                    </div>
                  )}
                  <div style={{
                    fontSize: 9, color: 'var(--text2)',
                    padding: '2px 4px', textAlign: 'center',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t.name}
                  </div>
                </button>
              ))}
            </div>
          )}
        </FloatingMenu>
      )}

      <style>{`
        .psv-hover-ring:hover { border-color: rgba(255,255,255,0.25) !important; }
        @keyframes psvFadeUp {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
