/**
 * Sidebar — Notion-style collapsible navigation
 * - Collapsed: 48px icon-only rail
 * - Expanded:  200px full labels
 * - Sections are individually collapsible
 * - Smooth CSS transition, no layout jank
 */

import React, { useState } from 'react'
import {
  Globe, FileText, Flame, Settings, History,
  PenTool, Grid, ChevronLeft, ChevronRight,
  ChevronDown, LogOut,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DS } from '../design-system'
import type { AuthUser } from '../types/ipc'

export type PageId =
  | 'web'
  | 'doc'
  | 'forge'
  | 'studio'
  | 'templates'
  | 'history'
  | 'settings'

export type BackendStatus = 'ok' | 'degraded' | 'down' | 'checking'

interface NavItem {
  id:    PageId
  icon:  LucideIcon
  label: string
}

interface NavSection {
  key:   string
  label?: string
  items: NavItem[]
}

const SECTIONS: NavSection[] = [
  {
    key: 'top',
    items: [
      { id: 'web', icon: Globe,    label: 'AI Browser' },
      { id: 'doc', icon: FileText, label: 'Doc RAG'    },
    ],
  },
  {
    key: 'generate',
    label: 'Generate',
    items: [
      { id: 'forge', icon: Flame, label: 'Forge' },
    ],
  },
  {
    key: 'create',
    label: 'Create',
    items: [
      { id: 'studio',    icon: PenTool, label: 'Design Studio' },
      { id: 'templates', icon: Grid,    label: 'Templates'     },
    ],
  },
  {
    key: 'manage',
    label: 'Manage',
    items: [
      { id: 'history',  icon: History,  label: 'Post History' },
      { id: 'settings', icon: Settings, label: 'Settings'     },
    ],
  },
]

interface SidebarProps {
  current:        PageId
  onNav:          (id: PageId) => void
  backendStatus?: BackendStatus
  user?:          AuthUser | null
  onLogout?:      () => void
}

export default function Sidebar({ current, onNav, backendStatus, user, onLogout }: SidebarProps): React.ReactElement {
  const [collapsed,         setCollapsed]         = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  const W = collapsed ? 48 : 200

  const statusColor =
    backendStatus === 'ok'       ? 'var(--accent)'       :
    backendStatus === 'degraded' ? 'var(--status-amber)'  :
                                   'var(--status-red)'

  const statusLabel =
    backendStatus === 'ok'       ? 'Online'        :
    backendStatus === 'degraded' ? 'Keys missing'  :
    backendStatus === 'checking' ? 'Connecting…'   : 'Offline'

  function toggleSection(key: string): void {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return (
    <aside style={{
      width: W,
      minWidth: W,
      maxWidth: W,
      background: 'var(--surface-1)',
      borderRight: '0.5px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
      transition: 'width 0.18s cubic-bezier(0.4,0,0.2,1), min-width 0.18s cubic-bezier(0.4,0,0.2,1)',
    }}>

      {/* ── Header: logo + collapse toggle ─────────────────────────── */}
      <div
        className="titlebar-drag-region"
        style={{
          paddingTop: 38,
          paddingBottom: 10,
          paddingLeft: collapsed ? 0 : 14,
          paddingRight: collapsed ? 0 : 10,
          borderBottom: '0.5px solid var(--border-subtle)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8,
        }}
      >
        {/* Logo mark — always visible */}
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 12, color: 'var(--accent-fg)',
          letterSpacing: '-0.03em', flexShrink: 0,
          cursor: collapsed ? 'pointer' : 'default',
        }}
          onClick={() => collapsed && setCollapsed(false)}
        >
          C
        </div>

        {/* Name + status — hidden when collapsed */}
        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                CreatorOS
              </p>
              <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: 0, letterSpacing: '0.01em' }}>
                AI Content Suite
              </p>
            </div>

            {/* Status dot */}
            {backendStatus && backendStatus !== 'checking' && (
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: statusColor, flexShrink: 0,
                boxShadow: `0 0 6px ${statusColor}`,
              }} />
            )}
          </>
        )}
      </div>

      {/* ── Collapse / expand toggle button ────────────────────────── */}
      <button
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        style={{
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-end',
          padding: collapsed ? '6px 0' : '6px 10px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-tertiary)',
          borderBottom: '0.5px solid var(--border-subtle)',
          flexShrink: 0,
          transition: 'color 0.1s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)' }}
      >
        {collapsed
          ? <ChevronRight size={13} />
          : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'inherit' }}>
              <ChevronLeft size={13} />
              {!collapsed && <span style={{ fontSize: 10, letterSpacing: '0.02em' }}>Collapse</span>}
            </div>
          )
        }
      </button>

      {/* ── Navigation ───────────────────────────────────────────────── */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: 6, paddingBottom: 6 }}>
        {SECTIONS.map(section => {
          const isSectionCollapsed = collapsedSections.has(section.key)
          return (
            <div key={section.key}>

              {/* Section header — only shown when sidebar is expanded and section has a label */}
              {section.label && !collapsed && (
                <button
                  onClick={() => toggleSection(section.key)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '5px 14px 3px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {section.label}
                  </span>
                  <ChevronDown
                    size={11}
                    style={{
                      transition: 'transform 0.15s',
                      transform: isSectionCollapsed ? 'rotate(-90deg)' : 'none',
                    }}
                  />
                </button>
              )}

              {/* Items */}
              {!isSectionCollapsed && section.items.map(({ id, icon: Icon, label }) => {
                const isActive = current === id
                return (
                  <button
                    key={id}
                    title={collapsed ? label : undefined}
                    className={`nav-item${isActive ? ' active' : ''}`}
                    onClick={() => onNav(id)}
                    style={{
                      justifyContent: collapsed ? 'center' : undefined,
                      paddingLeft: collapsed ? 0 : undefined,
                      paddingRight: collapsed ? 0 : undefined,
                    }}
                  >
                    <span className="nav-icon">
                      <Icon size={14} />
                    </span>
                    {!collapsed && (
                      <span style={{ fontSize: 13, letterSpacing: '-0.01em' }}>{label}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* ── User + logout ─────────────────────────────────────────────── */}
      {user && (
        <div style={{ borderTop: '0.5px solid var(--border-subtle)', padding: collapsed ? '8px 0' : '8px 12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            ) : (
              <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accent-fg)' }}>
                {(user.name || user.email).charAt(0).toUpperCase()}
              </div>
            )}
            {!collapsed && (
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name || user.email}</p>
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: 0 }}>{user.provider}</p>
              </div>
            )}
          </div>
          {!collapsed && onLogout && (
            <button onClick={onLogout} title="Sign out" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'color 0.1s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--status-red)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)' }}>
              <LogOut size={13} />
            </button>
          )}
        </div>
      )}

      {/* ── Backend status footer ─────────────────────────────────────── */}
      <div style={{
        borderTop: '0.5px solid var(--border-subtle)',
        padding: collapsed ? '8px 0' : '8px 14px',
        flexShrink: 0,
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 7,
      }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
        {!collapsed && (
          <span style={{ fontSize: 11, color: backendStatus === 'ok' ? DS.text3 : statusColor, letterSpacing: '0.01em' }}>
            {statusLabel}
          </span>
        )}
      </div>
    </aside>
  )
}
