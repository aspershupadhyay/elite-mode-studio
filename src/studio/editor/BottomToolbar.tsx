/**
 * BottomToolbar.tsx — Figma-style floating toolbar (shell)
 *
 * Composes ToolPicker (tool buttons + dropdowns) and ZoomControls.
 */

import type { RefObject } from 'react'
import type { CanvasHandle } from '@/types/canvas'
import ToolPicker  from './bottom-toolbar/ToolPicker'
import ZoomControls from './bottom-toolbar/ZoomControls'

export interface BottomToolbarProps {
  activeTool: string
  onToolChange: (tool: string) => void
  canvasRef: RefObject<CanvasHandle | null>
  zoom: number
  onZoomChange: (z: number) => void
  onZoomFit: () => void
}

export default function BottomToolbar({
  activeTool,
  onToolChange,
  canvasRef,
  zoom,
  onZoomChange,
  onZoomFit,
}: BottomToolbarProps): JSX.Element {
  return (
    <>
      <ToolPicker
        activeTool={activeTool}
        onToolChange={onToolChange}
        canvasRef={canvasRef}
      />
      <ZoomControls
        zoom={zoom}
        onZoomChange={onZoomChange}
        onZoomFit={onZoomFit}
      />
    </>
  )
}
