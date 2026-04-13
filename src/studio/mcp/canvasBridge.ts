/**
 * canvasBridge.ts — MCP canvas IPC bridge hook.
 *
 * Registers a listener for 'canvas:command' IPC events (sent by the Electron
 * main process HTTP bridge), dispatches to the appropriate handler, and sends
 * the result back via 'canvas:result'.
 *
 * Mount once in DesignStudio with: useCanvasBridge(canvasHandleRef, pageOps)
 */
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { CanvasHandle } from '@/types/canvas'
import type { CanvasCommandRequest } from '@/types/ipc'
import * as H from './commandHandlers'
import * as A from './commandHandlersAdvanced'
import * as C from './commandHandlersConsolidated'
import * as D from './commandHandlersDesign'

// ── Page operations interface ─────────────────────────────────────────────

export interface PageOps {
  addBlankPage:   () => void
  duplicatePage:  (idx: number) => void
  switchPage:     (idx: number) => Promise<void>
  deletePage:     (idx: number) => void
  renamePage:     (idx: number, name: string) => void
  getPages:       () => Array<{ index: number; label: string; isActive: boolean }>
  getActivePage:  () => number
}

type Handler = (canvasRef: RefObject<CanvasHandle | null>, params: Record<string, unknown>) => unknown

const CANVAS_COMMAND_MAP: Record<string, Handler> = {
  // Canvas
  get_canvas_state:     (r)    => H.handleGetCanvasState(r),
  set_background:       (r, p) => H.handleSetBackground(r, p),
  set_canvas_size:      (r, p) => H.handleSetCanvasSize(r, p),
  export_png:           (r)    => H.handleExportPng(r),
  get_canvas_json:      (r)    => H.handleGetCanvasJson(r),
  clear_canvas:         (r)    => H.handleClearCanvas(r),
  undo:                 (r)    => H.handleUndo(r),
  redo:                 (r)    => H.handleRedo(r),
  zoom_to_fit:          (r)    => H.handleZoomToFit(r),
  set_zoom:             (r, p) => H.handleSetZoom(r, p),

  // Add elements
  add_text:             (r, p) => H.handleAddText(r, p),
  add_title:            (r, p) => H.handleAddTitle(r, p),
  add_subtitle:         (r, p) => H.handleAddSubtitle(r, p),
  add_tag:              (r, p) => H.handleAddTag(r, p),
  add_shape:            (r, p) => H.handleAddShape(r, p),
  add_accent_line:      (r, p) => H.handleAddAccentLine(r, p),
  add_gradient_overlay: (r, p) => H.handleAddGradientOverlay(r, p),
  add_logo:             (r, p) => H.handleAddLogo(r, p),
  add_frame:            (r, p) => H.handleAddFrame(r, p),
  add_icon:             (r, p) => H.handleAddIcon(r, p),

  // Query / select
  get_elements:         (r)    => H.handleGetElements(r),
  get_selected:         (r)    => H.handleGetSelected(r),
  select_by_label:      (r, p) => H.handleSelectByLabel(r, p),
  select_by_index:      (r, p) => H.handleSelectByIndex(r, p),
  deselect:             (r)    => H.handleDeselect(r),

  // Position / size / fill
  set_position:         (r, p) => H.handleSetPosition(r, p),
  set_size:             (r, p) => H.handleSetSize(r, p),
  set_opacity:          (r, p) => H.handleSetOpacity(r, p),
  set_fill:             (r, p) => H.handleSetFill(r, p),
  set_stroke:           (r, p) => H.handleSetStroke(r, p),
  set_corner_radius:    (r, p) => H.handleSetCornerRadius(r, p),

  // Text styles
  set_text_content:     (r, p) => H.handleSetTextContent(r, p),
  set_font_family:      (r, p) => H.handleSetFontFamily(r, p),
  set_font_size:        (r, p) => H.handleSetFontSize(r, p),
  set_font_weight:      (r, p) => H.handleSetFontWeight(r, p),
  set_font_style:       (r, p) => H.handleSetFontStyle(r, p),
  set_text_align:       (r, p) => H.handleSetTextAlign(r, p),
  set_underline:        (r, p) => H.handleSetUnderline(r, p),
  set_letter_spacing:   (r, p) => H.handleSetLetterSpacing(r, p),
  set_line_height:      (r, p) => H.handleSetLineHeight(r, p),
  set_text_case:        (r, p) => H.handleSetTextCase(r, p),
  set_text_color:       (r, p) => H.handleSetTextColor(r, p),

  // Word highlights
  highlight_words:      (r, p) => H.handleHighlightWords(r, p),
  clear_word_highlights:(r)    => H.handleClearWordHighlights(r),

  // Layer order
  bring_to_front:       (r)    => H.handleBringToFront(r),
  send_to_back:         (r)    => H.handleSendToBack(r),
  bring_forward:        (r)    => H.handleBringForward(r),
  send_backward:        (r)    => H.handleSendBackward(r),

  // Transform
  flip_horizontal:      (r)    => H.handleFlipHorizontal(r),
  flip_vertical:        (r)    => H.handleFlipVertical(r),
  toggle_lock:          (r)    => H.handleToggleLock(r),
  toggle_visibility:    (r)    => H.handleToggleVisibility(r),
  delete_selected:      (r)    => H.handleDeleteSelected(r),
  duplicate_selected:   (r)    => H.handleDuplicateSelected(r),
  group_selected:       (r)    => H.handleGroupSelected(r),
  ungroup_selected:     (r)    => H.handleUngroupSelected(r),

  // Gradient / frame
  set_gradient:         (r, p) => H.handleSetGradient(r, p),
  set_frame_fit:        (r, p) => H.handleSetFrameFit(r, p),
  update_accent_color:  (r, p) => H.handleUpdateAccentColor(r, p),

  // Advanced manipulation
  select_multiple:      (r, p) => A.handleSelectMultiple(r, p),
  rotate_element:       (r, p) => A.handleRotate(r, p),
  set_shadow:           (r, p) => A.handleSetShadow(r, p),
  set_blur:             (r, p) => A.handleSetBlur(r, p),
  align_elements:       (r, p) => A.handleAlignElements(r, p),
  distribute_elements:  (r, p) => A.handleDistributeElements(r, p),

  // Image generation pipeline
  generate_image:       (r, p) => A.handleGenerateImage(r, p),
  replace_image:        (r, p) => A.handleReplaceImage(r, p),

  // Meta
  list_fonts:           ()     => H.handleListFonts(),
  list_icons:           ()     => H.handleListIcons(),

  // ── Consolidated tools (10-tool API) ─────────────────────────────────────
  update_element:       (r, p) => C.handleUpdateElement(r, p),
  place_image_from_url: (r, p) => C.handlePlaceImageFromURL(r, p),

  // ── Design-intelligence tools ─────────────────────────────────────────────
  brand_kit:            (r, p) => D.handleBrandKit(r, p),
  template_ops:         (r, p) => D.handleTemplateOps(r, p),
  fit_text:             (r, p) => D.handleFitText(r, p),
  validate_design:      (r, p) => D.handleValidateDesign(r, p),
  execute_design_plan:  (r, p) => D.handleExecuteDesignPlan(r, p),
  build_carousel_page:  (r, p) => D.handleBuildCarouselPage(r, p),
  assign_elite_id:      (r, p) => D.handleAssignEliteId(r, p),
}

