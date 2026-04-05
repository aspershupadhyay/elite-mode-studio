import type { TexturePreset, TextureParams } from './types'

// ── Procedural generators ──────────────────────────────────────────────────────

const srcCache = new Map<string, string>()

function rnd(lo: number, hi: number): number { return Math.random() * (hi - lo) + lo }

function genNoise(lo = 200, hi = 255): string {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const id = ctx.createImageData(256, 256); const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.round(rnd(lo, hi)); d[i] = d[i+1] = d[i+2] = v; d[i+3] = 255
  }
  ctx.putImageData(id, 0, 0); return c.toDataURL()
}

function genPaper(rough: boolean): string {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const id = ctx.createImageData(256, 256); const d = id.data
  const lo = rough ? 155 : 195, hi = rough ? 235 : 255
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.round(rnd(lo, hi))
    d[i] = Math.min(255, v + 18); d[i+1] = Math.min(255, v + 10)
    d[i+2] = Math.min(255, v - 8); d[i+3] = 255
  }
  ctx.putImageData(id, 0, 0); return c.toDataURL()
}

function genVintage(): string {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const id = ctx.createImageData(256, 256); const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.round(rnd(140, 210))
    d[i] = Math.min(255, v + 35); d[i+1] = Math.min(255, v + 18)
    d[i+2] = Math.min(255, v - 22); d[i+3] = 255
  }
  ctx.putImageData(id, 0, 0); return c.toDataURL()
}

function genGrunge(dark: boolean): string {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const id = ctx.createImageData(256, 256); const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    const v = dark
      ? (Math.random() < 0.1 ? Math.round(rnd(0, 60))  : Math.round(rnd(150, 245)))
      : (Math.random() < 0.03 ? 255 : Math.round(rnd(185, 250)))
    d[i] = d[i+1] = d[i+2] = v; d[i+3] = 255
  }
  ctx.putImageData(id, 0, 0); return c.toDataURL()
}

function genChroma(): string {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const id = ctx.createImageData(256, 256); const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(rnd(80, 255)); d[i+1] = Math.round(rnd(80, 255))
    d[i+2] = Math.round(rnd(80, 255)); d[i+3] = 255
  }
  ctx.putImageData(id, 0, 0); return c.toDataURL()
}

function genHalftone(spacing: number): string {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 256)
  ctx.fillStyle = '#000000'
  for (let y = 0; y < 256; y += spacing)
    for (let x = 0; x < 256; x += spacing) {
      ctx.beginPath(); ctx.arc(x + spacing/2, y + spacing/2, spacing * 0.35, 0, Math.PI * 2); ctx.fill()
    }
  return c.toDataURL()
}

function genLines(gap: number): string {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = '#000000'; ctx.lineWidth = gap * 0.4
  for (let y = gap / 2; y < 256; y += gap) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke()
  }
  return c.toDataURL()
}

function genLinen(): string {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#e8dcc8'; ctx.fillRect(0, 0, 64, 64)
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const h = (x + y) % 4 < 2, v = (x - y + 128) % 4 < 2
      if (h || v) {
        const n = Math.round(rnd(-18, 18)), b = 208 + n
        ctx.fillStyle = `rgb(${b + 10},${b},${b - 10})`; ctx.fillRect(x, y, 1, 1)
      }
    }
  return c.toDataURL()
}

const GENERATORS: Record<string, () => string> = {
  'grain-fine':    () => genNoise(210, 255),
  'grain-medium':  () => genNoise(160, 255),
  'grain-coarse':  () => genNoise(90,  255),
  'noise-mono':    () => genNoise(0,   255),
  'noise-chroma':  genChroma,
  'paper-smooth':  () => genPaper(false),
  'paper-rough':   () => genPaper(true),
  'paper-vintage': genVintage,
  'grunge-dark':   () => genGrunge(true),
  'grunge-dust':   () => genGrunge(false),
  'halftone-dots': () => genHalftone(16),
  'halftone-fine': () => genHalftone(8),
  'halftone-lines':() => genLines(8),
  'fabric-linen':  genLinen,
}

/** Generate (and cache) the data-URL for a built-in preset. */
export function getPresetSrc(id: string): string {
  if (srcCache.has(id)) return srcCache.get(id)!
  const gen = GENERATORS[id]
  if (!gen) return ''
  const src = gen()
  srcCache.set(id, src)
  return src
}

// ── Preset catalogue ──────────────────────────────────────────────────────────

export const PRESETS: TexturePreset[] = [
  { id: 'grain-fine',    name: 'Fine',    category: 'grain',    defaultParams: { scale: 100 } },
  { id: 'grain-medium',  name: 'Medium',  category: 'grain',    defaultParams: { scale: 100 } },
  { id: 'grain-coarse',  name: 'Coarse',  category: 'grain',    defaultParams: { scale: 80  } },
  { id: 'noise-mono',    name: 'Mono',    category: 'noise',    defaultParams: { scale: 100 } },
  { id: 'noise-chroma',  name: 'Chroma',  category: 'noise',    defaultParams: { scale: 100 } },
  { id: 'paper-smooth',  name: 'Smooth',  category: 'paper',    defaultParams: { scale: 120 } },
  { id: 'paper-rough',   name: 'Rough',   category: 'paper',    defaultParams: { scale: 100 } },
  { id: 'paper-vintage', name: 'Vintage', category: 'paper',    defaultParams: { scale: 100 } },
  { id: 'grunge-dark',   name: 'Dark',    category: 'grunge',   defaultParams: { scale: 80  } },
  { id: 'grunge-dust',   name: 'Dust',    category: 'grunge',   defaultParams: { scale: 120 } },
  { id: 'halftone-dots', name: 'Dots',    category: 'halftone', defaultParams: { scale: 100, blendMode: 'multiply' as const } },
  { id: 'halftone-fine', name: 'Fine',    category: 'halftone', defaultParams: { scale: 80,  blendMode: 'multiply' as const } },
  { id: 'halftone-lines',name: 'Lines',   category: 'halftone', defaultParams: { scale: 100, blendMode: 'multiply' as const } },
  { id: 'fabric-linen',  name: 'Linen',   category: 'fabric',   defaultParams: { scale: 150 } },
]

export const PRESET_CATEGORIES = ['grain','noise','paper','grunge','halftone','fabric'] as const
export type PresetCategory = typeof PRESET_CATEGORIES[number]

/** Merge preset defaults into DEFAULT_TEXTURE and return full params with the given src. */
export function presetToParams(id: string, src: string): Partial<TextureParams> {
  const preset = PRESETS.find(p => p.id === id)
  return { ...preset?.defaultParams, src, presetId: id }
}
