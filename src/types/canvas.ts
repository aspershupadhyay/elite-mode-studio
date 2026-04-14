/**
 * Canvas module contracts.
 *
 * CanvasHandle — the imperative ref API exposed by Canvas.tsx via
 * useImperativeHandle.  Every parent that calls canvasRef.current.X
 * types the ref as RefObject<CanvasHandle>.
 */
import type { Canvas as FabricCanvas, FabricObject } from 'fabric'

export interface CanvasSize {
  width: number
  height: number
}

export interface PanOffset {
  x: number
  y: number
}

export interface SnapGuideData {
  vertical: number[]
  horizontal: number[]
}

export interface RulerGuideSet {
  /** Y positions of horizontal guide lines */
  h: number[]
  /** X positions of vertical guide lines */
  v: number[]
  visible: boolean
}

export interface GeneratedContentArgs {
  title?: string
  highlight_words?: string[]
  subtitle?: string
  tag?: string
}

/** Styles applied to the current IText selection via applySelectionStyle. */
export type SelectionStylePatch = Record<
  string,
  string | number | boolean | null
>

/** Public imperative API surface exposed by the Canvas component. */
export interface CanvasHandle {
  // History
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // Add elements
  addText: (text?: string) => void
  addRect: () => void
  addCircle: () => void
  addLine: () => void
  addImageFromFile: (file: File) => void
  addTriangle: () => void
  addStar: () => void
  addPentagon: () => void
  addHexagon: () => void
  addDiamond: () => void
  addArrow: () => void
  addTitle: (text?: string) => void
  addSubtitle: (text?: string) => void
  addTag: (text?: string) => void
  addAccentLine: () => void
  addLogo: () => void
  addGradientOverlay: () => void
  addFrameShape: (shape: string, w?: number, h?: number) => void
  loadImageIntoFrame: (frame: FabricObject, file: File) => void
  setFrameFitMode: (frame: FabricObject, mode: string) => void
  setFrameImageOffset: (frame: FabricObject, x: number, y: number) => void
  setFrameImageScale: (frame: FabricObject, scale: number) => void
  clearFrameImage: (obj: FabricObject) => void
  addFrame: (shape: string) => void
  FRAME_SHAPES: Record<string, unknown>
  addIconToCanvas: (iconData: { path: string | string[]; label: string; id: string }, color?: string, size?: number) => void
  addImageFromURL: (url: string, x?: number, y?: number, w?: number, h?: number) => void
  loadImageIntoFrameFromURL: (frame: FabricObject, url: string) => void

  // Selection
  deleteSelected: () => void
  duplicateSelected: () => void
  selectAll: () => void
  copy: () => void
  paste: () => void

  // Layer order
  bringToFront: () => void
  sendToBack: () => void
  bringForward: () => void
  sendBackward: () => void

  // Transform
  flipHorizontal: () => void
  flipV: () => void
  toggleVisibility: () => void
  toggleLock: () => void

  // Groups
  groupSelected: () => void
  ungroupSelected: () => void

  // Deleted layers
  getDeletedLayers: () => Array<{ label: string; type: string; json: object; deletedAt: number }>
  restoreDeletedLayer: (index: number) => void

  // Export/Import
  exportJSON: () => string
  importJSON: (json: string) => Promise<void>
  exportPNG: (multiplier?: number) => void
  savePngBatch: () => Promise<void>
  changeSize: (width: number, height: number, skipAutoFormat?: boolean, forceAutoFormat?: boolean) => void
  setCanvasBg: (color: string) => void
  getCanvas: () => FabricCanvas | null
  getThumb: () => string | null

  // Auto format
  setAutoFormat: (enabled: boolean) => void
  getAutoFormat: () => boolean
  runAutoFormat: () => void

  // Zoom/pan
  setZoom: (zoom: number) => void
  getZoom: () => number
  zoomToFit: () => void
  /** Restore zoom (percentage) and pan in one atomic update — used by session restore. */
  restoreViewport: (zoomPct: number, pan: { x: number; y: number }) => void

  // Content
  saveHistory: () => void
  resetToDefault: () => void
  clearCanvas: () => void
  updateAccentColor: (color: string) => void
  applyGeneratedContent: (args: GeneratedContentArgs) => void
  applySelectionStyle: (styles: SelectionStylePatch) => void

  // Clipboard
  pasteFromClipboard: () => Promise<{ success: boolean }>
  getCanvasBounds: () => { left: number; top: number; width: number; height: number } | null
  getPan: () => { x: number; y: number }
}
