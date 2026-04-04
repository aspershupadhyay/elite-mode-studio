/**
 * event-bindings.ts — Wire Fabric.Canvas event listeners for selection,
 * snap guides, frame drag, text editing, and context menu.
 *
 * Returns a cleanup function that removes all listeners.
 */

import type { Canvas, FabricObject } from 'fabric'
import type { RulerGuideSet } from '@/types/canvas'

export interface CanvasEventOptions {
  onSelectionChange: (obj: FabricObject | null) => void
  onHistoryChange: () => void
  onContextMenu?: (x: number, y: number) => void
  onGuidesChange?: (data: Record<string, unknown> | null) => void
  onPanChange?: (pan: { x: number; y: number }) => void
  onZoomChange?: (zoom: number) => void
  rulerGuidesRef: { current: RulerGuideSet }
  zoomRef: { current: number }
  canvasElRef: { current: HTMLCanvasElement | null }
  containerRef: { current: HTMLDivElement | null }
  saveHistory: () => void
  addImageFromFile: (file: File) => void
  loadFileIntoFrame: (frame: FabricObject, file: File, cb: () => void) => void
  findFrameAtPoint: (canvas: Canvas, x: number, y: number) => FabricObject | null
  highlightFrame: (frame: FabricObject, accent: string) => void
  clearFrameHighlight: (frame: FabricObject) => void
  applyImageToFrame: (frame: FabricObject, imgEl: HTMLImageElement) => void
  findSnaps: (obj: FabricObject, canvas: Canvas, guides: RulerGuideSet) => Record<string, unknown>
  applySnap: (obj: FabricObject, snaps: Record<string, unknown>) => void
  buildResizeGuides: (obj: FabricObject) => Record<string, unknown>
  syncFrameImageLayer: (frame: FabricObject | null) => void
  accentRef: { current: string }
  dragOverFrameRef: { current: FabricObject | null }
  canvasImgDragFrameRef: { current: FabricObject | null }
}

