/**
 * ExportPanel.tsx — Multi-format export with scope control.
 * Supports PNG, JPEG, WEBP, SVG with proper file size calculation.
 * Scope: Current Page or All Pages (with selective pick).
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { RefObject } from 'react'
import type { Canvas as FabricCanvas } from 'fabric'
import type { CanvasHandle } from '@/types/canvas'

export interface ExportPanelProps {
  canvas: FabricCanvas | null
  canvasRef: RefObject<CanvasHandle | null>
  canvasWidth: number
  canvasHeight: number
  pageCount?: number
  onClose: () => void
  /** Called when user wants to export all pages — parent handles page switching + capture */
  onExportAllPages?: (opts: { format: ExportFormat; scale: number; quality: number; transparent: boolean; selectedPages?: number[] }) => void
}

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'svg'
type ExportScope = 'page' | 'all-pages'
type NamingMode = 'auto' | 'custom'

const FORMAT_OPTIONS: { id: ExportFormat; label: string; ext: string }[] = [
  { id: 'png',  label: 'PNG',  ext: '.png' },
  { id: 'jpeg', label: 'JPEG', ext: '.jpg' },
  { id: 'webp', label: 'WebP', ext: '.webp' },
  { id: 'svg',  label: 'SVG',  ext: '.svg' },
]

const SCALE_OPTIONS = [1, 2, 3, 4] as const

