import { useState, useEffect, useRef } from 'react'
import type { FabricObject, Canvas as FabricCanvas } from 'fabric'
import '@/types/fabric-custom'
import { MoveIcon, MaximizeIcon, SunIcon } from '../../icons/Icons'

export interface PositionSectionProps {
  object: FabricObject
  canvas: FabricCanvas
  onChange: (key: string, value: number) => void
}

const Section = ({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }): JSX.Element => (
  <div>
    <div className="flex items-center gap-1.5 mb-1.5">
      {icon && <span className="text-warm-faint">{icon}</span>}
      <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">{title}</label>
    </div>
    {children}
  </div>
)

// NumInput uses local string state so clearing + retyping doesn't get stuck at 0.
const NumInput = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }): JSX.Element => {
  const [local, setLocal] = useState(String(value))
  const focused = useRef(false)

  // Sync from external (canvas) value whenever not actively editing
  useEffect(() => {
    if (!focused.current) setLocal(String(value))
  }, [value])

  const commit = (s: string): void => {
    const n = parseInt(s, 10)
    if (!isNaN(n)) onChange(n)
    // Revert display to a clean integer (or the unchanged value if invalid)
    setLocal(String(isNaN(n) ? value : n))
  }

  return (
    <div className="flex items-center bg-elite-800 border border-elite-600/40 rounded overflow-hidden">
      <span className="px-2 text-[10px] text-warm-faint font-mono bg-elite-850 py-1.5 border-r border-elite-600/30">{label}</span>
      <input
        type="number"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onFocus={() => { focused.current = true }}
        onBlur={e => { focused.current = false; commit(e.target.value) }}
        onKeyDown={e => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value) }}
        className="flex-1 bg-transparent px-2 py-1.5 text-[11px] text-warm font-mono outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  )
}

export function PositionSection({ object, canvas, onChange }: PositionSectionProps): JSX.Element {
  // Force re-render during live drag/resize so X/Y/W/H update in real time
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!canvas) return
    const refresh = (): void => setTick(t => t + 1)
    canvas.on('object:moving',   refresh)
    canvas.on('object:scaling',  refresh)
    canvas.on('object:rotating', refresh)
    canvas.on('object:resizing', refresh)
    return (): void => {
      canvas.off('object:moving',   refresh)
      canvas.off('object:scaling',  refresh)
      canvas.off('object:rotating', refresh)
      canvas.off('object:resizing', refresh)
    }
  }, [canvas])

  const left    = Math.round(object.left || 0)
  const top     = Math.round(object.top  || 0)
  const width   = Math.round((object.width  || 0) * (object.scaleX || 1))
  const height  = Math.round((object.height || 0) * (object.scaleY || 1))
  const opacity = object.opacity ?? 1

  // For FabricImage, rx lives on the clipPath (local coords) — convert to visual px
  const rxRaw   = object.type === 'image'
    ? ((object as FabricObject & { clipPath?: FabricObject & { rx?: number } }).clipPath?.rx || 0)
    : (object as FabricObject & { rx?: number }).rx || 0
  const rx = Math.round(rxRaw * (object.scaleX || 1))

  // Corner radius: supported for rects (including rect frames), images, logos
  const eliteType = object.eliteType || ''
  const supportsRadius = (object.type === 'rect' || ['image', 'logo'].includes(eliteType))
    && !['gradient', 'line', 'accent_line'].includes(eliteType)

  return (
    <>
      <Section icon={<MoveIcon/>} title="Position">
        <div className="grid grid-cols-2 gap-2">
          <NumInput label="X" value={left}   onChange={v => onChange('left', v)}/>
          <NumInput label="Y" value={top}    onChange={v => onChange('top',  v)}/>
        </div>
      </Section>
      <Section icon={<MaximizeIcon/>} title="Size">
        <div className="grid grid-cols-2 gap-2">
          <NumInput label="W" value={width}  onChange={v => onChange('width',  v)}/>
          <NumInput label="H" value={height} onChange={v => onChange('height', v)}/>
        </div>
      </Section>
      {supportsRadius && (
        <Section title="Corner Radius">
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={Math.min(width, height) / 2 || 100} step={1} value={rx}
              onChange={e => onChange('rx', parseInt(e.target.value))} className="flex-1 accent-accent h-1"/>
            <div className="w-16"><NumInput label="R" value={rx} onChange={v => onChange('rx', v)}/></div>
          </div>
        </Section>
      )}
      <Section icon={<SunIcon/>} title="Opacity">
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={1} step={0.01} value={opacity}
            onChange={e => onChange('opacity', parseFloat(e.target.value))} className="flex-1 accent-accent h-1"/>
          <span className="text-[10px] text-warm-faint font-mono w-8 text-right">{Math.round(opacity * 100)}%</span>
        </div>
      </Section>
    </>
  )
}