export function registerCanvasEvents(
  canvas: Canvas,
  opts: CanvasEventOptions,
): () => void {
  const {
    onSelectionChange, onHistoryChange, onContextMenu, onGuidesChange,
    rulerGuidesRef, canvasElRef, containerRef, saveHistory,
    addImageFromFile, loadFileIntoFrame, findFrameAtPoint,
    highlightFrame, clearFrameHighlight, applyImageToFrame,
    findSnaps, applySnap, buildResizeGuides, syncFrameImageLayer,
    accentRef, dragOverFrameRef, canvasImgDragFrameRef,
  } = opts

  // Selection events
  const onSelCreated = (e: { selected?: FabricObject[] }): void => onSelectionChange(e.selected?.[0] ?? null)
  const onSelUpdated = (e: { selected?: FabricObject[] }): void => onSelectionChange(e.selected?.[0] ?? null)
  const onSelCleared = (): void => onSelectionChange(null)
  const onObjModified = (e: { target?: FabricObject }): void => {
    if (e.target) onSelectionChange(e.target)
    saveHistory()
  }

  canvas.on('selection:created', onSelCreated)
  canvas.on('selection:updated', onSelUpdated)
  canvas.on('selection:cleared', onSelCleared)
  canvas.on('object:modified',   onObjModified)

  // Frame sync on transform
  const onMoving   = (e: { target?: FabricObject }): void => { if (e.target) syncFrameImageLayer(e.target) }
  const onScaling  = (e: { target?: FabricObject }): void => { if (e.target) syncFrameImageLayer(e.target) }
  const onRotating = (e: { target?: FabricObject }): void => { if (e.target) syncFrameImageLayer(e.target) }

  canvas.on('object:moving',   onMoving)
  canvas.on('object:scaling',  onScaling)
  canvas.on('object:rotating', onRotating)

  // Canvas-image → frame highlight during drag
  const onMovingImgFrame = (e: { target?: FabricObject }): void => {
    const obj = e.target
    if (obj?.eliteType !== 'image') {
      if (canvasImgDragFrameRef.current) {
        clearFrameHighlight(canvasImgDragFrameRef.current)
        canvasImgDragFrameRef.current = null
        canvas.renderAll()
      }
      return
    }
    const center = obj.getCenterPoint()
    const frame  = findFrameAtPoint(canvas, center.x, center.y)
    if (frame !== canvasImgDragFrameRef.current) {
      if (canvasImgDragFrameRef.current) clearFrameHighlight(canvasImgDragFrameRef.current)
      if (frame) highlightFrame(frame, accentRef.current)
      canvasImgDragFrameRef.current = frame
      canvas.renderAll()
    }
  }
  canvas.on('object:moving', onMovingImgFrame)

  // Smart snap guides
  const onMovingSnap = (e: { target?: FabricObject }): void => {
    if (!e.target) return
    const snaps = findSnaps(e.target, canvas, rulerGuidesRef.current)
    applySnap(e.target, snaps)
    if (onGuidesChange && containerRef.current && canvasElRef.current) {
      const cRect = canvasElRef.current.getBoundingClientRect()
      const pRect = containerRef.current.getBoundingClientRect()
      onGuidesChange({ ...snaps, _originX: cRect.left - pRect.left, _originY: cRect.top - pRect.top })
    }
  }
  canvas.on('object:moving', onMovingSnap)

  // Resize guides
  const onScalingGuide = (e: { target?: FabricObject }): void => {
    if (!e.target || !onGuidesChange || !containerRef.current || !canvasElRef.current) return
    const cRect = canvasElRef.current.getBoundingClientRect()
    const pRect = containerRef.current.getBoundingClientRect()
    onGuidesChange({ ...buildResizeGuides(e.target), _originX: cRect.left - pRect.left, _originY: cRect.top - pRect.top })
  }
  canvas.on('object:scaling', onScalingGuide)

  // Mouse:up — clear guides + canvas-image → frame drop
  const onMouseUp = (): void => {
    onGuidesChange?.(null)
    const targetFrame = canvasImgDragFrameRef.current
    if (targetFrame) {
      clearFrameHighlight(targetFrame)
      canvasImgDragFrameRef.current = null
      const active = canvas.getActiveObject()
      if (active?.eliteType === 'image') {
        const imgEl = (active.fill instanceof (canvas.constructor as unknown as { Pattern: { new(o: unknown): unknown } }).constructor
          ? null
          : null) // resolved below via pattern check
        // Resolve HTMLImageElement from Pattern or FabricImage
        const patternSource = (active.fill as { source?: HTMLImageElement } | undefined)?.source
        const resolvedImg: HTMLImageElement | null = patternSource instanceof HTMLImageElement
          ? patternSource
          : (active as FabricObject & { getElement?: () => HTMLImageElement }).getElement?.() ?? null
        if (resolvedImg) {
          applyImageToFrame(targetFrame, resolvedImg)
          canvas.remove(active)
          canvas.setActiveObject(targetFrame)
          canvas.renderAll()
          saveHistory()
        }
      }
      canvas.renderAll()
    }
  }
  canvas.on('mouse:up', onMouseUp)

  // Context menu (right-click)
  const onMouseDown = (opt: unknown): void => {
    const e = (opt as { e?: MouseEvent }).e
    if (e?.button === 2 && onContextMenu) {
      e.preventDefault(); e.stopPropagation()
      onContextMenu(e.clientX, e.clientY)
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canvas.on('mouse:down', onMouseDown as any)

  // Double-click image area OR frame → open file picker
  const onDblClick = (opt: { target?: FabricObject }): void => {
    const target = opt.target
    if (!target) return
    if (target.eliteType === 'frame') {
      const input = document.createElement('input')
      input.type = 'file'; input.accept = 'image/*'
      input.onchange = (e): void => {
        const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return
        loadFileIntoFrame(target, f, () => { canvas.renderAll(); saveHistory() })
      }
      input.click()
    }
  }
  canvas.on('mouse:dblclick', onDblClick)

  // Text editing — suppress page reflow
  const onTextEntered = (): void => {
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    const ta = (canvasElRef.current)?.nextElementSibling as HTMLElement | null
    if (ta?.tagName === 'TEXTAREA') {
      Object.assign(ta.style, {
        position: 'fixed', top: '0', left: '0',
        opacity: '0', pointerEvents: 'none',
        resize: 'none', overflow: 'hidden', width: '1px', height: '1px',
      })
    }
    if (containerRef.current) {
      containerRef.current.scrollTop = 0
      containerRef.current.scrollLeft = 0
    }
  }
  canvas.on('text:editing:entered', onTextEntered)

  // OS drag/drop listeners
  const convertScreen = (screenX: number, screenY: number): { x: number; y: number } => {
    const rect = canvasElRef.current!.getBoundingClientRect()
    return {
      x: (screenX - rect.left) / opts.zoomRef.current,
      y: (screenY - rect.top)  / opts.zoomRef.current,
    }
  }

  const handleDragOver = (e: DragEvent): void => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    const { x, y } = convertScreen(e.clientX, e.clientY)
    const frame = findFrameAtPoint(canvas, x, y)
    if (frame !== dragOverFrameRef.current) {
      if (dragOverFrameRef.current) clearFrameHighlight(dragOverFrameRef.current)
      if (frame) highlightFrame(frame, accentRef.current)
      dragOverFrameRef.current = frame
      canvas.renderAll()
    }
  }

  const handleDragLeave = (e: DragEvent): void => {
    if (e.relatedTarget && canvasElRef.current?.contains(e.relatedTarget as Node)) return
    if (dragOverFrameRef.current) {
      clearFrameHighlight(dragOverFrameRef.current)
      canvas.renderAll()
    }
    dragOverFrameRef.current = null
  }

  const handleDrop = (e: DragEvent): void => {
    e.preventDefault(); e.stopPropagation()
    if (dragOverFrameRef.current) clearFrameHighlight(dragOverFrameRef.current)
    const file = e.dataTransfer?.files?.[0]
    if (!file || !file.type.startsWith('image/')) { dragOverFrameRef.current = null; canvas.renderAll(); return }
    const { x, y } = convertScreen(e.clientX, e.clientY)
    const frame = dragOverFrameRef.current ?? findFrameAtPoint(canvas, x, y)
    dragOverFrameRef.current = null; canvas.renderAll()
    if (frame) {
      const reader = new FileReader()
      reader.onload = (ev): void => {
        const imgEl = new window.Image()
        imgEl.onload = (): void => { applyImageToFrame(frame, imgEl); canvas.renderAll(); saveHistory() }
        imgEl.src = ev.target!.result as string
      }
      reader.readAsDataURL(file)
    } else {
      addImageFromFile(file)
    }
  }

  const canvasEl = canvasElRef.current
  canvasEl?.addEventListener('dragover',  handleDragOver)
  canvasEl?.addEventListener('dragleave', handleDragLeave)
  canvasEl?.addEventListener('drop',      handleDrop)

  return (): void => {
    canvas.off('selection:created', onSelCreated)
    canvas.off('selection:updated', onSelUpdated)
    canvas.off('selection:cleared', onSelCleared)
    canvas.off('object:modified',   onObjModified)
    canvas.off('object:moving',     onMoving)
    canvas.off('object:scaling',    onScaling)
    canvas.off('object:rotating',   onRotating)
    canvas.off('object:moving',     onMovingImgFrame)
    canvas.off('object:moving',     onMovingSnap)
    canvas.off('object:scaling',    onScalingGuide)
    canvas.off('mouse:up',          onMouseUp)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canvas.off('mouse:down',        onMouseDown as any)
    canvas.off('mouse:dblclick',    onDblClick)
    canvas.off('text:editing:entered', onTextEntered)
    canvasEl?.removeEventListener('dragover',  handleDragOver)
    canvasEl?.removeEventListener('dragleave', handleDragLeave)
    canvasEl?.removeEventListener('drop',      handleDrop)
  }
}
