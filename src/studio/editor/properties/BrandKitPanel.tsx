/**
 * BrandKitPanel.tsx — Brand Kit quick-access panel inside Design Studio.
 *
 * Shown in PropertiesPanel when no object is selected (canvas panel).
 * Also exposes a useBrandKit() hook for FillSection + TextSection to
 * read brand colors + fonts without prop-drilling.
 */

import { useState, useEffect } from 'react'
import { getActiveBrand } from '@/utils/brandStorage'
import type { BrandAsset } from '@/utils/brandStorage'

// ── Hook — load active brand, refresh on storage change ───────────────────────

export function useBrandKit(): BrandAsset | null {
  const [brand, setBrand] = useState<BrandAsset | null>(() => getActiveBrand())

  useEffect(() => {
    const refresh = (): void => setBrand(getActiveBrand())
    window.addEventListener('storage', refresh)
    // Also respond to same-tab brand saves
    window.addEventListener('brandKitChange', refresh)
    return (): void => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('brandKitChange', refresh)
    }
  }, [])

  return brand
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface BrandKitPanelProps {
  /** Called when user clicks "Add Logo" — receives base64 data URL */
  onAddLogo: (dataUrl: string) => void
  /** Called when user clicks a brand color (for canvas bg or clipboard) */
  onApplyBgColor: (hex: string) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BrandKitPanel({ onAddLogo, onApplyBgColor }: BrandKitPanelProps): React.ReactElement | null {
  const brand = useBrandKit()
  const [open, setOpen] = useState(true)

  if (!brand) return null

  return (
    <div className="border-b border-elite-600/10 pb-3">
      {/* Section header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 mb-1.5 cursor-pointer group"
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          className="text-warm-faint group-hover:text-warm transition-colors flex-shrink-0"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <label className="text-[10px] text-warm-faint uppercase tracking-widest font-semibold pointer-events-none cursor-pointer">
          Brand Kit
        </label>
        <span className="ml-auto text-[9px] text-accent/70 font-medium truncate max-w-[80px]">{brand.name}</span>
      </button>

      {open && (
        <div className="space-y-3">
          {/* Logo */}
          {brand.logo && (
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-elite-800 border border-elite-600/30 flex-shrink-0">
                <img src={brand.logo} alt={brand.name} className="w-full h-full object-contain p-1" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-warm-faint truncate">{brand.name} logo</p>
                <button
                  onClick={() => brand.logo && onAddLogo(brand.logo)}
                  className="text-[10px] text-accent hover:text-accent/80 transition-colors mt-0.5 cursor-pointer">
                  + Add to canvas
                </button>
              </div>
            </div>
          )}

          {/* Brand Colors */}
          {brand.colors.length > 0 && (
            <div>
              <p className="text-[9px] text-warm-faint/70 uppercase tracking-widest mb-1.5">Colors</p>
              <div className="flex flex-wrap gap-1.5">
                {brand.colors.map((hex, i) => (
                  <div key={i} className="group/swatch relative">
                    <button
                      onClick={() => onApplyBgColor(hex)}
                      title={`Apply ${hex} to background`}
                      style={{ background: hex }}
                      className="w-6 h-6 rounded-md border border-white/10 cursor-pointer transition-transform hover:scale-110 active:scale-95"
                    />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-elite-900 border border-elite-600/40 rounded text-[8px] text-warm font-mono whitespace-nowrap opacity-0 group-hover/swatch:opacity-100 pointer-events-none transition-opacity z-50">
                      {hex.toUpperCase()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fonts */}
          <div>
            <p className="text-[9px] text-warm-faint/70 uppercase tracking-widest mb-1.5">Typography</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-elite-800/60 border border-elite-600/20">
                <span className="text-[9px] text-warm-faint/50 uppercase w-8 flex-shrink-0">Head</span>
                <span className="text-[11px] text-warm truncate" style={{ fontFamily: `'${brand.headingFont}', sans-serif` }}>
                  {brand.headingFont}
                </span>
              </div>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-elite-800/60 border border-elite-600/20">
                <span className="text-[9px] text-warm-faint/50 uppercase w-8 flex-shrink-0">Body</span>
                <span className="text-[11px] text-warm truncate" style={{ fontFamily: `'${brand.bodyFont}', sans-serif` }}>
                  {brand.bodyFont}
                </span>
              </div>
            </div>
          </div>

          {brand.tagline && (
            <p className="text-[10px] text-warm-faint/60 italic leading-relaxed px-0.5">"{brand.tagline}"</p>
          )}
        </div>
      )}
    </div>
  )
}
