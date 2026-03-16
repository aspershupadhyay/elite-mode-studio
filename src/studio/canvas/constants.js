/**
 * constants.js — Design Studio canvas tokens
 *
 * BG/text/surface values are hardcoded intentionally — they define the
 * canvas drawing surface, not the app chrome. Only the accent color
 * responds to the Appearance theme because accent is the only color that
 * appears on user-created canvas objects.
 */

// ── Canvas surface colours ────────────────────────────────────────────────────
export const BG           = '#111111'  // canvas background
export const TEXT_PRIMARY  = '#EAEAEA'  // default text fill
export const TEXT_MUTED    = '#777777'  // secondary / subtitle text
export const SURFACE       = '#1A1A1A'  // default shape fill

// ── Custom property keys serialised into every Fabric object ─────────────────
// eliteType  → identifies the semantic role  (used by applyGeneratedContent)
// eliteLabel → human-readable label shown in the Layer panel
export const ELITE_CUSTOM_PROPS = [
  'eliteType', 'eliteLabel',
  // Frame-specific
  'eliteFrameShape', 'eliteFrameW', 'eliteFrameH',
  'eliteFitMode', 'eliteImageSrc',
  'eliteImageOffsetX', 'eliteImageOffsetY', 'eliteImageScale',
  // Icon-specific
  'eliteIconId', 'eliteIconPath',
]

// ── Accent colour (theme-aware) ───────────────────────────────────────────────
// Reads the live CSS custom property so Appearance changes propagate here.
// Falls back to the default EliteMode green if the variable isn't set.
export function getAccentColor() {
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue('--green').trim()
    return v || '#0BDA76'
  } catch {
    return '#0BDA76'
  }
}
