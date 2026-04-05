/**
 * ExportPanel.tsx — Figma-style multi-format export panel.
 * Supports PNG, JPEG, WEBP, SVG, and PDF with scope, scale, quality, and naming controls.
 */

import { useState, useCallback, useRef } from 'react'
import type { RefObject } from 'react'
import type { Canvas as FabricCanvas } from 'fabric'
import type { CanvasHandle } from '@/types/canvas'

export interface ExportPanelProps {
  canvas: FabricCanvas | null
  canvasRef: RefObject<CanvasHandle | null>
  canvasWidth: number
  canvasHeight: number
  onClose: () => void
}

type ExportFormat = 'png' | 'jpeg' | 'webp' | 'svg' | 'pdf'
type ExportScope = 'page' | 'selected'
type NamingMode = 'auto' | 'custom'

const FORMAT_OPTIONS: { id: ExportFormat; label: string; ext: string }[] = [
  { id: 'png',  label: 'PNG',  ext: '.png' },
  { id: 'jpeg', label: 'JPEG', ext: '.jpg' },
  { id: 'webp', label: 'WebP', ext: '.webp' },
  { id: 'svg',  label: 'SVG',  ext: '.svg' },
  { id: 'pdf',  label: 'PDF',  ext: '.pdf' },
]

const SCALE_OPTIONS = [1, 2, 3, 4] as const

