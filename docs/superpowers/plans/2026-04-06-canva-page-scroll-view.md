# Canva-Style Page Scroll View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the horizontal bottom PagesPanel thumbnail strip with a Canva-style vertical scroll view where every page appears as a card with an inline control bar (name, up/down, lock, duplicate, delete, add-after) and a "+ Add page" footer button.

**Architecture:** The center canvas area becomes a single `PageScrollView` component that owns a vertically-scrollable list of page cards. The active page card contains the live Fabric.js canvas + overlays passed in as React children via a ref-forwarded slot (`activeSlotRef`). Inactive pages show their stored thumbnail images at the same aspect ratio. Each card header exposes all per-page actions inline. A `locked` boolean on `Page` shows a visual lock overlay and is persisted in the session.

**Tech Stack:** React 18, TypeScript, Fabric.js, Lucide icons, CSS custom properties.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| MODIFY | `src/types/domain.ts` | Add `locked?: boolean` to `Page` |
| MODIFY | `src/types/ipc.ts` | Add `locked?: boolean` to `SessionPage` |
| CREATE | `src/studio/components/PageScrollView.tsx` | Scrollable card list, all per-page UI |
| MODIFY | `src/pages/studio/DesignStudio.tsx` | Replace PagesPanel with PageScrollView, add lock + addAfter handlers, zoomToFit on switch |
| KEEP   | `src/studio/components/PagesPanel.tsx` | Unchanged; no longer rendered but kept for reference |

---

