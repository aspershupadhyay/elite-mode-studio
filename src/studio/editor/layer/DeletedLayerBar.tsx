import { useState } from 'react'

const RestoreIcon = (): JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/>
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
  </svg>
)

export interface DeletedLayerItem {
  label: string
  type: string
}

export interface DeletedLayerBarProps {
  count: number
  items: DeletedLayerItem[]
  typeIcons: Record<string, React.ComponentType<Record<string, unknown>>>
  onRestore: (index: number) => void
  onClear?: () => void
}

export function DeletedLayerBar({
  count,
  items,
  typeIcons,
  onRestore,
}: DeletedLayerBarProps): JSX.Element {
  const [showRecycleBin, setShowRecycleBin] = useState(false)

  // Fallback shape icon
  const FallbackIcon = typeIcons['shape'] || (() => null)

  return (
    <div className="border-t border-elite-600/25 flex-shrink-0">
      <button
        onClick={() => setShowRecycleBin(!showRecycleBin)}
        className="w-full px-4 py-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-warm-faint hover:text-warm transition-colors cursor-pointer"
      >
        <RestoreIcon/>
        <span>Deleted ({count})</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
             className={`ml-auto transition-transform ${showRecycleBin ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {showRecycleBin && (
        <div className="max-h-[160px] overflow-y-auto pb-1">
          {items.map((item, i) => {
            const IC = typeIcons[item.type] || FallbackIcon
            return (
              <div key={i} className="w-full px-2 py-[6px] flex items-center gap-2 text-[11px] text-warm-faint group">
                <span className="flex-shrink-0 opacity-40"><IC/></span>
                <span className="flex-1 truncate opacity-50 line-through">{item.label}</span>
                <button
                  onClick={() => onRestore(i)}
                  className="flex-shrink-0 p-1 rounded text-accent/60 hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                >
                  <RestoreIcon/>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
