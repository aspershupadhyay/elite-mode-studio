/**
 * Sidebar — single-panel collapsible navigation
 * Collapsed: 60px icon-only rail
 * Expanded:  260px icon + label panel
 * Matches reference: white active cards, subtle section labels, user footer
 */

import React, { useState } from 'react'
import {
  Globe, FileText, Flame, Settings, History,
  PenTool, Grid, LogOut, PanelLeftClose, PanelLeftOpen,
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
  const [collapsed, setCollapsed] = useState(false)

  const W = collapsed ? 60 : 260

  const statusColor =
    backendStatus === 'ok'       ? '#22c55e'             :
    backendStatus === 'degraded' ? 'var(--status-amber)' :
                                   'var(--status-red)'

  return (
    <aside style={{
      width: W,
      minWidth: W,
      maxWidth: W,
      background: 'var(--surface-1)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
      transition: 'width 0.2s cubic-bezier(0.4,0,0.2,1), min-width 0.2s cubic-bezier(0.4,0,0.2,1)',
    }}>

      {/* ── Header ── */}
      <div
        className="titlebar-drag-region"
        style={{
          paddingTop: 38,
          paddingBottom: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '38px 0 10px' : '38px 12px 10px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
          gap: 10,
        }}
      >
        {/* Logo mark + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
          {/* Logo mark: dark rounded square, NOT accent color */}
          <div
            onClick={collapsed ? () => setCollapsed(false) : undefined}
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 14,
              color: 'var(--surface-1)',
              letterSpacing: '-0.04em',
              flexShrink: 0,
              cursor: collapsed ? 'pointer' : 'default',
            }}
          >
            C
          </div>

          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <p style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
              }}>
                CreatorOS
              </p>
              <p style={{
                fontSize: 10,
                color: 'var(--text-tertiary)',
                margin: 0,
                whiteSpace: 'nowrap',
              }}>
                AI Content Suite
              </p>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 7,
              padding: 5,
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--surface-3)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text-tertiary)'
            }}
          >
            <PanelLeftClose size={14} />
          </button>
        )}

      </div>

      {/* ── Nav ── */}
      <nav style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: collapsed ? '8px 6px' : '8px 8px',
      }}>
        {SECTIONS.map(section => (
          <div key={section.key} style={{ marginBottom: 2 }}>
            {/* Section label — only when expanded */}
            {section.label && !collapsed && (
              <p style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-tertiary)',
                margin: '10px 8px 3px',
                letterSpacing: '0',
              }}>
                {section.label}
              </p>
            )}

            {section.items.map(({ id, icon: Icon, label }) => {
              const isActive = current === id
              return (
                <button
                  key={id}
                  title={collapsed ? label : undefined}
                  onClick={() => onNav(id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: collapsed ? 0 : 10,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    padding: collapsed ? '9px 0' : '8px 10px',
                    borderRadius: 9,
                    border: isActive
                      ? '1px solid var(--border-default)'
                      : '1px solid transparent',
                    background: isActive ? 'var(--surface-2)' : 'transparent',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    letterSpacing: '-0.01em',
                    textAlign: 'left',
                    transition: 'all 0.12s ease',
                    boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.07)' : 'none',
                    whiteSpace: 'nowrap',
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
                  <Icon
                    size={15}
                    style={{
                      flexShrink: 0,
                      opacity: isActive ? 1 : 0.65,
                      transition: 'opacity 0.12s',
                    }}
                  />
                  {!collapsed && <span>{label}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* ── User footer ── */}
      {user && (
        <div style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: collapsed ? '10px 0' : '10px 10px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8,
        }}>
          {/* Avatar */}
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                flexShrink: 0,
                objectFit: 'cover',
                border: '1px solid var(--border-default)',
              }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              flexShrink: 0,
              background: 'var(--surface-3)',
              border: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}>
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
          )}

          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {user.name || user.email}
                </p>
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: 0 }}>
                  {user.provider}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
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
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Status dot ── */}
      <div style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: collapsed ? '8px 0' : '8px 14px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 7,
      }}>
        <div style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: statusColor,
          flexShrink: 0,
          boxShadow: `0 0 5px ${statusColor}66`,
        }} />
        {!collapsed && (
          <span style={{
            fontSize: 11,
            color: backendStatus === 'ok' ? 'var(--text-tertiary)' : statusColor,
          }}>
            {backendStatus === 'ok' ? 'Online' :
             backendStatus === 'degraded' ? 'Keys missing' :
             backendStatus === 'checking' ? 'Connecting...' : 'Offline'}
          </span>
        )}
      </div>
    </aside>
  )
}