### Task 1: Extend `Page` and `SessionPage` types

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/types/ipc.ts`

- [ ] **Step 1: Add `locked` to `Page`**

In `src/types/domain.ts`, find the `Page` interface (around line 114) and add one field:

```ts
export interface Page {
  id: string
  label: string
  content: Post | null
  canvasJSON: string | null
  thumbnail: string | null
  rendered: boolean
  status?: 'rendered' | 'images_ready'
  /** When true the page shows a lock overlay and cannot be edited. */
  locked?: boolean
}
```

- [ ] **Step 2: Add `locked` to `SessionPage`**

In `src/types/ipc.ts`, find the `SessionPage` interface (around line 29) and add:

```ts
export interface SessionPage {
  id: string
  label: string
  canvasJSON: string | null
  thumbnail: string | null
  locked?: boolean
}
```

- [ ] **Step 3: Commit**

```bash
git add src/types/domain.ts src/types/ipc.ts
git commit -m "feat: add locked field to Page and SessionPage types"
```

---

### Task 2: Create `PageScrollView` component

**Files:**
- Create: `src/studio/components/PageScrollView.tsx`

This is the complete new component. It replaces `PagesPanel` entirely.

- [ ] **Step 1: Create the file with full implementation**

```tsx
/**
 * PageScrollView — Canva-style vertical page scroll.
 *
 * Renders each page as a card with:
 *   - Header: index, editable name, up/down, lock, duplicate, delete, add-after
 *   - Body (active page): React children (live Fabric canvas + overlays)
 *   - Body (inactive): static thumbnail image at the same aspect ratio
 * Footer: "+ Add page" button with dropdown.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ChevronUp, ChevronDown, Lock, Unlock, Copy, Trash2, Plus,
  FileText, LayoutTemplate,
} from 'lucide-react'
import type { Page, Template } from '@/types/domain'
import type { CanvasSize } from '@/types/canvas'
import { getTemplates } from '../data/templateStorage'

// ── Types ─────────────────────────────────────────────────────────────────────

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
        width: 24, height: 24, borderRadius: 5,
        background: 'none', border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--border)' : danger ? '#f87171' : 'var(--text3)',
        transition: 'color .12s, background .12s',
        padding: 0, flexShrink: 0,
      }}
      onMouseEnter={e => {
        if (!disabled) {
          const el = e.currentTarget as HTMLButtonElement
          el.style.color    = danger ? '#ef4444' : 'var(--text)'
          el.style.background = 'var(--bg3)'
        }
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.color    = disabled ? 'var(--border)' : danger ? '#f87171' : 'var(--text3)'
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
        borderRadius: 8, minWidth: 180,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
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
      {icon}{label}
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

  const scrollRef    = useRef<HTMLDivElement>(null)
  const activeCardRef = useRef<HTMLDivElement | null>(null)

  const [containerWidth,  setContainerWidth]  = useState(600)
  const [renamingIdx,     setRenamingIdx]     = useState<number | null>(null)
  const [renameVal,       setRenameVal]       = useState('')
  const [addMenu,         setAddMenu]         = useState<{ x: number; y: number } | null>(null)
  const [tplMenu,         setTplMenu]         = useState<{ x: number; y: number } | null>(null)
  const [savedTemplates,  setSavedTemplates]  = useState<Template[]>([])

  // ── Container resize → card dims ────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0]?.contentRect.width ?? 600)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Refit canvas whenever card width changes ────────────────────────────────
  const cardWidth  = Math.max(200, containerWidth - 80)
  const cardHeight = Math.round(cardWidth * (canvasSize.height / canvasSize.width))

  useEffect(() => { onFitCanvas() }, [cardWidth])    // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll to active card ──────────────────────────────────────────────
  useEffect(() => {
    activeCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activePage])

  // ── Escape closes rename ────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setRenamingIdx(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // ── Rename helpers ──────────────────────────────────────────────────────────
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

  // ── Template picker ─────────────────────────────────────────────────────────
  const openTplMenu = async (x: number, y: number) => {
    const tpls = await getTemplates()
    setSavedTemplates(tpls)
    setAddMenu(null)
    setTplMenu({ x, y })
  }

  // ── Page header row ─────────────────────────────────────────────────────────
  const renderHeader = (page: Page, i: number) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      height: 36, marginBottom: 6, paddingLeft: 2,
    }}>
      {/* Page number badge */}
      <span style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text3)',
        minWidth: 22, textAlign: 'center', flexShrink: 0,
      }}>
        {i + 1}
      </span>

      {/* Editable name */}
      <div style={{ flex: 1, minWidth: 0 }}>
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
              color: 'var(--text)', fontSize: 12, padding: '2px 6px',
              outline: 'none',
            }}
          />
        ) : (
          <span
            onDoubleClick={() => startRename(i)}
            title={`${page.label} (double-click to rename)`}
            style={{
              fontSize: 12, fontWeight: 600, color: 'var(--text2)',
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
      <IconBtn onClick={() => onReorder(i, i + 1)} disabled={i === pages.length - 1} title="Move down">
        <ChevronDown size={14} />
      </IconBtn>

      {/* Lock toggle */}
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
  )

  // ── Render ──────────────────────────────────────────────────────────────────
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
        padding: '28px 40px 40px',
        display: 'flex', flexDirection: 'column', gap: 20,
        minHeight: '100%',
      }}>

        {/* ── Page cards ────────────────────────────────────────────────────── */}
        {pages.map((page, i) => {
          const isActive = i === activePage
          return (
            <div
              key={page.id}
              ref={isActive ? (el) => { activeCardRef.current = el } : undefined}
            >
              {/* Header row */}
              {renderHeader(page, i)}

              {/* Card body */}
              <div
                ref={isActive ? activeSlotRef : undefined}
                onClick={!isActive && !page.locked ? () => onSwitch(i) : undefined}
                style={{
                  width: cardWidth,
                  height: cardHeight,
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: 6,
                  cursor: isActive ? 'default' : 'pointer',
                  boxShadow: isActive
                    ? '0 0 0 2px var(--green), 0 8px 32px rgba(0,0,0,0.35)'
                    : '0 2px 12px rgba(0,0,0,0.25)',
                  transition: 'box-shadow .15s',
                  background: '#fff',
                }}
              >
                {isActive ? (
                  children
                ) : (
                  page.thumbnail
                    ? (
                      <img
                        src={page.thumbnail}
                        alt={page.label}
                        draggable={false}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    )
                    : (
                      <div style={{
                        width: '100%', height: '100%',
                        background: 'var(--bg3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 36, fontWeight: 800, color: 'var(--border)',
                      }}>
                        {i + 1}
                      </div>
                    )
                )}

                {/* Lock overlay on inactive locked pages */}
                {page.locked && !isActive && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(0,0,0,0.38)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none',
                  }}>
                    <div style={{
                      background: 'rgba(0,0,0,0.6)', borderRadius: 8, padding: '8px 14px',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <Lock size={14} color="white" />
                      <span style={{ color: 'white', fontSize: 12, fontWeight: 600 }}>Locked</span>
                    </div>
                  </div>
                )}

                {/* Active page locked banner */}
                {page.locked && isActive && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0,
                    background: 'rgba(239,68,68,0.9)',
                    padding: '6px 12px',
                    display: 'flex', alignItems: 'center', gap: 6,
                    zIndex: 50,
                  }}>
                    <Lock size={12} color="white" />
                    <span style={{ color: 'white', fontSize: 11, fontWeight: 600 }}>
                      Page is locked — click the unlock icon above to edit
                    </span>
                  </div>
                )}

                {/* Hover highlight for inactive */}
                {!isActive && (
                  <div
                    className="psv-hover-ring"
                    style={{
                      position: 'absolute', inset: 0, borderRadius: 6,
                      border: '2px solid transparent',
                      transition: 'border-color .12s',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </div>
            </div>
          )
        })}

        {/* ── Add page footer ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, paddingTop: 8 }}>
          {/* Main add button */}
          <button
            onClick={onAddBlank}
            style={{
              flex: 1, height: 44,
              background: 'var(--bg2)', border: '1.5px solid var(--border)',
              borderRight: 'none',
              borderRadius: '10px 0 0 10px',
              color: 'var(--text2)', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 6,
              transition: 'background .12s, border-color .12s, color .12s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background   = 'var(--bg3)'
              el.style.borderColor  = 'var(--green)'
              el.style.color        = 'var(--text)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background   = 'var(--bg2)'
              el.style.borderColor  = 'var(--border)'
              el.style.color        = 'var(--text2)'
            }}
          >
            <Plus size={15} />
            Add page
          </button>

          {/* Dropdown chevron */}
          <button
            onClick={e => {
              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
              setAddMenu(v => v ? null : { x: rect.left - 140, y: rect.bottom + 4 })
            }}
            style={{
              width: 44, height: 44, flexShrink: 0,
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

      {/* ── Add menu ────────────────────────────────────────────────────────── */}
      {addMenu && (
        <FloatingMenu x={addMenu.x} y={addMenu.y} onClose={() => setAddMenu(null)}>
          <MenuRow
            icon={<FileText size={14} style={{ marginRight: 0 }} />}
            label="Blank page"
            onClick={() => { onAddBlank(); setAddMenu(null) }}
          />
          <MenuRow
            icon={<Copy size={14} style={{ marginRight: 0 }} />}
            label="Duplicate current"
            onClick={() => { onDuplicate(activePage); setAddMenu(null) }}
          />
          <MenuRow
            icon={<LayoutTemplate size={14} style={{ marginRight: 0 }} />}
            label="From template"
            onClick={() => { openTplMenu(addMenu.x, addMenu.y) }}
          />
        </FloatingMenu>
      )}

      {/* ── Template picker ─────────────────────────────────────────────────── */}
      {tplMenu && (
        <FloatingMenu x={tplMenu.x} y={tplMenu.y} onClose={() => setTplMenu(null)}>
          <div style={{ padding: '6px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Saved Templates
          </div>
          {savedTemplates.length === 0 ? (
            <div style={{ padding: '8px 14px 10px', fontSize: 12, color: 'var(--text3)' }}>No saved templates yet.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '6px 14px 10px', maxWidth: 280 }}>
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
                  {t.thumbnail
                    ? <img src={t.thumbnail} alt={t.name} style={{ width: '100%', height: 46, objectFit: 'cover', display: 'block' }} />
                    : <div style={{ height: 46, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--text3)' }}>No preview</div>
                  }
                  <div style={{ fontSize: 9, color: 'var(--text2)', padding: '2px 4px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.name}
                  </div>
                </button>
              ))}
            </div>
          )}
        </FloatingMenu>
      )}

      <style>{`
        .psv-hover-ring:hover { border-color: rgba(255,255,255,0.3) !important; }
        @keyframes psvFadeUp {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/studio/components/PageScrollView.tsx
git commit -m "feat: add PageScrollView component - Canva-style vertical page cards"
```

---

### Task 3: Update `DesignStudio.tsx`

**Files:**
- Modify: `src/pages/studio/DesignStudio.tsx`

Five surgical changes to DesignStudio:
1. Import PageScrollView, remove PagesPanel import
2. Add `addPageAfter` callback
3. Add `handleLockPage` callback  
4. Update `switchPage` to call `zoomToFit()` after loading
5. Rewrite the center column render to use PageScrollView with children

- [ ] **Step 1: Swap imports at the top of the file**

Remove this import:
```ts
import PagesPanel from '../../studio/components/PagesPanel'
```

Add in its place:
```ts
import PageScrollView from '../../studio/components/PageScrollView'
```

- [ ] **Step 2: Add `addPageAfter` callback (insert after `addBlankPage`)**

Find the `addBlankPage` callback (around line 417) and add this immediately after it:

```ts
// ── Add blank page after a specific index ─────────────────────────────────

const addPageAfter = useCallback((afterIdx: number): void => {
  saveCurrentPage()
  const newIdx = afterIdx + 1
  const newPage = makePage(newIdx)
  setPages(prev => {
    const next = [...prev]
    next.splice(newIdx, 0, newPage)
    return next
  })
  setTimeout(() => {
    setActivePage(newIdx)
    canvasHandleRef.current?.clearCanvas?.()
  }, 100)
}, [saveCurrentPage])
```

- [ ] **Step 3: Add `handleLockPage` callback (insert after `renamePage`)**

Find the `renamePage` callback and add this after it:

```ts
// ── Toggle page lock ──────────────────────────────────────────────────────

const handleLockPage = useCallback((idx: number, locked: boolean): void => {
  setPages(prev => prev.map((p, i) => i === idx ? { ...p, locked } : p))
  triggerAutoSave()
}, [triggerAutoSave])
```

- [ ] **Step 4: Call `zoomToFit` after page switch**

In the `switchPage` callback, find the line:
```ts
switchingRef.current = false
setInjectMsg({ msg: `Page ${newIdx + 1} of ${pagesRef.current.length}` })
```

Replace it with:
```ts
switchingRef.current = false
setInjectMsg({ msg: `Page ${newIdx + 1} of ${pagesRef.current.length}` })
// Refit the canvas to the new card dimensions after JSON is loaded
setTimeout(() => { canvasHandleRef.current?.zoomToFit() }, 180)
```

- [ ] **Step 5: Update session save to include `locked`**

Find where `SessionData` is built for `window.api.saveSession`. It will look like:

```ts
pages: pagesRef.current.map(p => ({
  id:        p.id,
  label:     p.label,
  canvasJSON: p.canvasJSON,
  thumbnail: p.thumbnail,
})),
```

Change it to:
```ts
pages: pagesRef.current.map(p => ({
  id:        p.id,
  label:     p.label,
  canvasJSON: p.canvasJSON,
  thumbnail: p.thumbnail,
  locked:    p.locked,
})),
```

- [ ] **Step 6: Update session restore to include `locked`**

Find where `restoredPages` is built (around line 221):

```ts
const restoredPages: Page[] = session.pages.map(p => ({
  id:        p.id,
  label:     p.label,
  content:   null,
  canvasJSON: p.canvasJSON,
  thumbnail: p.thumbnail,
  rendered:  true,
}))
```

Change it to:
```ts
const restoredPages: Page[] = session.pages.map(p => ({
  id:        p.id,
  label:     p.label,
  content:   null,
  canvasJSON: p.canvasJSON,
  thumbnail: p.thumbnail,
  rendered:  true,
  locked:    p.locked,
}))
```

- [ ] **Step 7: Replace the center column render**

Find the center column `<div>` that currently contains `<Toolbar ... />`, the `<div ref={studioRef} ...>` block, and `<PagesPanel ... />`.

Replace the entire center column (from `{/* Center — Toolbar + Canvas + Pages */}` to the closing `</div>` of the center column) with:

```tsx
{/* Center — Toolbar + Canvas scroll */}
<div style={{
  position: 'absolute', top: 0, bottom: 0, left: leftW, right: RIGHT_W,
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
  transition: 'left 160ms cubic-bezier(0.16,1,0.3,1)',
}}>
  <Toolbar
    canvasRef={canvasHandleRef}
    currentSize={canvasSize}
    onSizeChange={handleSizeChange}
    onTemplateSaved={onTemplateSaved}
    loadedTemplateId={loadedTemplateId}
    onTemplateUpdated={() => onTemplateSaved?.()}
    autoFormat={autoFormat}
    onAutoFormatToggle={handleAutoFormatToggle}
    pageCount={pages.length}
    onExportAllPages={handleExportAllPages}
  />

  <PageScrollView
    pages={pages}
    activePage={activePage}
    canvasSize={canvasSize}
    onSwitch={switchPage}
    onAddBlank={addBlankPage}
    onAddAfter={addPageAfter}
    onDuplicate={duplicatePage}
    onDelete={deletePage}
    onRename={renamePage}
    onReorder={reorderPages}
    onAddFromTemplate={addPageFromTemplate}
    onLock={handleLockPage}
    onFitCanvas={() => canvasHandleRef.current?.zoomToFit()}
    activeSlotRef={studioRef}
  >
    <DesignCanvas
      ref={canvasHandleRef}
      width={canvasSize.width}
      height={canvasSize.height}
      onSelectionChange={handleSelectionChange}
      onHistoryChange={handleHistoryChange}
      onContextMenu={handleContextMenu}
      onGuidesChange={handleSnapGuidesChange}
      onPanChange={handlePanChange}
      onZoomChange={handleCanvasZoom}
      rulerGuides={rulerGuides}
    />
    <GuideOverlay
      guides={snapGuides as GuideData | null}
      canvasHandle={canvasHandleRef}
      zoom={zoom / 100}
      canvasW={canvasSize.width}
      canvasH={canvasSize.height}
    />
    <RulerGuides
      canvasW={canvasSize.width}
      canvasH={canvasSize.height}
      zoom={zoom / 100}
      pan={pan}
      guides={rulerGuides}
      onGuideChange={setRulerGuides}
      studioRef={studioRef}
    />
    <BottomToolbar
      activeTool={activeTool}
      onToolChange={setActiveTool}
      canvasRef={canvasHandleRef}
      zoom={zoom}
      onZoomChange={handleZoomChange}
      onZoomFit={handleZoomFit}
    />
  </PageScrollView>
</div>
```

- [ ] **Step 8: Commit**

```bash
git add src/pages/studio/DesignStudio.tsx
git commit -m "feat: replace PagesPanel with PageScrollView - Canva-style vertical page cards"
```

---

### Task 4: Smoke-test all existing features

Run the app and verify these still work:

- [ ] Open Studio — single page loads, canvas is editable
- [ ] Add pages — blank page card appears, canvas clears, thumbnail fills in
- [ ] Switch pages — clicking inactive card switches active canvas
- [ ] Thumbnails — editing content updates the thumbnail on the card strip
- [ ] Image auto-inject — send a post from Forge; AI images appear in the page card thumbnails automatically (this uses the `pages.map(p => p.status).join(',')` effect — do not touch it)
- [ ] Session save/restore — close and reopen; all pages restored with thumbnails
- [ ] Lock/unlock — lock icon shows overlay on card; locked active page shows red banner
- [ ] Add after — `+` icon in each card header adds a blank page after that card
- [ ] Export all pages — toolbar export still works across all pages
- [ ] Keyboard shortcuts — Cmd+Shift+N (new page), Cmd+Shift+D (duplicate) still fire

```bash
npm run dev
```
