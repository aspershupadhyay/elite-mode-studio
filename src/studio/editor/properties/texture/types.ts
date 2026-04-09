export type TextureMappingMode = 'tile' | 'fill' | 'fit'

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light'
  | 'hard-light' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'difference' | 'exclusion'

export interface TextureParams {
  /** Data-URL of the texture image */
  src: string
  /** Built-in preset ID if from the preset library */
  presetId?: string
  /** Mapping / tiling mode */
  mapping: TextureMappingMode
  /** Tile scale 10–500 % */
  scale: number
  /** Rotation 0–360 ° */
  rotation: number
  /** Pan X  0–100 % */
  offsetX: number
  /** Pan Y  0–100 % */
  offsetY: number
  /** Texture opacity 0–100 */
  intensity: number
  /** Brightness -100–100 */
  brightness: number
  /** Contrast -100–100 */
  contrast: number
  /** Gaussian blur 0–20 px */
  blur: number
  /** Hex color tint */
  tintColor: string
  /** Tint strength 0–100 */
  tintStrength: number
  /** Canvas composite blend mode */
  blendMode: BlendMode
}

export const DEFAULT_TEXTURE: TextureParams = {
  src: '',
  mapping: 'tile',
  scale: 100,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
  intensity: 100,
  brightness: 0,
  contrast: 0,
  blur: 0,
  tintColor: '#ffffff',
  tintStrength: 0,
  blendMode: 'normal',
}

export interface TexturePreset {
  id: string
  name: string
  category: 'grain' | 'noise' | 'paper' | 'grunge' | 'halftone' | 'fabric'
  defaultParams?: Partial<TextureParams>
}

/**
 * Per-character texture range stored in `obj.eliteCharTextures` (JSON array).
 * `start` is inclusive, `end` is exclusive — same convention as Fabric's
 * selectionStart/selectionEnd.
 */
export interface EliteCharTextureRange {
  start:  number
  end:    number
  params: TextureParams
}