export function useCanvasBridge(
  canvasRef: RefObject<CanvasHandle | null>,
  pageOps: PageOps,
): void {
  // Use a ref so page-op handlers always call the latest callbacks
  // without the IPC listener needing to re-register on every render.
  const pageOpsRef = useRef<PageOps>(pageOps)
  useEffect(() => { pageOpsRef.current = pageOps })

  useEffect(() => {
    const { onCanvasCommand, sendCanvasResult } = window.api ?? {}
    if (!onCanvasCommand || !sendCanvasResult) return

    const cleanup = onCanvasCommand(async (cmd: CanvasCommandRequest) => {
      const { requestId, tool, params } = cmd

      // Page operations — close over pageOpsRef so they always get the latest fns
      const po = pageOpsRef.current
      const pageCommandMap: Record<string, () => unknown> = {
        add_canvas_page:       ()  => { po.addBlankPage(); return { success: true, action: 'add', pageCount: po.getPages().length + 1 } },
        duplicate_canvas_page: ()  => { po.duplicatePage(Number(params.index ?? po.getActivePage())); return { success: true, action: 'duplicate', pageCount: po.getPages().length } },
        switch_canvas_page:    async () => { await po.switchPage(Number(params.index ?? 0)); return { success: true, action: 'switch', activeIndex: Number(params.index ?? 0) } },
        delete_canvas_page:    ()  => { po.deletePage(Number(params.index ?? po.getActivePage())); return { success: true, action: 'delete', pageCount: po.getPages().length } },
        rename_canvas_page:    ()  => { po.renamePage(Number(params.index ?? po.getActivePage()), String(params.name || 'Page')); return { success: true, action: 'rename', name: String(params.name || 'Page') } },
        get_canvas_pages:      ()  => po.getPages(),
      }

      const pageHandler = pageCommandMap[tool]
      if (pageHandler) {
        try {
          const data = await Promise.resolve(pageHandler())
          sendCanvasResult({ requestId, success: true, data })
        } catch (err) {
          sendCanvasResult({ requestId, success: false, error: err instanceof Error ? err.message : String(err) })
        }
        return
      }

      const handler = CANVAS_COMMAND_MAP[tool]
      if (!handler) {
        const allTools = [...Object.keys(CANVAS_COMMAND_MAP), ...Object.keys(pageCommandMap)].join(', ')
        sendCanvasResult({ requestId, success: false, error: `unknown tool "${tool}". Available: ${allTools}` })
        return
      }

      try {
        const data = await Promise.resolve(handler(canvasRef, params))
        sendCanvasResult({ requestId, success: true, data })
      } catch (err) {
        sendCanvasResult({ requestId, success: false, error: err instanceof Error ? err.message : String(err) })
      }
    })

    return cleanup
  }, [canvasRef])
}
