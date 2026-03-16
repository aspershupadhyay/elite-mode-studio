import { useEffect, useRef } from 'react'
import * as fabric from 'fabric'

export default function ContextMenu({ x, y, canvasRef, canvas, selectedObject, onClose }) {
  const menuRef = useRef(null)
  const isMac = navigator.platform.toUpperCase().includes('MAC')
  const MOD = isMac ? '⌘' : 'Ctrl'

  useEffect(() => {
    const click=(e)=>{if(menuRef.current&&!menuRef.current.contains(e.target))onClose()}
    const key=(e)=>{if(e.key==='Escape')onClose()}
    document.addEventListener('mousedown',click); document.addEventListener('keydown',key)
    return()=>{document.removeEventListener('mousedown',click); document.removeEventListener('keydown',key)}
  }, [onClose])

  const style = { left:Math.min(x,window.innerWidth-220), top:Math.min(y,window.innerHeight-400) }
  const h = canvasRef.current
  const hasSelection = !!selectedObject
  const isGroup = selectedObject instanceof fabric.Group && !(selectedObject instanceof fabric.ActiveSelection)
  const hasMultiple = (canvas?.getActiveObjects().length ?? 0) > 1
  const run = (fn) => { fn(); onClose() }

  const Item = ({ label, shortcut, onClick, disabled, danger }) => (
    <button disabled={disabled} onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-[6px] transition-colors cursor-pointer outline-none
        ${disabled?'text-warm-faint cursor-not-allowed':danger?'text-red-400 hover:bg-red-500/10':'text-warm hover:bg-elite-700/60'}
        disabled:hover:bg-transparent`}>
      <span className="text-[12px]">{label}</span>
      {shortcut&&<span className="text-[10px] text-warm-faint font-mono ml-4">{shortcut}</span>}
    </button>
  )
  const Divider = () => <div className="my-1 border-t border-elite-600/30"/>

  return (
    <div ref={menuRef} style={style}
      className="fixed z-[9999] w-[220px] bg-elite-800 border border-elite-600/40 rounded-lg shadow-2xl shadow-black/60 py-1 text-[12px] select-none">
      <Item label="Copy"                shortcut={`${MOD}C`} disabled={!hasSelection} onClick={()=>run(()=>h?.copy())}/>
      <Item label="Paste from Clipboard" shortcut={`${MOD}V`} onClick={()=>run(()=>h?.pasteFromClipboard?.() ?? h?.paste())}/>
      <Item label="Duplicate"           shortcut={`${MOD}D`} disabled={!hasSelection} onClick={()=>run(()=>h?.duplicateSelected())}/>
      <Divider/>
      <Item label="Bring to Front" shortcut="]" disabled={!hasSelection} onClick={()=>run(()=>h?.bringToFront())}/>
      <Item label="Bring Forward"  disabled={!hasSelection} onClick={()=>run(()=>h?.bringForward())}/>
      <Item label="Send Backward"  disabled={!hasSelection} onClick={()=>run(()=>h?.sendBackward())}/>
      <Item label="Send to Back"   shortcut="[" disabled={!hasSelection} onClick={()=>run(()=>h?.sendToBack())}/>
      <Divider/>
      <Item label="Group"   shortcut={`${MOD}G`}       disabled={!hasMultiple} onClick={()=>run(()=>h?.groupSelected())}/>
      <Item label="Ungroup" shortcut={`${MOD}⇧G`}      disabled={!isGroup}     onClick={()=>run(()=>h?.ungroupSelected())}/>
      <Divider/>
      <Item label="Flip Horizontal" disabled={!hasSelection} onClick={()=>run(()=>h?.flipH())}/>
      <Item label="Flip Vertical"   disabled={!hasSelection} onClick={()=>run(()=>h?.flipV())}/>
      <Divider/>
      <Item label="Show / Hide" disabled={!hasSelection} onClick={()=>run(()=>h?.toggleVisibility())}/>
      <Item label="Lock / Unlock" disabled={!hasSelection} onClick={()=>run(()=>h?.toggleLock())}/>
      <Divider/>
      <Item label="Delete" shortcut="⌫" disabled={!hasSelection} danger onClick={()=>run(()=>h?.deleteSelected())}/>
    </div>
  )
}