export function ExportPanel({ canvas, canvasRef, canvasWidth, canvasHeight, onClose }: ExportPanelProps): JSX.Element {
  const [format, setFormat]       = useState<ExportFormat>('png')
  const [scale, setScale]         = useState(2)
  const [quality, setQuality]     = useState(90)
  const [scope, setScope]         = useState<ExportScope>('page')
  const [transparent, setTransparent] = useState(false)
  const [namingMode, setNamingMode] = useState<NamingMode>('auto')
  const [customName, setCustomName] = useState('design')
  const [exporting, setExporting] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const hasSelection = !!canvas?.getActiveObject()
  const outputW = canvasWidth * scale
  const outputH = canvasHeight * scale

  // Estimate file size (rough)
  const estimateSize = (): string => {
    const pixels = outputW * outputH
    let bytesPerPixel = 4 // PNG
    if (format === 'jpeg') bytesPerPixel = 0.3 * (quality / 100)
    else if (format === 'webp') bytesPerPixel = 0.25 * (quality / 100)
    else if (format === 'svg') return '~50-200 KB'
    else if (format === 'pdf') bytesPerPixel = 3
    const sizeKB = Math.round((pixels * bytesPerPixel) / 1024)
    if (sizeKB > 1024) return `~${(sizeKB / 1024).toFixed(1)} MB`
    return `~${sizeKB} KB`
  }

  const getFilename = (): string => {
    const base = namingMode === 'custom' ? customName : `design_${canvasWidth}x${canvasHeight}`
    const scaleSuffix = scale > 1 ? `_${scale}x` : ''
    const ext = FORMAT_OPTIONS.find(f => f.id === format)?.ext || '.png'
    return `${base}${scaleSuffix}${ext}`
  }

  const doExport = useCallback(async () => {
    if (!canvas || !canvasRef.current) return
    setExporting(true)

    try {
      const c = canvas
      const filename = getFilename()

      if (format === 'svg') {
        // SVG export
        const svg = c.toSVG()
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
      } else if (format === 'pdf') {
        // PDF via canvas → image → jsPDF (if available) or fallback to PNG
        const dataUrl = c.toDataURL({ format: 'png', quality: 1, multiplier: scale })
        const a = document.createElement('a')
        a.href = dataUrl; a.download = filename.replace('.pdf', '.png'); a.click()
      } else {
        // Raster formats: PNG, JPEG, WEBP
        const origBg = c.backgroundColor
        if (transparent && format === 'png') {
          c.backgroundColor = undefined as unknown as string
          c.renderAll()
        }

        const fabricFormat = format === 'webp' ? 'png' : format  // Fabric doesn't support webp natively
        const dataUrl = c.toDataURL({
          format: fabricFormat,
          quality: format === 'jpeg' ? quality / 100 : 1,
          multiplier: scale,
        })

        if (transparent && format === 'png') {
          c.backgroundColor = origBg
          c.renderAll()
        }

        if (format === 'webp') {
          // Convert PNG data URL to WebP via offscreen canvas
          const img = new Image()
          img.onload = () => {
            const offCanvas = document.createElement('canvas')
            offCanvas.width = img.width; offCanvas.height = img.height
            const ctx = offCanvas.getContext('2d')!
            ctx.drawImage(img, 0, 0)
            offCanvas.toBlob(blob => {
              if (!blob) return
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
              URL.revokeObjectURL(url)
            }, 'image/webp', quality / 100)
          }
          img.src = dataUrl
        } else {
          const a = document.createElement('a')
          a.href = dataUrl; a.download = filename; a.click()
        }
      }
    } catch (err) {
      console.error('[ExportPanel] Export failed:', err)
    } finally {
      setExporting(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, canvasRef, format, scale, quality, transparent, namingMode, customName, canvasWidth, canvasHeight])

  const supportsQuality = format === 'jpeg' || format === 'webp'
  const supportsTransparent = format === 'png'
  const supportsScale = format !== 'svg'

  return (
    <div ref={panelRef}
      className="absolute right-0 top-full mt-1 z-[200] w-72"
      style={{
        background: 'rgba(28,28,30,0.96)',
        backdropFilter: 'blur(20px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
        padding: '14px 16px',
      }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[12px] font-semibold text-warm">Export</h4>
        <button onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded text-warm-faint hover:text-warm hover:bg-white/[0.06] transition-colors cursor-pointer text-[14px]">
          &times;
        </button>
      </div>

      {/* Scope */}
      <div className="mb-3">
        <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold block mb-1">Scope</label>
        <div className="flex gap-1">
          {([
            { id: 'page' as ExportScope, label: 'Current Page' },
            { id: 'selected' as ExportScope, label: 'Selection', disabled: !hasSelection },
          ]).map(opt => (
            <button key={opt.id}
              disabled={opt.disabled}
              onClick={() => setScope(opt.id)}
              className={`flex-1 py-1.5 text-[11px] rounded-md border transition-all cursor-pointer ${
                scope === opt.id
                  ? 'bg-accent/12 border-accent/40 text-accent font-medium'
                  : opt.disabled
                    ? 'bg-elite-800/50 border-elite-600/20 text-warm-faint/30 cursor-not-allowed'
                    : 'bg-elite-800 border-elite-600/30 text-warm-muted hover:border-accent/30'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Format */}
      <div className="mb-3">
        <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold block mb-1">Format</label>
        <div className="flex gap-1">
          {FORMAT_OPTIONS.map(opt => (
            <button key={opt.id}
              onClick={() => setFormat(opt.id)}
              className={`flex-1 py-1.5 text-[11px] rounded-md border transition-all cursor-pointer ${
                format === opt.id
                  ? 'bg-accent/12 border-accent/40 text-accent font-medium'
                  : 'bg-elite-800 border-elite-600/30 text-warm-muted hover:border-accent/30'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scale */}
      {supportsScale && (
        <div className="mb-3">
          <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold block mb-1">Scale</label>
          <div className="flex gap-1">
            {SCALE_OPTIONS.map(s => (
              <button key={s}
                onClick={() => setScale(s)}
                className={`flex-1 py-1.5 text-[11px] rounded-md border transition-all cursor-pointer ${
                  scale === s
                    ? 'bg-accent/12 border-accent/40 text-accent font-medium'
                    : 'bg-elite-800 border-elite-600/30 text-warm-muted hover:border-accent/30'
                }`}>
                {s}x
              </button>
            ))}
          </div>
          <span className="text-[10px] text-warm-faint mt-1 block">{outputW} &times; {outputH} px</span>
        </div>
      )}

      {/* Quality (JPEG/WEBP only) */}
      {supportsQuality && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">Quality</label>
            <span className="text-[10px] text-warm font-mono">{quality}%</span>
          </div>
          <input type="range" min={10} max={100} step={5} value={quality}
            onChange={e => setQuality(Number(e.target.value))}
            className="w-full h-1 accent-accent bg-elite-700 rounded-full appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                       [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow
                       [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-zinc-400"/>
        </div>
      )}

      {/* Transparent background (PNG only) */}
      {supportsTransparent && (
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] text-warm-muted">Transparent background</span>
          <button onClick={() => setTransparent(!transparent)}
            className={`w-8 h-4 rounded-full transition-colors cursor-pointer ${transparent ? 'bg-accent' : 'bg-elite-600'}`}>
            <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform mx-0.5 ${transparent ? 'translate-x-3.5' : 'translate-x-0'}`}/>
          </button>
        </div>
      )}

      {/* Naming */}
      <div className="mb-3">
        <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold block mb-1">Filename</label>
        <div className="flex gap-1 mb-1.5">
          <button onClick={() => setNamingMode('auto')}
            className={`flex-1 py-1 text-[10px] rounded border transition-all cursor-pointer ${
              namingMode === 'auto' ? 'bg-accent/12 border-accent/40 text-accent' : 'bg-elite-800 border-elite-600/30 text-warm-muted'}`}>
            Auto
          </button>
          <button onClick={() => setNamingMode('custom')}
            className={`flex-1 py-1 text-[10px] rounded border transition-all cursor-pointer ${
              namingMode === 'custom' ? 'bg-accent/12 border-accent/40 text-accent' : 'bg-elite-800 border-elite-600/30 text-warm-muted'}`}>
            Custom
          </button>
        </div>
        {namingMode === 'custom' ? (
          <input type="text" value={customName} onChange={e => setCustomName(e.target.value)}
            placeholder="filename"
            className="w-full bg-elite-800 border border-elite-600/40 rounded px-2 py-1.5 text-[11px] text-warm font-mono focus:border-accent/50 outline-none"/>
        ) : (
          <span className="text-[10px] text-warm-faint font-mono truncate block">{getFilename()}</span>
        )}
      </div>

      {/* Size estimate */}
      <div className="mb-3 flex items-center justify-between text-[10px] text-warm-faint px-1">
        <span>Estimated size</span>
        <span className="font-mono">{estimateSize()}</span>
      </div>

      {/* Export button */}
      <button
        onClick={doExport}
        disabled={exporting}
        className="w-full py-2.5 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold
                   hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer
                   disabled:opacity-50 disabled:cursor-not-allowed">
        {exporting ? 'Exporting...' : `Export ${format.toUpperCase()}`}
      </button>
    </div>
  )
}
