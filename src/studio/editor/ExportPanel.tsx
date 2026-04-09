/**
 * ExportPanel.tsx — Canva-grade export panel.
 *
 * Scope:  Current Page  |  All Pages (with individual page toggle)
 * Format: PNG (lossless) | JPEG | WebP | SVG
 * Scale:  1x / 2x / 3x / 4x  (raster only)
 * Output: single file (current page) or ZIP archive (multi-page)
 *
 * The parent (DesignStudio) owns the actual multi-page capture loop —
 * this panel just collects settings and fires onExportAllPages / onExportCurrentPage.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { RefObject } from 'react'
import type { Canvas as FabricCanvas } from 'fabric'
import type { CanvasHandle } from '@/types/canvas'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'svg'
type ExportScope   = 'page' | 'all-pages'
type NamingMode    = 'auto' | 'custom'

export interface ExportOptions {
  format:        ExportFormat
  scale:         number
  quality:       number   // 1-100; only relevant for jpeg/webp
  transparent:   boolean  // png only
  selectedPages: number[] // indices; empty = none; all present = all pages
}

export interface ExportPanelProps {
  canvas:       FabricCanvas | null
  canvasRef:    RefObject<CanvasHandle | null>
  canvasWidth:  number
  canvasHeight: number
  pageCount?:   number
  onClose:      () => void
  /**
   * Parent-implemented: switch each page, capture it, bundle & ZIP.
   * Panel calls this when scope=all-pages and user hits Export.
   */
  onExportAllPages?: (opts: ExportOptions) => Promise<void>
}

// ─── Constants ─────────────────────────────────────────────────────────────

const FORMAT_OPTIONS: { id: ExportFormat; label: string; ext: string }[] = [
  { id: 'png',  label: 'PNG',  ext: '.png'  },
  { id: 'jpeg', label: 'JPEG', ext: '.jpg'  },
  { id: 'webp', label: 'WebP', ext: '.webp' },
  { id: 'svg',  label: 'SVG',  ext: '.svg'  },
]

const SCALE_OPTIONS = [1, 2, 3, 4] as const

// ─── Helpers ───────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl; a.download = filename; a.click()
}

