/**
 * BrandTab.tsx — Multi-brand asset manager
 * Stores brand kits locally: logo, colors, fonts, brand voice, tagline.
 * Multiple brands supported — switch between them with one click.
 */

import { useState, useRef, useCallback } from 'react'
import { T, Icons } from './shared'
import { FONT_REGISTRY } from '../../studio/data/fonts'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BrandAsset {
  id: string
  name: string
  logo: string | null        // base64 data URL
  colors: string[]           // hex palette (up to 8)
  headingFont: string        // display name from FONT_REGISTRY
  bodyFont: string
  brandVoice: string
  tagline: string
}

const DEFAULT_PALETTE = ['#C96A42', '#1A1A1A', '#FFFFFF', '#0BDA76']

function makeBrand(name = 'New Brand'): BrandAsset {
  return {
    id: `brand_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    logo: null,
    colors: [...DEFAULT_PALETTE],
    headingFont: 'Playfair Display',
    bodyFont: 'Inter',
    brandVoice: '',
    tagline: '',
  }
}

function loadBrands(): BrandAsset[] {
  try { return JSON.parse(localStorage.getItem('elite_brands') || '[]') } catch { return [] }
}

function saveBrands(brands: BrandAsset[]): void {
  localStorage.setItem('elite_brands', JSON.stringify(brands))
  window.dispatchEvent(new CustomEvent('brandKitChange'))
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BrandAvatar({ brand, size = 36 }: { brand: BrandAsset; size?: number }): React.ReactElement {
  if (brand.logo) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
        border: `1px solid ${T.border}`,
      }}>
        <img src={brand.logo} alt={brand.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  const initials = brand.name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
  const hue = brand.colors[0] || T.violet
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, flexShrink: 0,
      background: `${hue}22`,
      border: `1px solid ${hue}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.33, fontWeight: 700, color: hue,
    }}>
      {initials || 'B'}
    </div>
  )
}

interface FontPickerProps {
  value: string
  onChange: (v: string) => void
  label: string
}

