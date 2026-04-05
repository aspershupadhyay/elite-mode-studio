import { useRef, useState, useEffect } from 'react'
import type { RefObject } from 'react'
import type { FabricObject, Canvas as FabricCanvas } from 'fabric'
import '@/types/fabric-custom'
import { loadFileIntoFrame, refitFrame } from '../../canvas/frames'
import type { CanvasHandle } from '@/types/canvas'

export interface FrameSectionProps {
  object: FabricObject
  canvas: FabricCanvas
  canvasRef: RefObject<CanvasHandle | null>
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }): JSX.Element => (
  <div>
    <div className="flex items-center gap-1.5 mb-1.5">
      <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">{title}</label>
    </div>
    {children}
  </div>
)

const FIT_MODES = [
  { id: 'fill',    label: 'Fill',     desc: 'Cover entire frame', icon: 'M3 3h18v18H3z' },
  { id: 'fit',     label: 'Fit',      desc: 'Show whole image',   icon: 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3' },
  { id: 'stretch', label: 'Stretch',  desc: 'Distort to fit',     icon: 'M5 9V5m0 0h4M5 5l5 5m9-1V5m0 0h-4m4 0l-5 5M5 15v4m0 0h4m-4 0l5-5m9 5l-5-5m5 5v-4m0 4h-4' },
  { id: 'none',    label: 'Original', desc: 'Natural size',       icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6v4l3 3' },
]

export function FrameSection({ object, canvas, canvasRef }: FrameSectionProps): JSX.Element {
  const frameFileRef = useRef<HTMLInputElement>(null)

  const [fitMode,    setFitMode]    = useState(object.eliteFitMode    || 'fill')
  const [offsetX,    setOffsetX]    = useState(object.eliteImageOffsetX || 0)
  const [offsetY,    setOffsetY]    = useState(object.eliteImageOffsetY || 0)
  const [imgScale,   setImgScale]   = useState(object.eliteImageScale  || 1)
  const [hasImage,   setHasImage]   = useState(!!object.eliteImageSrc || !!object._eliteImageEl)

  // Sync state when selected object changes
  useEffect(() => {
    setFitMode(object.eliteFitMode    || 'fill')
    setOffsetX(object.eliteImageOffsetX || 0)
    setOffsetY(object.eliteImageOffsetY || 0)
    setImgScale(object.eliteImageScale  || 1)
    setHasImage(!!object.eliteImageSrc || !!object._eliteImageEl)
  }, [object])

  const applyFit = (mode: string): void => {
    object.eliteFitMode = mode as 'fill' | 'fit' | 'stretch' | 'none'
    refitFrame(object)
    canvas.renderAll()
    setFitMode(mode as 'fill' | 'fit' | 'stretch' | 'none')
  }

  const applyOffset = (dx: number, dy: number): void => {
    object.eliteImageOffsetX = dx
    object.eliteImageOffsetY = dy
    refitFrame(object)
    canvas.renderAll()
    setOffsetX(dx); setOffsetY(dy)
  }

  const applyScale = (scale: number): void => {
    object.eliteImageScale = scale
    refitFrame(object)
    canvas.renderAll()
    setImgScale(scale)
  }

  const replaceImage = (file: File): void => {
    loadFileIntoFrame(object, file, () => {
      canvas.renderAll()
      setHasImage(true)
    })
  }

  const clearImg = (): void => {
    canvasRef.current?.clearFrameImage(object)
    setHasImage(false)
    setOffsetX(0); setOffsetY(0); setImgScale(1)
  }

  return (
    <>
      {/* Hidden file picker */}
      <input ref={frameFileRef} type="file" accept="image/*" className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) replaceImage(f)
          e.target.value = ''
        }}/>

      {/* Frame info banner */}
      <div className="flex items-center gap-2 px-2.5 py-2 bg-accent/8 border border-accent/20 rounded-lg">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent flex-shrink-0">
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-accent font-semibold">{object.eliteFrameShape?.toUpperCase() || 'Frame'}</p>
          <p className="text-[9px] text-warm-faint">
            {object.eliteFrameW}×{object.eliteFrameH}px · {hasImage ? 'Image loaded' : 'No image — double-click to add'}
          </p>
        </div>
      </div>

      {/* Image actions */}
      <Section title="Image">
        <div className="flex gap-2">
          <button onClick={() => frameFileRef.current?.click()}
            className="flex-1 py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent text-[11px] font-semibold hover:bg-accent/20 transition-colors cursor-pointer">
            {hasImage ? 'Replace' : '+ Add Image'}
          </button>
          {hasImage && (
            <button onClick={clearImg}
              className="px-3 py-2 rounded-lg bg-elite-700 border border-elite-600/40 text-warm-faint text-[11px] hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/8 transition-colors cursor-pointer">
              Clear
            </button>
          )}
        </div>
      </Section>

      {/* Fit mode */}
      <Section title="Fit Mode">
        <div className="grid grid-cols-2 gap-1.5">
          {FIT_MODES.map(m => (
            <button key={m.id} onClick={() => applyFit(m.id)}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all cursor-pointer text-left
                ${fitMode === m.id ? 'bg-accent/12 border-accent/40 text-accent' : 'bg-elite-800 border-elite-600/40 text-warm-faint hover:border-warm-faint hover:text-warm'}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                {m.icon.split('M').filter(Boolean).map((d, i) => <path key={i} d={`M${d}`}/>)}
              </svg>
              <div>
                <p className="text-[10px] font-semibold leading-none">{m.label}</p>
                <p className="text-[9px] opacity-60 mt-0.5">{m.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </Section>

      {/* Pan / crop */}
      {(fitMode === 'fill' || fitMode === 'none') && hasImage && (
        <Section title="Crop / Pan">
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-warm-faint">Horizontal</span>
                <span className="text-[10px] text-warm-faint font-mono">{offsetX}px</span>
              </div>
              <input type="range" min={-500} max={500} step={5} value={offsetX}
                onChange={e => applyOffset(parseInt(e.target.value), offsetY)}
                className="w-full accent-accent h-1 cursor-pointer"/>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-warm-faint">Vertical</span>
                <span className="text-[10px] text-warm-faint font-mono">{offsetY}px</span>
              </div>
              <input type="range" min={-500} max={500} step={5} value={offsetY}
                onChange={e => applyOffset(offsetX, parseInt(e.target.value))}
                className="w-full accent-accent h-1 cursor-pointer"/>
            </div>
            {(offsetX !== 0 || offsetY !== 0) && (
              <button onClick={() => applyOffset(0, 0)}
                className="text-[10px] text-warm-faint hover:text-warm cursor-pointer transition-colors">
                ↺ Reset pan to center
              </button>
            )}
          </div>
        </Section>
      )}

      {/* Image zoom */}
      {hasImage && (
        <Section title="Image Zoom">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-warm-faint">Scale</span>
              <span className="text-[10px] text-warm-faint font-mono">{Math.round(imgScale * 100)}%</span>
            </div>
            <input type="range" min={0.25} max={4} step={0.05} value={imgScale}
              onChange={e => applyScale(parseFloat(e.target.value))}
              className="w-full accent-accent h-1 cursor-pointer"/>
            <div className="flex justify-between text-[9px] text-warm-faint mt-0.5">
              <span>25%</span><span>100%</span><span>400%</span>
            </div>
          </div>
        </Section>
      )}

      {/* Tip */}
      <div className="px-2.5 py-2 bg-elite-700/40 rounded-lg">
        <p className="text-[9px] text-warm-faint leading-relaxed">
          <span className="text-warm-muted font-medium">Tips: </span>
          Double-click frame on canvas to add/swap image · Drag an image from your files directly onto the frame · Use Pan to adjust crop position
        </p>
      </div>
    </>
  )
}
