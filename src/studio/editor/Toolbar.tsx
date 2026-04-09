import { useState, useRef, useEffect } from 'react'
import type { RefObject } from 'react'
import { CANVAS_SIZES } from '../data/canvasSizes'
import { saveTemplate, updateTemplate, generateThumbnail } from '../data/templateStorage'
import { SaveIcon, FolderOpenIcon,
         DownloadIcon, ChevronDownIcon, MonitorIcon, GridIcon } from '../icons/Icons'
import type { CanvasHandle, CanvasSize } from '@/types/canvas'
import type { Template } from '@/types/domain'
import { ExportPanel } from './ExportPanel'
import type { ExportOptions } from './ExportPanel'

// ── Inline save-name dialog (replaces broken prompt() in Electron) ─────────────
interface SaveDialogProps {
  onConfirm: (name: string) => void
  onCancel: () => void
}

function SaveDialog({ onConfirm, onCancel }: SaveDialogProps): JSX.Element {
  const [name, setName] = useState('My Template')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])
  const submit = (): void => { if (name.trim()) onConfirm(name.trim()) }
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9999,
      background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center'
    }}>
      <div style={{
        background:'#1A1A1A', border:'1px solid #333', borderRadius:12,
        padding:'24px 28px', width:320, boxShadow:'0 20px 60px rgba(0,0,0,0.8)'
      }}>
        <p style={{fontSize:13,fontWeight:600,color:'#F0F0F0',marginBottom:16}}>
          Save as Template
        </p>
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if(e.key==='Enter') submit(); if(e.key==='Escape') onCancel() }}
          placeholder="Template name..."
          style={{
            width:'100%', padding:'9px 12px', background:'#111',
            border:'1px solid #333', borderRadius:8,
            color:'#F0F0F0', fontSize:13, outline:'none',
            boxSizing:'border-box', marginBottom:16,
            userSelect:'text',
          }}
        />
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={onCancel} style={{
            padding:'7px 16px', borderRadius:8, border:'1px solid #333',
            background:'transparent', color:'#888', fontSize:12, cursor:'pointer',
          }}>Cancel</button>
          <button onClick={submit} disabled={!name.trim()} style={{
            padding:'7px 16px', borderRadius:8, border:'none',
            background:'#0BDA76', color:'#000', fontSize:12,
            fontWeight:600, cursor: name.trim()?'pointer':'not-allowed',
            opacity: name.trim()?1:0.5,
          }}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ── Btn sub-component ──────────────────────────────────────────────────────────
interface BtnProps {
  icon: React.ReactNode
  label: string
  shortcut?: string
  onClick: () => void
  danger?: boolean
  accent?: boolean
  hasDropdown?: boolean
  disabled?: boolean
}

