/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  DESIGN SYSTEM — single source of truth for all UI primitives  ║
 * ║  All tokens, icons, and components live here.                  ║
 * ║  To change the look of the app, change this file.             ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   import { Card, Btn, Input, Badge, Label, Spinner, ... } from '../design-system'
 *
 * Tokens all resolve to CSS custom properties defined in index.css.
 * Accent color changes propagate automatically via --green / --accent.
 */

import React, { useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// A. CSS VARIABLE TOKEN REFERENCES
// These strings resolve live — accent color changes in Appearance settings
// propagate to every component that uses these values.
// ─────────────────────────────────────────────────────────────────────────────

export const DS = {
  // Surfaces
  bg:      'var(--surface-0)',
  bg2:     'var(--surface-1)',
  bg3:     'var(--surface-2)',
  bg4:     'var(--surface-3)',
  bg5:     'var(--surface-4)',

  // Borders
  border:  'var(--border-default)',
  border2: 'var(--border-strong)',
  borderS: 'var(--border-subtle)',

  // Text
  text:    'var(--text-primary)',
  text2:   'var(--text-secondary)',
  text3:   'var(--text-tertiary)',

  // Accent — all follow the user-selected color
  accent:     'var(--accent)',
  accentDim:  'var(--accent-dim)',
  accentBd:   'var(--accent-border)',
  accentFg:   'var(--accent-fg)',   /* dark text for use ON solid accent fills */

  // Legacy aliases for settings tabs that used T.violet*
  violet:    'var(--accent)',
  violetD:   'var(--accent)',
  violetL:   'var(--accent)',
  violetBg:  'var(--accent-dim)',
  violetBd:  'var(--accent-border)',

  // Status
  red:     'var(--status-red)',
  amber:   'var(--status-amber)',
  emerald: 'var(--status-green)',
  sky:     '#0EA5E9',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// B. INLINE ICON FACTORY
// Lightweight SVG icons — no external icon library needed for design system.
// ─────────────────────────────────────────────────────────────────────────────

export type IconProps = { size?: number; color?: string; style?: React.CSSProperties; className?: string }

function Ic(d: string | string[]): React.FC<IconProps> {
  return function Icon({ size = 16, color = 'currentColor', style, className }: IconProps): React.ReactElement {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
           stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
           style={style} className={className}>
        {Array.isArray(d) ? d.map((x, i) => <path key={i} d={x} />) : <path d={d} />}
      </svg>
    )
  }
}

export const Icons = {
  activity: Ic('M22 12h-4l-3 9L9 3l-3 9H2'),
  search:   Ic(['M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12', 'M21 21l-4.35-4.35']),
  cpu:      Ic(['M9 2H7a2 2 0 0 0-2 2v2','M17 2h2a2 2 0 0 1 2 2v2','M5 17v2a2 2 0 0 0 2 2h2',
                'M19 17v2a2 2 0 0 1-2 2h-2','M9 9h6v6H9z','M2 9h3M19 9h3M2 15h3M19 15h3M9 2v3M15 2v3M9 19v3M15 19v3']),
  sliders:  Ic(['M4 21v-7','M4 10V3','M12 21v-9','M12 8V3','M20 21v-5','M20 12V3','M1 14h6','M9 8h6','M17 16h6']),
  palette:  Ic(['M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2v-.5c0-.6.4-1 1-1h1.5a3.5 3.5 0 0 0 0-7H15c-1.7 0-3-1.3-3-3','M7 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2','M9 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2','M15 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2']),
  eye:      Ic(['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8','M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0']),
  eyeOff:   Ic(['M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94','M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19','m1 1 22 22','M14.12 14.12a3 3 0 1 1-4.24-4.24']),
  check:    Ic('M20 6 9 17l-5-5'),
  x:        Ic('M18 6 6 18M6 6l12 12'),
  refresh:  Ic(['M23 4v6h-6','M1 20v-6h6','M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15']),
  plus:     Ic('M12 5v14M5 12h14'),
  trash:    Ic(['M3 6h18','M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2','M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6']),
  info:     Ic(['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20','M12 8v4','M12 16h.01']),
  zap:      Ic('M13 2 3 14h9l-1 8 10-12h-9l1-8z'),
  globe:    Ic(['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20','M2 12h20','M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z']),
  key:      Ic(['M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4']),
  sparkle:  Ic(['M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z','M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z','M5 17l.75 2.25L8 20l-2.25.75L5 23l-.75-2.25L2 20l2.25-.75z']),
  pen:      Ic(['M12 20h9','M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z']),
  dot:      Ic('M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0'),
  chevronDown: Ic('M6 9l6 6 6-6'),
  chevronRight: Ic('M9 18l6-6-6-6'),
  copy:     Ic(['M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z','M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 0 2 2v1']),
  externalLink: Ic(['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6','M15 3h6v6','M10 14 21 3']),
  alertCircle: Ic(['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20','M12 8v4','M12 16h.01']),
} as const

// ─────────────────────────────────────────────────────────────────────────────
// C. SPINNER
// Clean, minimal loading indicator. Replaces "Working..." text.
// ─────────────────────────────────────────────────────────────────────────────

interface SpinnerProps {
  size?: number
  color?: string
}

export function Spinner({ size = 14, color = 'currentColor' }: SpinnerProps): React.ReactElement {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'spin 0.75s linear infinite', flexShrink: 0 }}
    >
      <path d="M12 2a10 10 0 0 1 10 10" opacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// D. CARD COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
}

