import type { FabricObject } from 'fabric'
import '@/types/fabric-custom'

// ── Icons ────────────────────────────────────────────────────────────────────
const LockIcon = (): JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
)

const UnlockIcon = (): JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
  </svg>
)

const EyeOnIcon = (): JSX.Element => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

const EyeOffIcon = (): JSX.Element => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)

// ── Props ────────────────────────────────────────────────────────────────────
export interface LayerRowProps {
  object: FabricObject
  label: string
  iconKey: string
  isSelected: boolean
  depth?: number
  isDragOver?: boolean
  isRenaming?: boolean
  renameVal?: string
  rowKey: string | number
  onSelect: () => void
  onDelete?: () => void
  onToggleVisible: (e: React.MouseEvent) => void
  onToggleLock: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDoubleClick: (e: React.MouseEvent) => void
  onRenameChange?: (val: string) => void
  onRenameBlur?: () => void
  onRenameKeyDown?: (e: React.KeyboardEvent) => void
  renameInputRef?: React.RefObject<HTMLInputElement | null>
  typeIcons: Record<string, React.ComponentType<Record<string, unknown>>>
}

export function LayerRow({
  object,
  label,
  iconKey,
  isSelected,
  depth = 0,
  isDragOver = false,
  isRenaming = false,
  renameVal = '',
  rowKey,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onDoubleClick,
  onRenameChange,
  onRenameBlur,
  onRenameKeyDown,
  renameInputRef,
  typeIcons,
}: LayerRowProps): JSX.Element {
  const isVisible = object.visible !== false
  const isLocked  = object.selectable === false
  const IC = typeIcons[iconKey] || typeIcons['shape']

  return (
    <div
      key={rowKey}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      style={{ paddingLeft: 8 + (depth) * 14 }}
      className={[
        'w-full py-[6px] pr-2 flex items-center gap-1.5 text-left transition-all duration-75',
        'cursor-pointer select-none group relative',
        isSelected
          ? 'bg-accent/10 border-l-[2px] border-accent'
          : 'border-l-[2px] border-transparent layer-row-hover',
        isDragOver ? 'outline outline-1 outline-accent/50' : '',
      ].join(' ')}
    >
      {/* Drag handle dots */}
      <span className="flex-shrink-0 opacity-0 group-hover:opacity-30 cursor-grab active:cursor-grabbing" style={{ marginLeft: -2 }}>
        <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor" className="text-white">
          <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
          <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/>
          <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
        </svg>
      </span>

      {/* Type icon */}
      <span className={`flex-shrink-0 transition-colors ${isSelected ? 'text-accent' : 'text-warm-faint'}`}>
        <IC/>
      </span>

      {/* Label or rename input */}
      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameVal}
          onChange={e => onRenameChange?.(e.target.value)}
          onBlur={onRenameBlur}
          onKeyDown={onRenameKeyDown}
          onClick={e => e.stopPropagation()}
          className="flex-1 bg-elite-700 text-warm text-[11px] font-medium px-1 py-0.5 rounded outline outline-1 outline-accent min-w-0"
          style={{ fontSize: 11 }}
        />
      ) : (
        <span className={[
          'text-[11px] font-medium truncate flex-1 transition-colors min-w-0',
          isSelected ? 'text-accent' : 'text-warm-muted group-hover:text-warm',
          !isVisible ? 'opacity-35 line-through' : '',
          isLocked   ? 'opacity-60 italic' : '',
        ].join(' ')}>
          {label}
        </span>
      )}

      {/* Slot badge — shows when element is tagged with a content slot */}
      {object.eliteType && !['title','text','tag','image','frame','background','logo','code','icon','shape','line','gradient','accent_line','group'].includes(object.eliteType) && (
        <span
          title={`Content slot: ${object.eliteType}`}
          className="flex-shrink-0 text-[9px] font-mono px-1 py-0.5 rounded"
          style={{ background: 'var(--accent)22', color: 'var(--accent)', border: '1px solid var(--accent)44', lineHeight: 1 }}
        >
          {`{${object.eliteType}}`}
        </span>
      )}

      {/* Lock toggle */}
      <div
        onClick={onToggleLock}
        title={isLocked ? 'Unlock layer' : 'Lock layer'}
        className={[
          'flex-shrink-0 p-0.5 rounded cursor-pointer transition-all',
          isLocked
            ? 'text-accent opacity-70 hover:opacity-100'
            : 'text-warm-faint opacity-0 group-hover:opacity-50 hover:!opacity-100',
        ].join(' ')}
      >
        {isLocked ? <LockIcon/> : <UnlockIcon/>}
      </div>

      {/* Visibility toggle */}
      <div
        onClick={onToggleVisible}
        title={isVisible ? 'Hide layer' : 'Show layer'}
        className={[
          'flex-shrink-0 p-0.5 rounded cursor-pointer transition-all',
          isVisible
            ? 'text-warm-faint opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:text-warm'
            : 'text-warm-faint opacity-100 hover:text-warm',
        ].join(' ')}
      >
        {isVisible ? <EyeOnIcon/> : <EyeOffIcon/>}
      </div>
    </div>
  )
}
