import React from 'react'
import { PenTool, Edit2, Copy as CopyIcon, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PostCardData } from './types'

// ── ActionBtn ─────────────────────────────────────────────────────────────────

interface ActionBtnProps {
  icon: LucideIcon
  label: string
  onClick?: () => void
  danger?: boolean
}

function ActionBtn({ icon: Icon, label, onClick, danger = false }: ActionBtnProps): React.ReactElement {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
        border: `1px solid ${danger ? 'rgba(255,77,77,0.3)' : 'var(--border)'}`,
        background: 'transparent',
        color: danger ? 'var(--red)' : 'var(--text2)',
        cursor: 'pointer', transition: 'all .15s',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = danger ? 'var(--red)'    : 'var(--green)'
        e.currentTarget.style.color       = danger ? 'var(--red)'    : 'var(--green)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = danger ? 'rgba(255,77,77,0.3)' : 'var(--border)'
        e.currentTarget.style.color       = danger ? 'var(--red)'           : 'var(--text2)'
      }}
    >
      <Icon size={11} />{label}
    </button>
  )
}

// ── PostActions ───────────────────────────────────────────────────────────────

export interface PostActionsProps {
  post: PostCardData
  onSendToStudio: () => void
  onEdit: () => void
  onDelete: () => void
  onSave?: () => void
}

export function PostActions({
  post, onSendToStudio, onEdit, onDelete, onSave,
}: PostActionsProps): React.ReactElement {
  const c = post.content || {}
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14, marginBottom: 6 }}>
      <ActionBtn
        icon={PenTool}
        label="Send to Studio"
        onClick={onSendToStudio}
      />
      <ActionBtn icon={Edit2}    label="Edit"      onClick={onEdit} />
      <ActionBtn icon={CopyIcon} label="Duplicate" onClick={onSave} />
      <ActionBtn icon={Trash2}   label="Delete"    onClick={onDelete} danger />
    </div>
  )
}
