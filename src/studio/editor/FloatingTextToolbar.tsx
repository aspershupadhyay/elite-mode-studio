/**
 * FloatingTextToolbar.tsx — span-aware inline text formatting pill bar.
 *
 * Architecture
 * ─────────────
 * • Reads from TextStyleStore (Zustand) via per-property selectors.
 *   Each memoized pill re-renders ONLY when its own property changes.
 * • Applies styles via canvasRef.current.applySelectionStyle → spanOps.
 * • Position is updated in a rAF loop so the bar tracks selection smoothly.
 * • Accent color is read live from CSS custom properties (--green / --green-rgb)
 *   so the toolbar always matches the active app theme.
 * • Dropdown coordination: only one dropdown open at a time via store flag.
 * • Mixed state: BIU toggles show partial fill; color/font show MIXED label.
 * • stopPropagation on container prevents Fabric from exiting editing mode.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { RefObject, MouseEvent } from 'react'
import type { CanvasHandle, SelectionStylePatch } from '@/types/canvas'
import { useToolbarState, useSetOpenDropdown } from '../text/TextStyleStore'
import ColorPill      from './text-toolbar/ColorPill'
import FontFamilyPill from './text-toolbar/FontFamilyPill'
import FontSizePill   from './text-toolbar/FontSizePill'
import BIUPill        from './text-toolbar/BIUPill'
import BgPill         from './text-toolbar/BgPill'
import { Sep }        from './text-toolbar/shared'

const PILL_H = 44

export interface FloatingTextToolbarProps {
  canvasRef: RefObject<CanvasHandle | null>
}

export default function FloatingTextToolbar({ canvasRef }: FloatingTextToolbarProps): JSX.Element | null {
  const { isEditing, hasSelection, screenRect } = useToolbarState()
  const setOpen    = useSetOpenDropdown()
  const toolbarRef = useRef<HTMLDivElement>(null)

  // Stable apply reference — keeps React.memo on pills effective
  // Must be defined BEFORE any early return (Rules of Hooks)
  const apply = useCallback(
    (s: SelectionStylePatch): void => { canvasRef?.current?.applySelectionStyle(s) },
    [canvasRef],
  )

  // rAF-driven position state — tracks the CENTER-X of the selection
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 })

  useEffect(() => {
    if (!screenRect) { setPos({ left: -9999, top: -9999 }); return }
    const id = requestAnimationFrame(() => {
      const rect = screenRect as DOMRect
      // offsetWidth is available after the first render; fall back to 400px estimate
      // so the clamp is conservative on first appearance.
      const toolbarW = toolbarRef.current?.offsetWidth ?? 400
      const halfW    = toolbarW / 2
      const vw       = window.innerWidth  || 1200
      const vh       = window.innerHeight || 800

      // Horizontal: center on selection, then clamp so no edge clips.
      const centerX    = rect.left + rect.width / 2
      const clampedLeft = Math.max(halfW + 8, Math.min(centerX, vw - halfW - 8))

      // Vertical: prefer above selection; flip below if not enough room.
      let top = rect.top - PILL_H - 12
      if (top < 8) top = rect.top + rect.height + 10
      top = Math.max(8, Math.min(top, vh - PILL_H - 8))

      setPos({ left: clampedLeft, top })
    })
    return () => cancelAnimationFrame(id)
  }, [screenRect])

  // Close all dropdowns on outside click
  useEffect(() => {
    const h = (e: globalThis.MouseEvent): void => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [setOpen])

  // Early return — all hooks are above this line
  if (!isEditing || !hasSelection) return null

  return (
    <div
      ref={toolbarRef}
      // stopPropagation keeps Fabric in text-editing mode for all toolbar clicks
      onMouseDown={(e: MouseEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation() }}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        // Center horizontally on the selection without a hardcoded width
        transform: 'translateX(-50%)',
        width: 'fit-content',
        maxWidth: 'calc(100vw - 24px)',
        height: PILL_H,
        zIndex: 9999,
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '0 12px',
        background: 'rgba(16,16,16,0.95)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 999,
        boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset, 0 14px 44px rgba(0,0,0,0.7)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        userSelect: 'none',
        animation: 'pill-appear .15s cubic-bezier(.16,1,.3,1)',
      }}
    >
      <ColorPill      apply={apply}/>
      <Sep/>
      <FontFamilyPill apply={apply}/>
      <Sep/>
      <FontSizePill   apply={apply}/>
      <Sep/>
      <BIUPill        apply={apply}/>
      <Sep/>
      <BgPill         apply={apply}/>

      <style>{`
        @keyframes pill-appear {
          from { opacity:0; transform:translateX(-50%) translateY(8px) scale(0.95); }
          to   { opacity:1; transform:translateX(-50%) translateY(0)   scale(1); }
        }
        @keyframes tray-drop {
          from { opacity:0; transform:translateY(-6px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes tray-drop-center {
          from { opacity:0; transform:translateX(-50%) translateY(-6px); }
          to   { opacity:1; transform:translateX(-50%) translateY(0); }
        }
        @keyframes sz-pop {
          from { opacity:0.3; transform:translateY(3px); }
          to   { opacity:1;   transform:translateY(0); }
        }
      `}</style>
    </div>
  )
}
