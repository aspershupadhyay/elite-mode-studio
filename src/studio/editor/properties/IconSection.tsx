import type { FabricObject, Canvas as FabricCanvas } from 'fabric'
import '@/types/fabric-custom'

const COLOR_PALETTE = [
  '#FFFFFF','#EAEAEA','#CCCCCC','#999999','#666666','#444444','#222222','#111111',
  '#FF4444','#FF6B6B','#FF8C42','#FFA62F','#FFD93D','#FFE066','#B8F2E6','#AED9E0',
  '#4488FF','#5C7AEA','#8B5CF6','#A78BFA','#C084FC','#E879F9','#F472B6','#FB7185',
  '#0BDA76','#34D399','#2DD4BF','#22D3EE','#38BDF8','#60A5FA','#818CF8','#A78BFA',
  '#10B981','#059669','#047857','#065F46','#064E3B','#F59E0B','#D97706','#B45309',
]

export interface IconSectionProps {
  object: FabricObject
  canvas: FabricCanvas
  onUpdate: (key: string, value: string | number) => void
}

const ColorSwatch = ({
  color, active, onClick,
}: { color: string; active: boolean; onClick: () => void }): JSX.Element => (
  <button onClick={onClick}
    className={`w-full aspect-square rounded-sm border cursor-pointer transition-all duration-100 hover:scale-110 ${active ? 'border-accent ring-1 ring-accent/50 scale-110' : 'border-elite-600/30 hover:border-warm-faint'}`}
    style={{ backgroundColor: color }} title={color}/>
)

export function IconSection({ object, onUpdate }: IconSectionProps): JSX.Element {
  const stroke      = (typeof object.stroke === 'string' ? object.stroke : '') || ''
  const strokeWidth = object.strokeWidth || 1.5
  const fill        = typeof object.fill === 'string' ? object.fill : 'transparent'

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">Icon Color & Size</label>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-warm-faint uppercase tracking-widest block mb-1">Stroke Color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={stroke || '#0BDA76'}
              onChange={e => onUpdate('stroke', e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5"/>
            <input type="text" value={stroke || '#0BDA76'}
              onChange={e => onUpdate('stroke', e.target.value)}
              className="flex-1 bg-elite-800 border border-elite-600/40 rounded px-2 py-1 text-[11px] text-warm font-mono focus:border-accent/60 outline-none uppercase"/>
          </div>
          <div className="grid grid-cols-8 gap-1 mt-2">
            {COLOR_PALETTE.map((c, i) => (
              <ColorSwatch key={i} color={c}
                active={stroke?.toLowerCase() === c.toLowerCase()}
                onClick={() => onUpdate('stroke', c)}/>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-warm-faint w-16">Thickness</span>
          <input type="range" min={0.5} max={5} step={0.25} value={strokeWidth}
            onChange={e => onUpdate('strokeWidth', parseFloat(e.target.value))}
            className="flex-1 accent-accent h-1"/>
          <span className="text-[10px] text-warm-faint font-mono w-8 text-right">{strokeWidth}px</span>
        </div>
        <div>
          <label className="text-[10px] text-warm-faint uppercase tracking-widest block mb-1">Fill</label>
          <div className="flex items-center gap-2">
            <input type="color" value={fill && fill !== 'transparent' ? fill : '#000000'}
              onChange={e => onUpdate('fill', e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-elite-600/50 bg-transparent [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch-wrapper]:p-0.5"/>
            <input type="text" value={fill || 'transparent'}
              onChange={e => onUpdate('fill', e.target.value)}
              className="flex-1 bg-elite-800 border border-elite-600/40 rounded px-2 py-1 text-[11px] text-warm font-mono focus:border-accent/60 outline-none"/>
            <button onClick={() => onUpdate('fill', 'transparent')}
              className="px-2 py-1 text-[10px] text-warm-faint bg-elite-800 border border-elite-600/40 rounded hover:border-accent/40 cursor-pointer" title="No fill">∅</button>
          </div>
        </div>
      </div>
    </div>
  )
}