function FontPicker({ value, onChange, label }: FontPickerProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const filtered = q
    ? FONT_REGISTRY.filter(f => f.family.toLowerCase().includes(q.toLowerCase()))
    : FONT_REGISTRY

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ fontSize: 10, color: T.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600, display: 'block', marginBottom: 5 }}>{label}</label>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 8,
          padding: '8px 12px', cursor: 'pointer', color: T.text,
          fontFamily: `'${value}', sans-serif`, fontSize: 12,
        }}>
        {value}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4,
          background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10,
          zIndex: 300, maxHeight: 240, display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          <div style={{ padding: 8, borderBottom: `1px solid ${T.border}` }}>
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search fonts..."
              style={{
                width: '100%', background: T.bg3, border: `1px solid ${T.border}`,
                borderRadius: 6, padding: '6px 10px', color: T.text, fontSize: 11, outline: 'none',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.map(f => (
              <button
                key={f.family}
                onClick={() => { onChange(f.family); setOpen(false); setQ('') }}
                style={{
                  width: '100%', textAlign: 'left', padding: '7px 12px', border: 'none',
                  background: f.family === value ? `${T.violet}22` : 'transparent',
                  color: f.family === value ? T.violetL : T.text2,
                  fontFamily: `'${f.family}', sans-serif`, fontSize: 12,
                  cursor: 'pointer',
                }}>
                {f.family}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BrandTab(): React.ReactElement {
  const [brands, setBrands] = useState<BrandAsset[]>(() => {
    const loaded = loadBrands()
    return loaded.length > 0 ? loaded : [makeBrand('My Brand')]
  })
  const [activeId, setActiveId] = useState<string>(() => {
    const stored = localStorage.getItem('elite_active_brand_id')
    const loaded = loadBrands()
    return stored && loaded.find(b => b.id === stored) ? stored : (loaded[0]?.id || '')
  })
  const [confirmDelete, setConfirmDelete] = useState(false)

  const logoInputRef = useRef<HTMLInputElement>(null)

  const active = brands.find(b => b.id === activeId) || brands[0]

  const persist = useCallback((next: BrandAsset[]): void => {
    setBrands(next)
    saveBrands(next)
  }, [])

  const updateActive = useCallback((patch: Partial<BrandAsset>): void => {
    if (!active) return
    const next = brands.map(b => b.id === active.id ? { ...b, ...patch } : b)
    persist(next)
  }, [active, brands, persist])

  const addBrand = (): void => {
    const nb = makeBrand(`Brand ${brands.length + 1}`)
    persist([...brands, nb])
    setActiveId(nb.id)
    localStorage.setItem('elite_active_brand_id', nb.id)
  }

  const selectBrand = (id: string): void => {
    setActiveId(id)
    setConfirmDelete(false)
    localStorage.setItem('elite_active_brand_id', id)
  }

  const deleteBrand = (): void => {
    if (brands.length <= 1) return
    const next = brands.filter(b => b.id !== activeId)
    persist(next)
    const newId = next[0]?.id || ''
    setActiveId(newId)
    localStorage.setItem('elite_active_brand_id', newId)
    setConfirmDelete(false)
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      updateActive({ logo: ev.target?.result as string })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleLogoDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = ev => updateActive({ logo: ev.target?.result as string })
    reader.readAsDataURL(file)
  }

  const addColor = (): void => {
    if (!active || active.colors.length >= 8) return
    updateActive({ colors: [...active.colors, '#888888'] })
  }

  const updateColor = (i: number, hex: string): void => {
    if (!active) return
    const next = [...active.colors]
    next[i] = hex
    updateActive({ colors: next })
  }

  const removeColor = (i: number): void => {
    if (!active || active.colors.length <= 1) return
    const next = active.colors.filter((_, idx) => idx !== i)
    updateActive({ colors: next })
  }

  if (!active) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 60, color: T.text3, fontSize: 13 }}>
        No brands yet.
        <button onClick={addBrand} style={{ display: 'block', margin: '16px auto', padding: '8px 20px', background: T.violet, color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Create Brand
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── Left: brand list ── */}
      <div style={{
        width: 200, flexShrink: 0, background: T.bg2,
        borderRight: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 12px 10px', borderBottom: `1px solid ${T.border}` }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '.1em', margin: 0 }}>Brand Kits</p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {brands.map(b => {
            const active_ = b.id === activeId
            return (
              <button
                key={b.id}
                onClick={() => selectBrand(b.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 8px', borderRadius: 8, border: 'none',
                  background: active_ ? `${T.violet}18` : 'transparent',
                  cursor: 'pointer', marginBottom: 2,
                  outline: active_ ? `1px solid ${T.violet}44` : 'none',
                  textAlign: 'left',
                }}>
                <BrandAvatar brand={b} size={32} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: active_ ? 600 : 400, color: active_ ? T.violetL : T.text2, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.name}
                  </p>
                  <p style={{ fontSize: 10, color: T.text3, margin: 0 }}>
                    {b.colors.length} colors
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        <div style={{ padding: '8px 10px', borderTop: `1px solid ${T.border}` }}>
          <button
            onClick={addBrand}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: 8,
              border: `1px dashed ${T.border}`, background: 'transparent',
              color: T.text3, fontSize: 11, cursor: 'pointer',
            }}>
            <Icons.plus size={13} color={T.text3} />
            Add Brand
          </button>
        </div>
      </div>

      {/* ── Right: brand detail ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <BrandAvatar brand={active} size={48} />
          <div style={{ flex: 1 }}>
            <input
              value={active.name}
              onChange={e => updateActive({ name: e.target.value })}
              style={{
                fontSize: 20, fontWeight: 700, color: T.text, background: 'transparent',
                border: 'none', outline: 'none', width: '100%',
                borderBottom: `1px solid transparent`,
              }}
              onFocus={e => { e.currentTarget.style.borderBottomColor = T.violet }}
              onBlur={e => { e.currentTarget.style.borderBottomColor = 'transparent' }}
              placeholder="Brand name"
            />
            <p style={{ fontSize: 11, color: T.text3, marginTop: 3 }}>Click name to edit</p>
          </div>
        </div>

        {/* Logo */}
        <div>
          <SectionLabel>Logo</SectionLabel>
          <div
            onDrop={handleLogoDrop}
            onDragOver={e => e.preventDefault()}
            style={{
              border: `2px dashed ${T.border}`, borderRadius: 12,
              padding: 20, textAlign: 'center', cursor: 'pointer',
              background: T.bg3, position: 'relative',
              transition: 'border-color .15s',
            }}
            onClick={() => logoInputRef.current?.click()}
          >
            <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
            {active.logo ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img src={active.logo} alt="logo" style={{ maxHeight: 90, maxWidth: '100%', borderRadius: 8, objectFit: 'contain' }} />
                <button
                  onClick={e => { e.stopPropagation(); updateActive({ logo: null }) }}
                  style={{
                    position: 'absolute', top: -8, right: -8,
                    width: 20, height: 20, borderRadius: '50%',
                    background: T.red, border: 'none', color: '#fff',
                    fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <Icons.x size={10} color="#fff" />
                </button>
              </div>
            ) : (
              <div>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: T.bg4, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icons.plus size={18} color={T.text3} />
                </div>
                <p style={{ fontSize: 12, color: T.text3, margin: 0 }}>Drop logo or click to upload</p>
                <p style={{ fontSize: 10, color: T.text3, opacity: .6, marginTop: 4 }}>PNG, SVG, JPG — transparent background recommended</p>
              </div>
            )}
          </div>
        </div>

        {/* Color palette */}
        <div>
          <SectionLabel>Color Palette</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {active.colors.map((hex, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <label style={{ display: 'block', cursor: 'pointer' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: hex, border: `2px solid ${T.border}`,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    transition: 'transform .1s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                  />
                  <input type="color" value={hex} onChange={e => updateColor(i, e.target.value)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                </label>
                <button
                  onClick={() => removeColor(i)}
                  style={{
                    position: 'absolute', top: -6, right: -6,
                    width: 16, height: 16, borderRadius: '50%',
                    background: T.bg4, border: `1px solid ${T.border}`,
                    color: T.text3, fontSize: 8, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0, transition: 'opacity .1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0' }}
                >
                  <Icons.x size={8} color={T.text3} />
                </button>
                <p style={{ fontSize: 9, color: T.text3, textAlign: 'center', marginTop: 4, fontFamily: 'monospace', letterSpacing: '-.02em' }}>{hex.toUpperCase()}</p>
              </div>
            ))}
            {active.colors.length < 8 && (
              <button
                onClick={addColor}
                style={{
                  width: 44, height: 44, borderRadius: 10,
                  border: `2px dashed ${T.border}`, background: T.bg3,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <Icons.plus size={16} color={T.text3} />
              </button>
            )}
          </div>
        </div>

        {/* Fonts */}
        <div>
          <SectionLabel>Typography</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FontPicker
              label="Heading Font"
              value={active.headingFont}
              onChange={v => updateActive({ headingFont: v })}
            />
            <FontPicker
              label="Body Font"
              value={active.bodyFont}
              onChange={v => updateActive({ bodyFont: v })}
            />
          </div>
          <div style={{ marginTop: 14, padding: '14px 16px', background: T.bg3, borderRadius: 10, border: `1px solid ${T.border}` }}>
            <p style={{ fontFamily: `'${active.headingFont}', sans-serif`, fontSize: 18, fontWeight: 700, color: T.text, margin: '0 0 4px' }}>
              Heading Preview — {active.headingFont}
            </p>
            <p style={{ fontFamily: `'${active.bodyFont}', sans-serif`, fontSize: 12, color: T.text2, margin: 0, lineHeight: 1.7 }}>
              Body text preview — {active.bodyFont}. The quick brown fox jumps over the lazy dog.
            </p>
          </div>
        </div>

        {/* Tagline */}
        <div>
          <SectionLabel>Tagline</SectionLabel>
          <input
            value={active.tagline}
            onChange={e => updateActive({ tagline: e.target.value })}
            placeholder="Your brand's one-liner..."
            maxLength={120}
            style={{
              width: '100%', background: T.bg3, border: `1px solid ${T.border}`,
              borderRadius: 8, padding: '10px 14px', color: T.text, fontSize: 13,
              outline: 'none',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = T.violet }}
            onBlur={e => { e.currentTarget.style.borderColor = T.border }}
          />
        </div>

        {/* Brand Voice */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <SectionLabel noMargin>Brand Voice</SectionLabel>
            <span style={{ fontSize: 10, color: T.text3 }}>{active.brandVoice.length}/500</span>
          </div>
          <textarea
            value={active.brandVoice}
            onChange={e => updateActive({ brandVoice: e.target.value.slice(0, 500) })}
            placeholder="Describe your brand's tone, personality, and communication style. This is used as context when generating AI content for this brand.

Example: Professional yet approachable. We communicate with authority but warmth. Avoid jargon. Use active voice. Appeal to founders and product teams."
            rows={6}
            style={{
              width: '100%', background: T.bg3, border: `1px solid ${T.border}`,
              borderRadius: 10, padding: '12px 14px', color: T.text, fontSize: 12,
              lineHeight: 1.7, resize: 'vertical', outline: 'none', fontFamily: 'inherit',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = T.violet }}
            onBlur={e => { e.currentTarget.style.borderColor = T.border }}
          />
        </div>

        {/* Danger zone */}
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 20, marginTop: 4 }}>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={brands.length <= 1}
              style={{
                padding: '7px 14px', borderRadius: 8, border: `1px solid ${T.red}44`,
                background: 'transparent', color: T.red, fontSize: 11, cursor: brands.length <= 1 ? 'not-allowed' : 'pointer',
                opacity: brands.length <= 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <Icons.trash size={12} color={T.red} />
              Delete Brand
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: T.text3 }}>Delete "{active.name}"?</span>
              <button onClick={deleteBrand} style={{ padding: '6px 14px', borderRadius: 8, background: T.red, color: '#fff', border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                Delete
              </button>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: '6px 14px', borderRadius: 8, background: T.bg3, border: `1px solid ${T.border}`, color: T.text2, fontSize: 11, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionLabel({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }): React.ReactElement {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, color: T.text3,
      textTransform: 'uppercase', letterSpacing: '.1em',
      marginBottom: noMargin ? 0 : 10,
    }}>
      {children}
    </p>
  )
}