/** Capture current Fabric canvas to a Blob. PNG = always lossless (quality=1). */
export async function captureCanvasBlob(
  canvas: FabricCanvas,
  format: ExportFormat,
  scale: number,
  quality: number,   // 1-100
  transparent: boolean,
): Promise<Blob> {
  if (format === 'svg') {
    const svg = canvas.toSVG()
    return new Blob([svg], { type: 'image/svg+xml' })
  }

  const origBg = canvas.backgroundColor
  if (transparent && format === 'png') {
    canvas.backgroundColor = '' as string
    canvas.renderAll()
  }

  // PNG is always exported at full quality (multiplier only affects resolution)
  const fabricFormat = format === 'webp' ? 'png' : format as 'png' | 'jpeg'
  const dataUrl = canvas.toDataURL({
    format:     fabricFormat,
    quality:    format === 'jpeg' ? quality / 100 : 1,
    multiplier: scale,
  })

  if (transparent && format === 'png') {
    canvas.backgroundColor = origBg
    canvas.renderAll()
  }

  // PNG/JPEG — convert dataURL to blob directly
  if (format !== 'webp') {
    const res  = await fetch(dataUrl)
    return res.blob()
  }

  // WebP — convert via offscreen canvas
  return new Promise<Blob>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const off = document.createElement('canvas')
      off.width = img.width; off.height = img.height
      const ctx = off.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      off.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('WebP conversion failed'))
      }, 'image/webp', quality / 100)
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExportPanel({
  canvas, canvasWidth, canvasHeight,
  pageCount = 1, onClose, onExportAllPages,
}: ExportPanelProps): JSX.Element {

  const [format,      setFormat]      = useState<ExportFormat>('png')
  const [scale,       setScale]       = useState(2)
  const [quality,     setQuality]     = useState(90)
  const [scope,       setScope]       = useState<ExportScope>('page')
  const [transparent, setTransparent] = useState(false)
  const [namingMode,  setNamingMode]  = useState<NamingMode>('auto')
  const [customName,  setCustomName]  = useState('design')
  const [exporting,   setExporting]   = useState(false)
  const [progress,    setProgress]    = useState<{ done: number; total: number } | null>(null)
  const [actualSize,  setActualSize]  = useState<string | null>(null)

  // Page selection (for all-pages scope)
  const [selectedPages, setSelectedPages] = useState<Set<number>>(() => {
    const all = new Set<number>()
    for (let i = 0; i < pageCount; i++) all.add(i)
    return all
  })

  const panelRef   = useRef<HTMLDivElement>(null)
  const abortRef   = useRef(false)

  const outputW = canvasWidth  * scale
  const outputH = canvasHeight * scale

  // Sync selected pages when pageCount changes
  useEffect(() => {
    const all = new Set<number>()
    for (let i = 0; i < pageCount; i++) all.add(i)
    setSelectedPages(all)
  }, [pageCount])

  // Estimate file size from live canvas
  useEffect(() => {
    if (!canvas) { setActualSize(null); return }
    setActualSize(null)
    const timer = setTimeout(() => {
      try {
        const previewScale = Math.min(scale, 1)
        const fabricFormat = format === 'webp' || format === 'svg' ? 'png' : format as 'png' | 'jpeg'
        const dataUrl = canvas.toDataURL({
          format:     fabricFormat,
          quality:    format === 'jpeg' ? quality / 100 : 1,
          multiplier: previewScale,
        })
        const base64Len     = dataUrl.split(',')[1]?.length || 0
        const bytes         = Math.round((base64Len * 3) / 4)
        const scaleFactor   = (scale / previewScale) ** 2
        const estimatedByes = Math.round(bytes * scaleFactor)
        if (estimatedByes > 1024 * 1024) {
          setActualSize(`~${(estimatedByes / (1024 * 1024)).toFixed(1)} MB`)
        } else {
          setActualSize(`~${Math.round(estimatedByes / 1024)} KB`)
        }
      } catch { setActualSize(null) }
    }, 200)
    return () => clearTimeout(timer)
  }, [canvas, format, scale, quality, transparent])

  const getFilename = (pageIdx?: number): string => {
    const base       = namingMode === 'custom' ? customName : `design_${canvasWidth}x${canvasHeight}`
    const scaleSuffix = scale > 1 ? `_${scale}x` : ''
    const pageSuffix  = pageIdx !== undefined ? `_p${pageIdx + 1}` : ''
    const ext         = FORMAT_OPTIONS.find(f => f.id === format)?.ext || '.png'
    return `${base}${pageSuffix}${scaleSuffix}${ext}`
  }

  // ─── Export current single page ─────────────────────────────

  const exportCurrentPage = useCallback(async (): Promise<void> => {
    if (!canvas) return
    try {
      const blob     = await captureCanvasBlob(canvas, format, scale, quality, transparent)
      const filename = getFilename()
      downloadBlob(blob, filename)
    } catch (err) {
      console.error('[ExportPanel] exportCurrentPage failed:', err)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, format, scale, quality, transparent, namingMode, customName, canvasWidth, canvasHeight])

  // ─── Toggle helpers ─────────────────────────────────────────

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

  // ─── Main export handler ────────────────────────────────────

  const doExport = useCallback(async (): Promise<void> => {
    abortRef.current = false
    setExporting(true)
    setProgress(null)

    try {
      if (scope === 'all-pages') {
        const selected = [...selectedPages].sort((a, b) => a - b)
        if (!selected.length) return
        setProgress({ done: 0, total: selected.length })

        if (onExportAllPages) {
          // Parent owns the multi-page capture loop (has access to all canvasJSONs)
          await onExportAllPages({
            format, scale, quality, transparent,
            selectedPages: selected,
          })
        }
        // If parent didn't handle it, we can't do it here (no canvasJSON access)
      } else {
        await exportCurrentPage()
      }
    } catch (err) {
      console.error('[ExportPanel] Export failed:', err)
    } finally {
      setExporting(false)
      setProgress(null)
      onClose()
    }
  }, [scope, selectedPages, onExportAllPages, format, scale, quality, transparent, exportCurrentPage, onClose])

  // ─── Derived ────────────────────────────────────────────────

  const supportsQuality     = format === 'jpeg' || format === 'webp'
  const supportsTransparent = format === 'png'
  const supportsScale       = format !== 'svg'
  const canExport           = !exporting && (scope === 'page' || selectedPages.size > 0)

  const exportLabel = (): string => {
    if (exporting && progress) return `Capturing ${progress.done + 1}/${progress.total} pages…`
    if (exporting) return 'Exporting…'
    if (scope === 'all-pages') {
      const n = selectedPages.size
      return `Export ${n} Page${n !== 1 ? 's' : ''} as ${format.toUpperCase()}`
    }
    return `Export ${format.toUpperCase()}`
  }

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div ref={panelRef}
      className="absolute right-0 top-full mt-1 z-[200] w-[288px] dropdown-panel"
      style={{ padding: '16px 18px 18px' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {/* Download icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <h4 className="text-[13px] font-semibold text-warm">Export</h4>
        </div>
        <button onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded-md text-warm-faint
                     hover:text-warm layer-row-hover transition-colors cursor-pointer text-[16px] leading-none">
          &times;
        </button>
      </div>

      {/* ── Scope ── */}
      <div className="mb-4">
        <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold block mb-1.5">
          Export scope
        </label>
        <div className="flex gap-1.5 p-1 rounded-lg" style={{ background: 'var(--surface-3)' }}>
          <button
            onClick={() => setScope('page')}
            className={`flex-1 py-1.5 text-[11px] rounded-md transition-all cursor-pointer font-medium ${
              scope === 'page'
                ? 'bg-accent text-accent-fg shadow-sm'
                : 'text-warm-muted hover:text-warm'
            }`}>
            Current Page
          </button>
          {pageCount > 1 && (
            <button
              onClick={() => setScope('all-pages')}
              className={`flex-1 py-1.5 text-[11px] rounded-md transition-all cursor-pointer font-medium ${
                scope === 'all-pages'
                  ? 'bg-accent text-accent-fg shadow-sm'
                  : 'text-warm-muted hover:text-warm'
              }`}>
              All Pages ({pageCount})
            </button>
          )}
        </div>
      </div>

      {/* ── Page picker (all-pages scope) ── */}
      {scope === 'all-pages' && pageCount > 1 && (
        <div className="mb-4 rounded-lg overflow-hidden"
             style={{ border: '1px solid var(--border-subtle)', background: 'var(--surface-0)' }}>
          <div className="flex items-center justify-between px-3 py-2"
               style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">
              Pages to export
            </label>
            <button onClick={toggleAllPages}
              className="text-[10px] text-accent hover:text-accent/80 cursor-pointer transition-colors font-medium">
              {selectedPages.size === pageCount ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="p-2.5 grid grid-cols-5 gap-1.5 max-h-[108px] overflow-y-auto">
            {Array.from({ length: pageCount }, (_, i) => (
              <button key={i}
                onClick={() => togglePage(i)}
                className={`py-1.5 text-[11px] rounded-md border transition-all cursor-pointer font-medium ${
                  selectedPages.has(i)
                    ? 'bg-accent/15 border-accent/50 text-accent'
                    : 'border-transparent text-warm-faint hover:border-accent/30 hover:text-warm-muted'
                }`}
                style={{ background: selectedPages.has(i) ? undefined : 'var(--surface-3)' }}>
                {i + 1}
              </button>
            ))}
          </div>
          <div className="px-3 py-1.5 text-[10px] text-warm-faint"
               style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {selectedPages.size} of {pageCount} selected
            {scope === 'all-pages' && selectedPages.size > 1 && (
              <span className="ml-1 text-accent/70">• {selectedPages.size} files</span>
            )}
          </div>
        </div>
      )}

      {/* ── Divider ── */}
      <div className="mb-4" style={{ height: 1, background: 'var(--border-subtle)' }}/>

      {/* ── Format ── */}
      <div className="mb-3">
        <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold block mb-1.5">
          Format
        </label>
        <div className="flex gap-1">
          {FORMAT_OPTIONS.map(opt => (
            <button key={opt.id}
              onClick={() => setFormat(opt.id)}
              className={`flex-1 py-2 text-[11px] rounded-md border transition-all cursor-pointer font-medium ${
                format === opt.id
                  ? 'bg-accent/15 border-accent/50 text-accent'
                  : 'bg-elite-800/50 border-elite-600/20 text-warm-muted hover:border-accent/30 hover:text-warm'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
        {format === 'png' && (
          <p className="text-[9px] text-accent/70 mt-1 font-medium">✓ Lossless — no quality reduction</p>
        )}
      </div>

      {/* ── Scale ── */}
      {supportsScale && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">Scale</label>
            <span className="text-[10px] text-warm-faint font-mono">{outputW} × {outputH} px</span>
          </div>
          <div className="flex gap-1">
            {SCALE_OPTIONS.map(s => (
              <button key={s}
                onClick={() => setScale(s)}
                className={`flex-1 py-2 text-[11px] rounded-md border transition-all cursor-pointer font-medium ${
                  scale === s
                    ? 'bg-accent/15 border-accent/50 text-accent'
                    : 'bg-elite-800/50 border-elite-600/20 text-warm-muted hover:border-accent/30 hover:text-warm'
                }`}>
                {s}×
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Quality (JPEG/WebP only) ── */}
      {supportsQuality && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold">Quality</label>
            <span className="text-[11px] text-warm font-mono font-semibold">{quality}%</span>
          </div>
          <input type="range" min={10} max={100} step={5} value={quality}
            onChange={e => setQuality(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: 'var(--accent)', background: `linear-gradient(to right, var(--accent) ${quality}%, var(--surface-3) ${quality}%)` }}
          />
        </div>
      )}

      {/* ── Transparent background (PNG only) ── */}
      {supportsTransparent && (
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] text-warm-muted">Transparent background</span>
          <button onClick={() => setTransparent(!transparent)}
            className="relative w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0"
            style={{ background: transparent ? 'var(--accent)' : 'var(--surface-4)' }}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
              transparent ? 'translate-x-4' : 'translate-x-0.5'
            }`}/>
          </button>
        </div>
      )}

      {/* ── Filename ── */}
      <div className="mb-4">
        <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold block mb-1.5">
          Filename
        </label>
        <div className="flex gap-1 mb-2">
          <button onClick={() => setNamingMode('auto')}
            className={`flex-1 py-1.5 text-[10px] rounded-md border transition-all cursor-pointer font-medium ${
              namingMode === 'auto'
                ? 'bg-accent/12 border-accent/40 text-accent'
                : 'bg-elite-800/50 border-elite-600/20 text-warm-muted hover:border-accent/30'
            }`}>
            Auto
          </button>
          <button onClick={() => setNamingMode('custom')}
            className={`flex-1 py-1.5 text-[10px] rounded-md border transition-all cursor-pointer font-medium ${
              namingMode === 'custom'
                ? 'bg-accent/12 border-accent/40 text-accent'
                : 'bg-elite-800/50 border-elite-600/20 text-warm-muted hover:border-accent/30'
            }`}>
            Custom
          </button>
        </div>
        {namingMode === 'custom' ? (
          <input type="text" value={customName} onChange={e => setCustomName(e.target.value)}
            placeholder="filename"
            className="w-full rounded-md px-2.5 py-1.5 text-[11px] text-warm font-mono
                       outline-none transition-colors"
            style={{
              background: 'var(--surface-0)',
              border: '1px solid var(--border-default)',
            }}
            onFocus={e => (e.target.style.borderColor = 'rgba(var(--accent-rgb),0.5)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
          />
        ) : (
          <span className="text-[10px] text-warm-faint font-mono truncate block px-0.5">
            {getFilename(scope === 'all-pages' && pageCount > 1 ? 0 : undefined)}
            {scope === 'all-pages' && pageCount > 1 && <span className="text-warm-faint/60"> …</span>}
          </span>
        )}
      </div>

      {/* ── Size estimate ── */}
      <div className="mb-4 flex items-center justify-between text-[10px] text-warm-faint px-0.5">
        <span>Estimated size</span>
        <span className="font-mono">{actualSize ?? '…'}</span>
      </div>

      {/* ── Progress bar (during export) ── */}
      {exporting && progress && (
        <div className="mb-3">
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width:      `${(progress.done / progress.total) * 100}%`,
                background: 'var(--accent)',
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-warm-faint">
              Exporting page {progress.done + 1} of {progress.total}…
            </span>
            <span className="text-[10px] text-accent font-mono">
              {Math.round((progress.done / progress.total) * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* ── Export button ── */}
      <button
        onClick={doExport}
        disabled={!canExport}
        className="w-full py-2.5 rounded-xl text-[12px] font-semibold transition-all cursor-pointer
                   disabled:opacity-40 disabled:cursor-not-allowed
                   hover:brightness-110 active:scale-[0.98]"
        style={{
          background: canExport
            ? 'var(--accent)'
            : 'var(--surface-3)',
          color: canExport ? 'var(--accent-fg, #000)' : 'var(--text-tertiary)',
          boxShadow: canExport ? '0 4px 16px rgba(var(--accent-rgb, 11,218,118),0.35)' : 'none',
        }}>
        {exportLabel()}
      </button>

      <p className="text-center text-[9px] text-warm-faint/60 mt-2">
        {scope === 'all-pages' && selectedPages.size > 1
          ? `${selectedPages.size} files download individually — like Figma`
          : 'File downloads immediately to your Downloads folder'}
      </p>
    </div>
  )
}
