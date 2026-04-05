/**
 * ZoomControls.tsx — Zoom in/out/fit/input strip for BottomToolbar.
 */

interface ZoomControlsProps {
  zoom: number
  onZoomChange: (z: number) => void
  onZoomFit: () => void
}

export default function ZoomControls({ zoom, onZoomChange, onZoomFit }: ZoomControlsProps): JSX.Element {
  return (
    <div className="absolute bottom-4 right-4 z-20 flex items-center gap-0 bg-elite-800/90 backdrop-blur-xl rounded-xl border border-elite-600/30 shadow-xl shadow-black/40 overflow-hidden">
      <button
        onClick={() => onZoomChange(Math.max(10, zoom - 10))}
        className="w-9 h-9 flex items-center justify-center text-warm hover:text-white hover:bg-elite-700/60 transition-colors cursor-pointer text-sm font-medium"
      >−</button>
      <span className="w-12 text-center text-[11px] text-warm font-mono select-none">{zoom}%</span>
      <button
        onClick={() => onZoomChange(Math.min(500, zoom + 10))}
        className="w-9 h-9 flex items-center justify-center text-warm hover:text-white hover:bg-elite-700/60 transition-colors cursor-pointer text-sm font-medium"
      >+</button>
      <div className="w-px h-5 bg-elite-600/30"/>
      <button
        onClick={onZoomFit}
        className="px-3 h-9 flex items-center justify-center text-[11px] text-warm font-semibold tracking-wide hover:text-white hover:bg-elite-700/60 transition-colors cursor-pointer uppercase"
      >FIT</button>
    </div>
  )
}