export function ExportPanel({
  canvas, canvasWidth, canvasHeight,
  pageCount = 1, onClose, onExportAllPages,
}: ExportPanelProps): JSX.Element {
  const [format, setFormat]       = useState<ExportFormat>('png')
  const [scale, setScale]         = useState(2)
  const [quality, setQuality]     = useState(90)
  const [scope, setScope]         = useState<ExportScope>('page')
  const [transparent, setTransparent] = useState(false)
  const [namingMode, setNamingMode] = useState<NamingMode>('auto')
  const [customName, setCustomName] = useState('design')
  const [exporting, setExporting] = useState(false)
  const [actualSize, setActualSize] = useState<string | null>(null)
  // For "all pages" — let user pick which pages to export
  const [selectedPages, setSelectedPages] = useState<Set<number>>(() => {
    const all = new Set<number>()
    for (let i = 0; i < pageCount; i++) all.add(i)
    return all
  })
  const panelRef = useRef<HTMLDivElement>(null)

  const outputW = canvasWidth * scale
  const outputH = canvasHeight * scale

  // Update selected pages when pageCount changes
  useEffect(() => {
    const all = new Set<number>()
    for (let i = 0; i < pageCount; i++) all.add(i)
    setSelectedPages(all)
  }, [pageCount])

  // Calculate real file size by generating a small preview
  useEffect(() => {
    if (!canvas) { setActualSize(null); return }
    setActualSize(null) // reset while calculating

    const timer = setTimeout(() => {
      try {
        const c = canvas
        // Generate at 0.5x to estimate quickly
        const previewScale = Math.min(scale, 1)
        const fabricFormat = format === 'webp' ? 'png' : format === 'svg' ? 'png' : format
        const dataUrl = c.toDataURL({
          format: fabricFormat,
          quality: format === 'jpeg' ? quality / 100 : 1,
          multiplier: previewScale,
        })

        // Calculate actual bytes from base64
        const base64Len = dataUrl.split(',')[1]?.length || 0
        const bytes = Math.round((base64Len * 3) / 4)
        // Scale up proportionally from preview to actual
        const scaleFactor = (scale / previewScale) ** 2
        const estimatedBytes = Math.round(bytes * scaleFactor)

        if (estimatedBytes > 1024 * 1024) {
          setActualSize(`~${(estimatedBytes / (1024 * 1024)).toFixed(1)} MB`)
        } else {
          setActualSize(`~${Math.round(estimatedBytes / 1024)} KB`)
        }
      } catch {
        setActualSize(null)
      }
    }, 200) // debounce

    return () => clearTimeout(timer)
  }, [canvas, format, scale, quality, transparent])

  const getFilename = (pageIdx?: number): string => {
    const base = namingMode === 'custom' ? customName : `design_${canvasWidth}x${canvasHeight}`
    const scaleSuffix = scale > 1 ? `_${scale}x` : ''
    const pageSuffix = pageIdx !== undefined ? `_p${pageIdx + 1}` : ''
    const ext = FORMAT_OPTIONS.find(f => f.id === format)?.ext || '.png'
    return `${base}${pageSuffix}${scaleSuffix}${ext}`
  }

  const downloadDataUrl = (dataUrl: string, filename: string): void => {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = filename
    a.click()
  }

  const downloadBlob = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportCurrentPage = useCallback(async () => {
    if (!canvas) return
    const c = canvas
    const filename = getFilename()

    if (format === 'svg') {
      const svg = c.toSVG()
      downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), filename)
      return
    }

    // Raster: PNG, JPEG, WEBP
    const origBg = c.backgroundColor
    if (transparent && format === 'png') {
      c.backgroundColor = undefined as unknown as string
      c.renderAll()
    }

    const dataUrl = c.toDataURL({
      format: format === 'webp' ? 'png' : format,
      quality: format === 'jpeg' ? quality / 100 : 1,
      multiplier: scale,
    })

    if (transparent && format === 'png') {
      c.backgroundColor = origBg
      c.renderAll()
    }

    if (format === 'webp') {
      // Convert via offscreen canvas
      const img = new Image()
      img.onload = () => {
        const off = document.createElement('canvas')
        off.width = img.width; off.height = img.height
        const ctx = off.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        off.toBlob(blob => {
          if (blob) downloadBlob(blob, filename)
        }, 'image/webp', quality / 100)
      }
      img.src = dataUrl
    } else {
      downloadDataUrl(dataUrl, filename)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, format, scale, quality, transparent, namingMode, customName, canvasWidth, canvasHeight])

  const doExport = useCallback(async () => {
    setExporting(true)
    try {
      if (scope === 'all-pages' && onExportAllPages) {
        onExportAllPages({
          format, scale, quality, transparent,
          selectedPages: [...selectedPages].sort(),
        })
      } else {
        await exportCurrentPage()
      }
    } catch (err) {
      console.error('[ExportPanel] Export failed:', err)
    } finally {
      setExporting(false)
      onClose()
    }
  }, [scope, onExportAllPages, format, scale, quality, transparent, selectedPages, exportCurrentPage, onClose])

  const supportsQuality = format === 'jpeg' || format === 'webp'
  const supportsTransparent = format === 'png'
  const supportsScale = format !== 'svg'

  const togglePage = (idx: number): void => {
    setSelectedPages(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const toggleAllPages = (): void => {
    if (selectedPages.size === pageCount) {
      setSelectedPages(new Set())
    } else {
      const all = new Set<number>()
      for (let i = 0; i < pageCount; i++) all.add(i)
      setSelectedPages(all)
    }
  }

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
          <button
            onClick={() => setScope('page')}
            className={`flex-1 py-1.5 text-[11px] rounded-md border transition-all cursor-pointer ${
              scope === 'page'
                ? 'bg-accent/12 border-accent/40 text-accent font-medium'
                : 'bg-elite-800 border-elite-600/30 text-warm-muted hover:border-accent/30'
            }`}>
            Current Page
          </button>
          {pageCount > 1 && (
            <button
              onClick={() => setScope('all-pages')}
              className={`flex-1 py-1.5 text-[11px] rounded-md border transition-all cursor-pointer ${
                scope === 'all-pages'
                  ? 'bg-accent/12 border-accent/40 text-accent font-medium'
                  : 'bg-elite-800 border-elite-600/30 text-warm-muted hover:border-accent/30'
              }`}>
              All Pages ({pageCount})
            </button>
          )}
        </div>
      </div>

      {/* Page picker (when scope=all-pages) */}
      {scope === 'all-pages' && pageCount > 1 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">Select Pages</label>
            <button onClick={toggleAllPages}
              className="text-[10px] text-accent hover:text-accent/80 cursor-pointer transition-colors">
              {selectedPages.size === pageCount ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1.5 max-h-[100px] overflow-y-auto">
            {Array.from({ length: pageCount }, (_, i) => (
              <button key={i}
                onClick={() => togglePage(i)}
                className={`py-1 text-[11px] rounded border transition-all cursor-pointer ${
                  selectedPages.has(i)
                    ? 'bg-accent/15 border-accent/40 text-accent font-medium'
                    : 'bg-elite-800 border-elite-600/30 text-warm-faint hover:border-accent/30'
                }`}>
                {i + 1}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-warm-faint mt-1 block">
            {selectedPages.size} of {pageCount} pages selected
          </span>
        </div>
      )}

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

      {/* Quality (JPEG/WEBP) */}
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

      {/* Size estimate — based on actual canvas data */}
      <div className="mb-3 flex items-center justify-between text-[10px] text-warm-faint px-1">
        <span>Estimated size</span>
        <span className="font-mono">{actualSize ?? 'Calculating...'}</span>
      </div>

      {/* Export button */}
      <button
        onClick={doExport}
        disabled={exporting || (scope === 'all-pages' && selectedPages.size === 0)}
        className="w-full py-2.5 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold
                   hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer
                   disabled:opacity-50 disabled:cursor-not-allowed">
        {exporting
          ? 'Exporting...'
          : scope === 'all-pages'
            ? `Export ${selectedPages.size} Page${selectedPages.size !== 1 ? 's' : ''} as ${format.toUpperCase()}`
            : `Export ${format.toUpperCase()}`
        }
      </button>
    </div>
  )
}
