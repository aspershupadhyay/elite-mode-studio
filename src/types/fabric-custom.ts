/**
 * Fabric.js module augmentation — adds Elite custom properties to every
 * FabricObject so that `obj.eliteType`, `obj.eliteLabel`, etc. are typed
 * everywhere without casting.
 *
 * Import this file once (in Canvas.tsx entry) and TypeScript will pick it
 * up globally via declaration merging.
 */

/**
 * Well-known built-in slot types. Custom types are allowed via `string & {}`.
 * Add new built-ins here — both the type and KNOWN_ELITE_TYPES update automatically.
 */
export const KNOWN_ELITE_TYPES = [
  'title',
  'text',
  'tag',
  'image',
  'frame',
  'background',
  'logo',
  'code',
  'icon',
  'shape',
  'line',
  'gradient',
  'accent_line',
  'group',
] as const

export type EliteType = typeof KNOWN_ELITE_TYPES[number] | (string & {})

export type FrameFitMode = 'fill' | 'fit' | 'stretch' | 'none'

/** All custom non-serialised runtime props set on Fabric objects. */
export interface EliteObjectProps {
  eliteType?: EliteType
  eliteLabel?: string
  /** Frame shape identifier (e.g. 'circle', 'heart', 'A') */
  eliteFrameShape?: string
  /** Frame intrinsic width in canvas units */
  eliteFrameW?: number
  /** Frame intrinsic height in canvas units */
  eliteFrameH?: number
  eliteFitMode?: FrameFitMode
  /** Data-URL of the image placed inside the frame */
  eliteImageSrc?: string
  eliteImageOffsetX?: number
  eliteImageOffsetY?: number
  eliteImageScale?: number
  /** Icon SVG identifier */
  eliteIconId?: string
  /** Icon SVG path data */
  eliteIconPath?: string
  /** Runtime-only: decoded HTMLImageElement inside a frame (not serialised) */
  _eliteImageEl?: HTMLImageElement
  /** Text fill mode for text objects */
  eliteTextFillMode?: 'solid' | 'gradient' | 'texture'
  /** JSON-stringified GradientFillParams — stores gradient editor state */
  eliteGradientFill?: string
  /** JSON-stringified TextureFillParams — stores texture editor state */
  eliteTextureFill?: string
  /** Last solid fill color — restored when switching from gradient/texture back to solid */
  eliteSolidFill?: string
  /** JSON-stringified KeywordStyle — preferred highlight style for auto-generated titles */
  eliteHighlightStyle?: string
  /** Canvas globalCompositeOperation blend mode */
  eliteBlendMode?: string
}

declare module 'fabric' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface FabricObject extends EliteObjectProps {}
}
