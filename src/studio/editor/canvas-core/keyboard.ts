/**
 * keyboard.ts — Register / unregister keyboard shortcuts for the canvas.
 * Returns a cleanup function that removes all listeners.
 */

import type { Canvas } from 'fabric'
import type { CanvasHandle } from '@/types/canvas'

export function registerKeyboardHandlers(
  canvas: Canvas,
  handle: CanvasHandle,
  width: number,
  height: number,
  accentRef: { current: string },
  saveHistory: () => void,
  pasteInternalFn: () => void,
  pasteSystemFn: (args: { canvas: Canvas; width: number; height: number; accent: string; saveHistory: () => void }) => Promise<{ success: boolean }>,
  copyToSystemClipboard: (canvas: Canvas) => Promise<void>,
  applyImageToFrame: (frame: import('fabric').FabricObject, imgEl: HTMLImageElement) => void,
  isSpaceDownRef: { current: boolean },
  containerRef: { current: HTMLDivElement | null },
): () => void {
  const down = async (e: KeyboardEvent): Promise<void> => {
    const tag = (e.target as HTMLElement)?.tagName
    const isEditingText = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)
    const isMeta = e.metaKey || e.ctrlKey

    // History (global — intercept even while in inputs)
    if (isMeta && !e.shiftKey && e.key === 'z') { e.preventDefault(); handle.undo(); return }
    if (isMeta &&  e.shiftKey && e.key === 'Z') { e.preventDefault(); handle.redo(); return }

    if (isEditingText) return

    // Cmd+V → system clipboard paste
    if (isMeta && e.key === 'v') {
      e.preventDefault()

      const fabricObj = canvas.getActiveObject()
      const activeFrame = fabricObj?.eliteType === 'frame' ? fabricObj : null

      if (activeFrame) {
        try {
          const items = await navigator.clipboard.read()
          for (const item of items) {
            const imageType = item.types.find(t => t.startsWith('image/'))
            if (imageType) {
              const blob    = await item.getType(imageType)
              const dataUrl = await new Promise<string>((res, rej) => {
                const r = new FileReader()
                r.onload  = () => res(r.result as string)
                r.onerror = rej
                r.readAsDataURL(blob)
              })
              const imgEl = new window.Image()
              imgEl.onload = (): void => {
                applyImageToFrame(activeFrame, imgEl)
                canvas.renderAll()
                saveHistory()
              }
              imgEl.src = dataUrl
              return
            }
          }
        } catch {
          // clipboard.read() may be blocked — fall through
        }
        pasteInternalFn()
        return
      }

      // Normal paste (no frame selected)
      const result = await pasteSystemFn({ canvas, width, height, accent: accentRef.current, saveHistory })
      if (!result.success) pasteInternalFn()
      return
    }

    if (isMeta && e.key === 'c') {
      e.preventDefault()
      // Internal copy + write PNG to OS clipboard (Figma-style)
      canvas.getActiveObject()
      copyToSystemClipboard(canvas).catch(() => {})
      return
    }

    if (isMeta && e.key === 'd')             { e.preventDefault(); handle.duplicateSelected(); return }
    if (isMeta && e.key === 'a')             { e.preventDefault(); handle.selectAll?.(); return }
    if (isMeta && !e.shiftKey && e.key === 'g') { e.preventDefault(); handle.groupSelected(); return }
    if (isMeta &&  e.shiftKey && e.key === 'G') { e.preventDefault(); handle.ungroupSelected(); return }
    if (e.key === ']')                        { e.preventDefault(); handle.bringToFront(); return }
    if (e.key === '[')                        { e.preventDefault(); handle.sendToBack(); return }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const active = canvas.getActiveObject()
      if (active && !(active as import('fabric').FabricObject & { isEditing?: boolean }).isEditing) {
        e.preventDefault()
        handle.deleteSelected()
      }
      return
    }
    if (e.key === ' ' && !isSpaceDownRef.current) {
      isSpaceDownRef.current = true
      if (containerRef.current) containerRef.current.style.cursor = 'grab'
    }
    if (e.key === 'Escape') {
      canvas.discardActiveObject()
      canvas.renderAll()
    }

    // Tab — cycle through canvas objects (Shift+Tab = reverse)
    if (e.key === 'Tab') {
      e.preventDefault()
      const objects = canvas.getObjects().filter(o => o.selectable && o.evented && o.visible)
      if (objects.length === 0) return
      const active = canvas.getActiveObject()
      const currentIdx = active ? objects.indexOf(active) : -1
      let nextIdx: number
      if (e.shiftKey) {
        nextIdx = currentIdx <= 0 ? objects.length - 1 : currentIdx - 1
      } else {
        nextIdx = currentIdx >= objects.length - 1 ? 0 : currentIdx + 1
      }
      canvas.setActiveObject(objects[nextIdx])
      canvas.renderAll()
    }
  }

  const up = (e: KeyboardEvent): void => {
    if (e.key === ' ') {
      isSpaceDownRef.current = false
      if (containerRef.current) containerRef.current.style.cursor = 'default'
    }
  }

  window.addEventListener('keydown', down)
  window.addEventListener('keyup',   up)
  return (): void => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup',   up)
  }
}