function Btn({ icon, label, shortcut, onClick, danger, accent, hasDropdown, disabled }: BtnProps): JSX.Element {
  return (
    <button onClick={onClick} disabled={disabled}
      title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium
        transition-all duration-150 cursor-pointer
        ${disabled ? 'opacity-40 cursor-not-allowed' :
          danger  ? 'text-red-400 hover:bg-red-500/10' :
          accent  ? 'text-accent hover:bg-accent/10' :
                    'text-warm-muted hover:bg-elite-700 hover:text-warm'}`}>
      {icon}<span className="hidden xl:inline">{label}</span>
      {hasDropdown && <ChevronDownIcon size={10}/>}
    </button>
  )
}

// ── ToolbarProps ───────────────────────────────────────────────────────────────
export interface ToolbarProps {
  canvasRef: RefObject<CanvasHandle | null>
  currentSize: CanvasSize
  onSizeChange: (width: number, height: number, fromPreset?: boolean) => void
  onTemplateSaved?: () => void
  loadedTemplateId?: Template['id'] | null
  onTemplateUpdated?: () => void
  autoFormat?: boolean
  onAutoFormatToggle?: (enabled: boolean) => void
  pageCount?: number
  onExportAllPages?: (opts: ExportOptions) => Promise<void>
}

export default function Toolbar({
  canvasRef,
  currentSize,
  onSizeChange,
  onTemplateSaved,
  loadedTemplateId,
  onTemplateUpdated,
  autoFormat = true,
  onAutoFormatToggle,
  pageCount = 1,
  onExportAllPages,
}: ToolbarProps): JSX.Element {
  const [showSize,    setShowSize]    = useState(false)
  const [showExport,  setShowExport]  = useState(false)
  const [showSave,    setShowSave]    = useState(false)
  const [showDialog,  setShowDialog]  = useState(false)
  const [saving,      setSaving]      = useState(false)
  const sizeRef   = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const saveRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent): void => {
      if (sizeRef.current   && !sizeRef.current.contains(e.target as Node))   setShowSize(false)
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExport(false)
      if (saveRef.current   && !saveRef.current.contains(e.target as Node))   setShowSave(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const getHandle = (): CanvasHandle | null => canvasRef.current

  const saveAsFile = (): void => {
    const h = getHandle(); if (!h) return
    try {
      const blob = new Blob([h.exportJSON()], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = 'template.json'; a.click()
    } catch(e) { console.error('Save as file failed:', e) }
  }

  const doSaveNew = async (name: string): Promise<void> => {
    setShowDialog(false)
    const h = getHandle(); if (!h) return
    const canvas = h.getCanvas(); if (!canvas) return
    setSaving(true)
    try {
      const thumbnail = generateThumbnail(canvas)
      await saveTemplate({
        name,
        canvas_json: h.exportJSON(),
        width:  currentSize.width,
        height: currentSize.height,
        thumbnail,
      })
      setShowSave(false)
      onTemplateSaved?.()
    } catch(e) {
      console.error('Template save failed:', e)
      alert(`Save failed: ${(e as Error).message}`)
    }
    setSaving(false)
  }

  const saveUpdateTemplate = async (): Promise<void> => {
    if (!loadedTemplateId) { setShowSave(false); setShowDialog(true); return }
    const h = getHandle(); if (!h) return
    const canvas = h.getCanvas(); if (!canvas) return
    setSaving(true)
    try {
      const thumbnail = generateThumbnail(canvas)
      const updated = await updateTemplate(loadedTemplateId, {
        canvas_json: h.exportJSON(),
        width:  currentSize.width,
        height: currentSize.height,
        thumbnail,
      })
      if (!updated) {
        // Template ID not found in DB (e.g. stale pre-migration ID) — save as new
        setShowSave(false)
        setShowDialog(true)
        setSaving(false)
        return
      }
      setShowSave(false)
      onTemplateUpdated?.()
    } catch(e) {
      console.error('Template update failed:', e)
    }
    setSaving(false)
  }

  const loadFromFile = (): void => {
    const h = getHandle(); if (!h) return
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try { h.importJSON(ev.target?.result as string) } catch {}
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const currentPreset = CANVAS_SIZES.find((s: { width: number; height: number }) =>
    s.width === currentSize.width && s.height === currentSize.height
  )

  return (
    <>
      {/* Inline save-name dialog */}
      {showDialog && (
        <SaveDialog
          onConfirm={doSaveNew}
          onCancel={() => setShowDialog(false)}
        />
      )}

      <div className="h-11 min-h-[44px] bg-elite-900/90 backdrop-blur-sm border-b border-elite-600/30
                      flex items-center px-3 gap-0.5 select-none relative z-[100]">

        {/* Auto-Format toggle */}
        <button
          onClick={() => onAutoFormatToggle?.(!autoFormat)}
          title={autoFormat ? 'Auto-Format ON — click to disable' : 'Auto-Format OFF — click to enable'}
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium
                      transition-all duration-150 cursor-pointer
                      ${autoFormat ? 'text-accent bg-accent/10' : 'text-warm-faint hover:bg-elite-700 hover:text-warm-muted'}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z"/>
          </svg>
          <span className="hidden xl:inline">Auto-Format</span>
        </button>
        {/* Run auto-format once manually */}
        <button
          onClick={() => getHandle()?.runAutoFormat?.()}
          title="Re-format layout now"
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium
                     text-warm-faint hover:bg-elite-700 hover:text-warm-muted transition-all cursor-pointer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
          </svg>
        </button>

        <div className="flex-1"/>

        {/* Canvas Size Picker */}
        <div ref={sizeRef} className="relative">
          <button onClick={() => setShowSize(!showSize)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium
                       text-warm-muted hover:bg-elite-700/60 transition-colors cursor-pointer">
            <MonitorIcon size={14}/>
            <span>{currentPreset?.label || `${currentSize.width}×${currentSize.height}`}</span>
            <ChevronDownIcon size={10}/>
          </button>
          {showSize && (
            <div className="dropdown-panel absolute right-0 top-full mt-1 w-72 max-h-[400px] overflow-y-auto py-1 z-[200]">
              {[...new Set(CANVAS_SIZES.map((s: { category?: string }) => s.category).filter((c): c is string => c !== undefined))].map((cat) => (
                <div key={cat}>
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-warm-faint
                                  uppercase tracking-wider">{cat}</div>
                  {CANVAS_SIZES.filter((s: { category?: string }) => s.category === cat).map((size: { id: string; width: number; height: number; label: string }) => {
                    const isActive = size.width === currentSize.width && size.height === currentSize.height
                    return (
                      <button key={size.id}
                        onClick={() => { onSizeChange(size.width, size.height, true); setShowSize(false) }}
                        className={`w-full flex items-center gap-3 px-3 py-1.5 text-xs
                          transition-colors cursor-pointer
                          ${isActive ? 'bg-accent/10 text-accent' : 'text-warm-muted hover:text-warm hover:bg-elite-700'}`}>
                        <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                          <div className={`border rounded-[2px] ${isActive ? 'border-accent' : 'border-warm-faint'}`}
                            style={{ width: Math.max(8, size.width/size.height*16),
                                     height: Math.max(8, size.height/size.width*16),
                                     maxWidth:20, maxHeight:20 }}/>
                        </div>
                        <span className="flex-1 text-left">{size.label}</span>
                        <span className="text-[10px] text-warm-faint font-mono">
                          {size.width}×{size.height}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1"/>
        <div className="w-px h-5 bg-elite-600/40 mx-1"/>

        <Btn icon={<FolderOpenIcon size={14}/>} label="Open"  onClick={loadFromFile}/>
        <Btn icon={<SaveIcon size={14}/>}       label="Save"  shortcut="⌘S" onClick={saveAsFile}/>

        {/* Template save dropdown */}
        <div ref={saveRef} className="relative">
          <button onClick={() => setShowSave(!showSave)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium
                       text-warm-muted hover:bg-elite-700 hover:text-warm transition-all cursor-pointer">
            <GridIcon size={14}/>
            <span className="hidden xl:inline">{saving ? 'Saving…' : 'Template'}</span>
            <ChevronDownIcon size={10}/>
          </button>
          {showSave && (
            <div className="dropdown-panel absolute right-0 top-full mt-1 w-56 py-1 z-[200]">
              <button onClick={() => { setShowSave(false); setShowDialog(true) }}
                className="w-full text-left px-3 py-2 text-xs text-warm-muted
                           hover:text-warm hover:bg-elite-700 transition-colors cursor-pointer">
                <p className="font-medium">Save as New Template</p>
                <p className="text-[10px] text-warm-faint mt-0.5">Creates a new entry in gallery</p>
              </button>
              {loadedTemplateId && (
                <>
                  <div className="mx-3 my-1 border-t border-elite-600/30"/>
                  <button onClick={saveUpdateTemplate}
                    className="w-full text-left px-3 py-2 text-xs text-accent
                               hover:bg-accent/10 transition-colors cursor-pointer">
                    <p className="font-medium">Update Current Template</p>
                    <p className="text-[10px] text-accent/60 mt-0.5">Overwrites the template you loaded</p>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Export panel */}
        <div ref={exportRef} className="relative">
          <Btn icon={<DownloadIcon size={14}/>} label="Export" accent hasDropdown
               onClick={() => setShowExport(!showExport)}/>
          {showExport && (
            <ExportPanel
              canvas={getHandle()?.getCanvas() ?? null}
              canvasRef={canvasRef}
              canvasWidth={currentSize.width}
              canvasHeight={currentSize.height}
              pageCount={pageCount}
              onClose={() => setShowExport(false)}
              onExportAllPages={onExportAllPages}
            />
          )}
        </div>
      </div>
    </>
  )
}
