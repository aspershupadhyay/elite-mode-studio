/**
 * Sidebar — dual-column navigation
 * Left: 52px icon rail (always visible)
 * Right: 220px nav panel (collapses to hidden)
 */

import React, { useState } from 'react'
import {
  Globe, FileText, Flame, Settings, History,
  PenTool, Grid, LogOut, ChevronsUpDown,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
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
  key:    string
  label?: string
  items:  NavItem[]
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

// Flat list of all items for icon rail
const ALL_ITEMS: NavItem[] = SECTIONS.flatMap(s => s.items)

interface SidebarProps {
  current:        PageId
  onNav:          (id: PageId) => void
  backendStatus?: BackendStatus
  user?:          AuthUser | null
  onLogout?:      () => void
}

export default function Sidebar({
  current, onNav, backendStatus, user, onLogout,
}: SidebarProps): React.ReactElement {
  const [panelOpen, setPanelOpen] = useState(true)

  const statusColor =
    backendStatus === 'ok'       ? '#22c55e'             :
    backendStatus === 'degraded' ? 'var(--status-amber)' :
                                   'var(--status-red)'

  /* ── Icon rail ── */
  const rail = (
    <div style={{
      width: 52,
      minWidth: 52,
      background: 'var(--surface-0)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 44,
      paddingBottom: 0,
      flexShrink: 0,
      gap: 2,
    }}>
      {/* Logo mark */}
      <div
        className="titlebar-drag-region"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 52,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: 13,
          color: 'var(--accent-fg)',
          letterSpacing: '-0.03em',
          flexShrink: 0,
          cursor: 'pointer',
        }}
          onClick={() => setPanelOpen(v => !v)}
        >
          C
        </div>
      </div>

      {/* Nav icons */}
      <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingTop: 4 }}>
        {ALL_ITEMS.map(({ id, icon: Icon, label }) => {
          const isActive = current === id
          return (
            <button
              key={id}
              title={label}
              onClick={() => { onNav(id); if (!panelOpen) setPanelOpen(true) }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: isActive ? '1px solid var(--border-default)' : '1px solid transparent',
                background: isActive ? 'var(--surface-2)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                transition: 'all 0.12s ease',
                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--surface-3)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-tertiary)'
                }
              }}
            >
              <Icon size={15} />
            </button>
          )
        })}
      </div>

      {/* Status dot at bottom */}
      <div style={{
        width: '100%',
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        borderTop: '1px solid var(--border-subtle)',
      }}>
        <div style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: statusColor,
          boxShadow: `0 0 6px ${statusColor}55`,
        }} />
      </div>
    </div>
  )

  /* ── Nav panel ── */
  const panel = panelOpen ? (
    <div style={{
      width: 220,
      minWidth: 220,
      background: 'var(--surface-1)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
    }}>

      {/* App header */}
      <div
        className="titlebar-drag-region"
        style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
          borderBottom: '1px solid var(--border-subtle)',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}>
            CreatorOS
          </p>
          <p style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            margin: 0,
          }}>
            AI Content Suite
          </p>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 8px 4px' }}>
        {SECTIONS.map(section => (
          <div key={section.key} style={{ marginBottom: 4 }}>
            {section.label && (
              <p style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                margin: '8px 6px 4px',
              }}>
                {section.label}
              </p>
            )}
            {section.items.map(({ id, icon: Icon, label }) => {
              const isActive = current === id
              return (
                <button
                  key={id}
                  onClick={() => onNav(id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: isActive ? '1px solid var(--border-default)' : '1px solid transparent',
                    background: isActive ? 'var(--surface-2)' : 'transparent',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    letterSpacing: '-0.01em',
                    textAlign: 'left',
                    transition: 'all 0.12s ease',
                    boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--surface-3)'
                      e.currentTarget.style.color = 'var(--text-primary)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--text-secondary)'
                    }
                  }}
                >
                  <Icon size={15} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }} />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      {user && (
        <div style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '10px 10px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          {/* Avatar */}
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, objectFit: 'cover', border: '1px solid var(--border-default)' }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              flexShrink: 0,
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--accent-fg)',
            }}>
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
          )}

          {/* Name */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name || user.email}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: 0 }}>
              {user.provider}
            </p>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            {onLogout && (
              <button
                onClick={onLogout}
                title="Sign out"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  padding: 5,
                  borderRadius: 7,
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--status-red)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
              >
                <LogOut size={13} />
              </button>
            )}
            <button
              onClick={() => setPanelOpen(false)}
              title="Collapse"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
                padding: 5,
                borderRadius: 7,
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
            >
              <ChevronsUpDown size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  ) : null

  return (
    <aside style={{ display: 'flex', flexDirection: 'row', flexShrink: 0, position: 'relative' }}>
      {rail}
      {panel}
    </aside>
  )
}