export function Card({ children, style = {}, className }: CardProps): React.ReactElement {
  return (
    <div
      className={className}
      style={{
        background: DS.bg3,
        border: `1px solid ${DS.border}`,
        borderRadius: 12,
        padding: '18px 20px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function GlassCard({ children, style = {}, className }: CardProps): React.ReactElement {
  return (
    <div
      className={`glass ${className ?? ''}`}
      style={{
        border: `1px solid ${DS.borderS}`,
        borderRadius: 14,
        padding: '18px 20px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function AccentCard({ children, style = {}, className }: CardProps): React.ReactElement {
  return (
    <div
      className={className}
      style={{
        background: DS.accentDim,
        border: `1px solid ${DS.accentBd}`,
        borderRadius: 12,
        padding: '16px 20px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// Alias for backward compat
export const GreenCard = AccentCard

// ─────────────────────────────────────────────────────────────────────────────
// E. LABEL
// ─────────────────────────────────────────────────────────────────────────────

interface LabelProps {
  children: React.ReactNode
  style?: React.CSSProperties
}

export function Label({ children, style = {} }: LabelProps): React.ReactElement {
  return (
    <p style={{
      fontSize: 10,
      fontWeight: 700,
      color: DS.text3,
      textTransform: 'uppercase',
      letterSpacing: '.09em',
      marginBottom: 6,
      ...style,
    }}>
      {children}
    </p>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// F. BUTTON
// ─────────────────────────────────────────────────────────────────────────────

export type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface BtnProps {
  children: React.ReactNode
  onClick?: (e: React.MouseEvent) => void
  loading?: boolean
  disabled?: boolean
  variant?: BtnVariant
  style?: React.CSSProperties
  small?: boolean
  type?: 'button' | 'submit' | 'reset'
}

export function Btn({
  children, onClick, loading, disabled, variant = 'primary', style = {}, small = false, type = 'button',
}: BtnProps): React.ReactElement {
  const isDisabled = disabled || loading

  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: small ? '5px 12px' : '8px 16px',
    borderRadius: 8,
    fontSize: small ? 11 : 13,
    fontWeight: 500,
    fontFamily: 'var(--font-ui)',
    letterSpacing: '-0.01em',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    transition: 'all var(--ease-fast)',
    border: 'none',
    flexShrink: 0,
    opacity: isDisabled ? 0.5 : 1,
  }

  const variants: Record<BtnVariant, React.CSSProperties> = {
    primary: {
      background: DS.accent,
      color: 'var(--accent-fg)',  /* always dark on bright accent fill */
      fontWeight: 600,
    },
    secondary: {
      background: 'transparent',
      border: `1px solid ${DS.border}`,
      color: DS.text2,
    },
    ghost: {
      background: 'transparent',
      color: DS.text2,
    },
    danger: {
      background: 'transparent',
      border: `1px solid rgba(239,68,68,0.3)`,
      color: DS.red,
    },
  }

  const hoverMap: Record<BtnVariant, React.CSSProperties> = {
    primary:   { filter: 'brightness(1.1)' },
    secondary: { background: DS.bg4, color: DS.text },
    ghost:     { background: DS.bg4, color: DS.text },
    danger:    { background: 'rgba(239,68,68,0.08)' },
  }

  const [hovered, setHovered] = useState(false)

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      onMouseEnter={() => !isDisabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...base, ...variants[variant], ...(hovered && !isDisabled ? hoverMap[variant] : {}), ...style }}
    >
      {loading && <Spinner size={12} />}
      {children}
    </button>
  )
}

// Alias for settings tabs
export function PrimaryBtn({
  children, onClick, loading = false, disabled = false, small = false,
}: {
  children: React.ReactNode
  onClick: () => void
  loading?: boolean
  disabled?: boolean
  small?: boolean
}): React.ReactElement {
  return (
    <Btn variant="primary" onClick={onClick} loading={loading} disabled={disabled} small={small}>
      {children}
    </Btn>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// G. INPUT
// ─────────────────────────────────────────────────────────────────────────────

interface InputProps {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  style?: React.CSSProperties
  type?: string
  disabled?: boolean
  autoFocus?: boolean
}

export function Input({ value, onChange, placeholder, onKeyDown, style = {}, type = 'text', disabled, autoFocus }: InputProps): React.ReactElement {
  const [focused, setFocused] = useState(false)
  return (
    <input
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      type={type}
      disabled={disabled}
      autoFocus={autoFocus}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: '100%',
        padding: '10px 14px',
        background: DS.bg3,
        border: `1px solid ${focused ? 'var(--accent)' : DS.border}`,
        borderRadius: 8,
        color: DS.text,
        fontSize: 13,
        outline: 'none',
        fontFamily: 'var(--font-ui)',
        transition: 'border-color var(--ease-fast)',
        boxShadow: focused ? '0 0 0 3px var(--accent-dim)' : 'none',
        ...style,
      }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// H. BADGE
// ─────────────────────────────────────────────────────────────────────────────

type BadgeColor = 'green' | 'amber' | 'red' | 'accent'

interface BadgeProps {
  children: React.ReactNode
  color?: BadgeColor
  style?: React.CSSProperties
}

export function Badge({ children, color = 'accent', style = {} }: BadgeProps): React.ReactElement {
  const colors: Record<BadgeColor, { bg: string; border: string; text: string }> = {
    accent: { bg: 'var(--accent-dim)', border: 'var(--accent-border)', text: 'var(--accent)' },
    green:  { bg: 'var(--accent-dim)', border: 'var(--accent-border)', text: 'var(--accent)' },
    amber:  { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', text: 'var(--status-amber)' },
    red:    { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  text: 'var(--status-red)' },
  }
  const c = colors[color]
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 7px',
      borderRadius: 20,
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.04em',
      background: c.bg,
      border: `1px solid ${c.border}`,
      color: c.text,
      ...style,
    }}>
      {children}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// I. TOGGLE
// ─────────────────────────────────────────────────────────────────────────────

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }): React.ReactElement {
  return (
    <div
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        width: 38,
        height: 21,
        borderRadius: 11,
        cursor: 'pointer',
        flexShrink: 0,
        position: 'relative',
        background: checked ? DS.accent : DS.bg4,
        border: `1px solid ${checked ? DS.accentBd : DS.border}`,
        transition: 'all var(--ease-base)',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 2,
        left: checked ? 18 : 2,
        width: 15,
        height: 15,
        borderRadius: '50%',
        background: checked ? '#fff' : DS.text3,
        transition: 'left var(--ease-base), background var(--ease-base)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
      }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// J. FIELD INPUT (Settings)
// ─────────────────────────────────────────────────────────────────────────────

interface FieldInputProps {
  label?: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  hint?: string
}

export function FieldInput({ label, value, onChange, type = 'text', placeholder = '', hint = '' }: FieldInputProps): React.ReactElement {
  const [show, setShow] = useState<boolean>(false)
  const [focused, setFocused] = useState(false)
  const isPass = type === 'password'
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <label style={{
          display: 'block',
          fontSize: 10,
          fontWeight: 700,
          color: DS.text3,
          marginBottom: 6,
          textTransform: 'uppercase',
          letterSpacing: '.09em',
        }}>
          {label}
        </label>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          type={isPass && !show ? 'password' : 'text'}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            padding: '9px 12px',
            background: DS.bg,
            border: `1px solid ${focused ? 'var(--accent)' : DS.border2}`,
            borderRadius: 8,
            color: DS.text,
            fontSize: 13,
            outline: 'none',
            fontFamily: 'var(--font-ui)',
            userSelect: 'text',
            transition: 'border-color var(--ease-fast), box-shadow var(--ease-fast)',
            boxShadow: focused ? '0 0 0 3px var(--accent-dim)' : 'none',
          }}
        />
        {isPass && (
          <button
            onClick={() => setShow(!show)}
            style={{
              padding: '0 12px',
              background: DS.bg,
              border: `1px solid ${DS.border2}`,
              borderRadius: 8,
              color: DS.text2,
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all var(--ease-fast)',
            }}
          >
            {show ? <Icons.eyeOff size={14} /> : <Icons.eye size={14} />}
          </button>
        )}
      </div>
      {hint && <p style={{ fontSize: 10, color: DS.text3, marginTop: 5, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// K. SELECT CHIP
// ─────────────────────────────────────────────────────────────────────────────

interface SelectChipOption { value: string; label: string }

export function SelectChip({ options, value, onChange }: {
  options: SelectChipOption[]
  value: string
  onChange: (v: string) => void
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => {
        const isActive = value === o.value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              fontSize: 11,
              fontWeight: isActive ? 600 : 400,
              border: `1px solid ${isActive ? DS.accentBd : DS.border}`,
              background: isActive ? DS.accentDim : 'transparent',
              color: isActive ? DS.accent : DS.text2,
              cursor: 'pointer',
              transition: 'all var(--ease-fast)',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// L. STATUS PILL
// ─────────────────────────────────────────────────────────────────────────────

export function StatusPill({ ok, label }: { ok: boolean; label: string }): React.ReactElement {
  const color = ok ? DS.emerald : DS.red
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 11,
      padding: '3px 9px',
      borderRadius: 20,
      fontWeight: 500,
      background: ok ? 'rgba(11,218,118,0.08)' : 'rgba(239,68,68,0.08)',
      border: `1px solid ${ok ? 'rgba(11,218,118,0.22)' : 'rgba(239,68,68,0.25)'}`,
      color,
    }}>
      {ok ? <Icons.check size={11} color={color} /> : <Icons.x size={11} color={color} />}
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// M. SECTION HEADER (Settings tabs)
// ─────────────────────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  icon: React.FC<IconProps>
  title: string
  subtitle?: string
}

export function SectionHeader({ icon: Icon, title, subtitle }: SectionHeaderProps): React.ReactElement {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <div style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: DS.accentDim,
          border: `1px solid ${DS.accentBd}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={14} color={DS.accent} />
        </div>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: DS.text, margin: 0, letterSpacing: '-0.02em' }}>{title}</h2>
      </div>
      {subtitle && <p style={{ fontSize: 12, color: DS.text3, marginLeft: 40, lineHeight: 1.6 }}>{subtitle}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// N. CARD ROW (Settings)
// ─────────────────────────────────────────────────────────────────────────────

interface CardRowProps {
  label: string
  desc?: string
  children: React.ReactNode
  noBorder?: boolean
}

export function CardRow({ label, desc, children, noBorder = false }: CardRowProps): React.ReactElement {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 0',
      borderBottom: noBorder ? 'none' : `1px solid ${DS.borderS}`,
    }}>
      <div style={{ flex: 1, paddingRight: 16 }}>
        <p style={{ fontSize: 13, color: DS.text, margin: 0, marginBottom: desc ? 3 : 0, fontWeight: 400 }}>{label}</p>
        {desc && <p style={{ fontSize: 11, color: DS.text3, margin: 0, lineHeight: 1.5 }}>{desc}</p>}
      </div>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// O. ERROR BOX
// ─────────────────────────────────────────────────────────────────────────────

export function ErrorBox({ msg }: { msg?: string | null }): React.ReactElement | null {
  if (!msg) return null
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '12px 16px',
      background: 'rgba(239,68,68,0.07)',
      border: '1px solid rgba(239,68,68,0.2)',
      borderRadius: 10,
      color: DS.red,
      fontSize: 12,
      lineHeight: 1.6,
    }}>
      <Icons.alertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{msg}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// P. EMPTY STATE
// ─────────────────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.FC<IconProps>
  title: string
  body?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, body, action }: EmptyStateProps): React.ReactElement {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 32px',
      gap: 12,
      textAlign: 'center',
    }}>
      {Icon && (
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: DS.bg4,
          border: `1px solid ${DS.borderS}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
        }}>
          <Icon size={18} color={DS.text3} />
        </div>
      )}
      <p style={{ fontSize: 13, fontWeight: 600, color: DS.text2, margin: 0 }}>{title}</p>
      {body && <p style={{ fontSize: 12, color: DS.text3, margin: 0, lineHeight: 1.6, maxWidth: 320 }}>{body}</p>}
      {action}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Q. DIVIDER
// ─────────────────────────────────────────────────────────────────────────────

export function Divider({ style = {} }: { style?: React.CSSProperties }): React.ReactElement {
  return <div style={{ height: 1, background: DS.borderS, margin: '4px 0', ...style }} />
}

// ─────────────────────────────────────────────────────────────────────────────
// R. TEXTAREA (premium)
// ─────────────────────────────────────────────────────────────────────────────

interface TextareaProps {
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  rows?: number
  style?: React.CSSProperties
}

export function Textarea({ value, onChange, placeholder, rows = 4, style = {} }: TextareaProps): React.ReactElement {
  const [focused, setFocused] = useState(false)
  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: '100%',
        padding: '10px 14px',
        background: DS.bg3,
        border: `1px solid ${focused ? 'var(--accent)' : DS.border}`,
        borderRadius: 8,
        color: DS.text,
        fontSize: 13,
        outline: 'none',
        fontFamily: 'var(--font-ui)',
        resize: 'vertical',
        lineHeight: 1.6,
        transition: 'border-color var(--ease-fast), box-shadow var(--ease-fast)',
        boxShadow: focused ? '0 0 0 3px var(--accent-dim)' : 'none',
        ...style,
      }}
    />
  )
}

