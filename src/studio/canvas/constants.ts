/**
 * constants.ts — Design Studio canvas tokens
 *
 * BG/text/surface values are hardcoded intentionally — they define the
 * canvas drawing surface, not the app chrome. Only the accent color
 * responds to the Appearance theme because accent is the only color that
 * appears on user-created canvas objects.
 */

// ── Canvas surface colours ────────────────────────────────────────────────────
export const BG: string          = '#111111'  // canvas background
export const TEXT_PRIMARY: string = '#EAEAEA'  // default text fill
export const TEXT_MUTED: string   = '#777777'  // secondary / subtitle text
export const SURFACE: string      = '#1A1A1A'  // default shape fill

// ── Elite Mode brand color ────────────────────────────────────────────────────
// Fixed — never changes with the Appearance accent theme.
// Used for the logo seal + accent line so brand identity stays consistent.
export const EM_BRAND_COLOR: string = '#0BDA76'

// ── Custom property keys serialised into every Fabric object ─────────────────
// eliteType  → identifies the semantic role  (used by applyGeneratedContent)
// eliteLabel → human-readable label shown in the Layer panel
export const ELITE_CUSTOM_PROPS: string[] = [
  'eliteType', 'eliteLabel',
  // Frame-specific
  'eliteFrameShape', 'eliteFrameW', 'eliteFrameH',
  'eliteFitMode', 'eliteImageSrc',
  'eliteImageOffsetX', 'eliteImageOffsetY', 'eliteImageScale',
  // Icon-specific
  'eliteIconId', 'eliteIconPath',
  // Text fill mode
  'eliteTextFillMode', 'eliteGradientFill', 'eliteTextureFill', 'eliteSolidFill',
  // Effects
  'eliteBlendMode',
  // Gradient overlay config
  'eliteGradColor', 'eliteGradDir', 'eliteGradStrength',
  // Stable persistent element ID (smart layer naming)
  'eliteId',
]

// ── Accent colour (theme-aware) ───────────────────────────────────────────────
// Reads the live CSS custom property so Appearance changes propagate here.
// Falls back to the default EliteMode green if the variable isn't set.
export function getAccentColor(): string {
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue('--green').trim()
    return v || '#0BDA76'
  } catch {
    return '#0BDA76'
  }
}
