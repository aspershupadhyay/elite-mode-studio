/**
 * brandStorage.ts — Read/write active brand kit from localStorage.
 * Mirrors the BrandAsset type from BrandTab.tsx without importing React.
 */

export interface BrandAsset {
  id: string
  name: string
  logo: string | null
  colors: string[]
  headingFont: string
  bodyFont: string
  brandVoice: string
  tagline: string
}

export function loadBrands(): BrandAsset[] {
  try { return JSON.parse(localStorage.getItem('elite_brands') || '[]') } catch { return [] }
}

export function getActiveBrand(): BrandAsset | null {
  const brands = loadBrands()
  if (!brands.length) return null
  const id = localStorage.getItem('elite_active_brand_id')
  return brands.find(b => b.id === id) || brands[0]
}
