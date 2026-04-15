/**
 * shared.tsx — Shared primitives for FloatingTextToolbar pills.
 *
 * Exports: Pill, Sep, Tray, ResetBtn, SBtn, useLongPress
 *
 * All colours use --tb-* CSS variables so the toolbar automatically
 * follows the app's light / dark theme.
 */

import { useEffect, useRef, useCallback } from 'react'
import type { ReactNode, CSSProperties, MouseEvent } from 'react'

// ─── Theme helpers ────────────────────────────────────────────────────────────
export const accentRgb = (): string =>
  getComputedStyle(document.documentElement).getPropertyValue('--green-rgb').trim() || '11, 218, 118'

// ─── Separator ────────────────────────────────────────────────────────────────
export const Sep = (): JSX.Element => (
  <div style={{ width: 1, height: 18, background: 'var(--tb-sep)', flexShrink: 0, alignSelf: 'center' }}/>
)

// ─── Pill wrapper ─────────────────────────────────────────────────────────────
export interface PillProps {
  modified?: boolean
  mixed?: boolean
  children: ReactNode
  style?: CSSProperties
}

export const Pill = ({ modified, mixed, children, style: s = {} }: PillProps): JSX.Element => {
  const rgb = accentRgb()
  return (
    <div style={{
      position: 'relative', display: 'flex', alignItems: 'center', gap: 2,
      padding: '0 6px', height: 34, borderRadius: 999, flexShrink: 0,
      background: modified
        ? `rgba(${rgb}, 0.10)`
        : mixed
          ? `rgba(${rgb}, 0.05)`
          : 'var(--tb-input-bg)',
      border: `1px solid ${
        modified
          ? `rgba(${rgb}, 0.42)`
          : mixed
            ? `rgba(${rgb}, 0.20)`
            : 'var(--tb-input-border)'
      }`,
      transition: 'background .15s, border-color .15s',
      ...s,
    }}>
      {children}
    </div>
  )
}

// ─── Dropdown tray ────────────────────────────────────────────────────────────
export interface TrayProps {
  children: ReactNode
  align?: 'center' | 'left' | 'right'
  /** 'up' opens the tray above the pill (use when toolbar is near viewport bottom). */
  direction?: 'down' | 'up'
  style?: CSSProperties
}

export const Tray = ({ children, align = 'center', direction = 'down', style: s = {} }: TrayProps): JSX.Element => {
  const isUp = direction === 'up'
  const base: CSSProperties = {
    position: 'absolute',
    ...(isUp ? { bottom: 'calc(100% + 8px)' } : { top: 'calc(100% + 8px)' }),
    background: 'var(--tb-bg)',
    border: '1px solid var(--tb-border)',
    borderRadius: 12, padding: 10, zIndex: 10002,
    boxShadow: 'var(--tb-shadow)',
    backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
  }
  const openAnim = isUp ? 'tray-rise' : 'tray-drop'
  const openAnimCenter = isUp ? 'tray-rise-center' : 'tray-drop-center'
  const pos: CSSProperties =
    align === 'right'  ? { right: 0, animation: `${openAnim} .13s cubic-bezier(.16,1,.3,1)` }
    : align === 'left' ? { left: 0,  animation: `${openAnim} .13s cubic-bezier(.16,1,.3,1)` }
    : { left: '50%', transform: 'translateX(-50%)',
        animation: `${openAnimCenter} .13s cubic-bezier(.16,1,.3,1)` }
  return <div style={{ ...base, ...pos, ...s }}>{children}</div>
}

// ─── Reset button ─────────────────────────────────────────────────────────────
export interface ResetBtnProps {
  onClick: () => void
}

export const ResetBtn = ({ onClick }: ResetBtnProps): JSX.Element => (
  <button
    title="Reset to default"
    onMouseDown={(e: MouseEvent<HTMLButtonElement>) => e.preventDefault()}
    onClick={onClick}
    style={{
      width: 14, height: 14, borderRadius: '50%', border: 'none', cursor: 'pointer',
      background: 'var(--tb-hover)', color: 'var(--tb-text2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 7, lineHeight: 1, flexShrink: 0, marginLeft: 2,
      transition: 'background .1s, color .1s',
    }}
    onMouseEnter={(e: MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'rgba(255,55,55,0.55)'
      e.currentTarget.style.color = '#fff'
    }}
    onMouseLeave={(e: MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'var(--tb-hover)'
      e.currentTarget.style.color = 'var(--tb-text2)'
    }}
  >✕</button>
)

// ─── Style toggle button (B / I / U) ─────────────────────────────────────────
export interface SBtnProps {
  active: boolean
  mixed?: boolean
  onClick: () => void
  title?: string
  children: ReactNode
}

export const SBtn = ({ active, mixed, onClick, title, children }: SBtnProps): JSX.Element => (
  <button title={title} onClick={onClick}
    onMouseDown={(e: MouseEvent<HTMLButtonElement>) => e.preventDefault()}
    style={{
      width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer',
      background: active ? 'var(--tb-active)' : mixed ? 'var(--tb-hover)' : 'transparent',
      color: active ? 'var(--tb-active-text)' : mixed ? 'var(--tb-text2)' : 'var(--tb-text2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      transition: 'background .1s, color .1s',
    }}
  >{children}</button>
)

// ─── Long-press stepper hook ──────────────────────────────────────────────────
export function useLongPress(onStep: (dir: number) => void): {
  start: (dir: number) => void
  stop: () => void
} {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const start = useCallback((dir: number): void => {
    stop()
    onStep(dir)
    // First repeat fires at 500 ms, then accelerates (each interval x 0.78, min 40 ms).
    let delay = 500
    const repeat = (): void => {
      onStep(dir)
      delay = Math.max(40, delay * 0.78)
      timerRef.current = setTimeout(repeat, delay)
    }
    timerRef.current = setTimeout(repeat, 500)
  }, [onStep, stop])

  useEffect(() => stop, [stop])

  return { start, stop }
}
