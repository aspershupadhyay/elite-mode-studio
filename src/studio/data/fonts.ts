export interface FontEntry {
  family: string
  category: string
  weights: number[]
}

export const FONT_REGISTRY: FontEntry[] = [
  { family: 'Inter',                  category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Outfit',                 category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Poppins',                category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Montserrat',             category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Roboto',                 category: 'Sans Serif',  weights: [300, 400, 500, 700, 900] },
  { family: 'Open Sans',              category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Lato',                   category: 'Sans Serif',  weights: [300, 400, 700, 900] },
  { family: 'Nunito',                 category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Raleway',                category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Work Sans',              category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'DM Sans',                category: 'Sans Serif',  weights: [400, 500, 700] },
  { family: 'Manrope',                category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Plus Jakarta Sans',      category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Space Grotesk',          category: 'Sans Serif',  weights: [300, 400, 500, 600, 700] },
  { family: 'Sora',                   category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Geist',                  category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Rubik',                  category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Urbanist',               category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Lexend',                 category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Figtree',                category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Instrument Sans',        category: 'Sans Serif',  weights: [400, 500, 600, 700] },
  { family: 'Be Vietnam Pro',         category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Schibsted Grotesk',      category: 'Sans Serif',  weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Onest',                  category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Epilogue',               category: 'Sans Serif',  weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Bebas Neue',             category: 'Display',     weights: [400] },
  { family: 'Oswald',                 category: 'Display',     weights: [300, 400, 500, 600, 700] },
  { family: 'Anton',                  category: 'Display',     weights: [400] },
  { family: 'Righteous',              category: 'Display',     weights: [400] },
  { family: 'Black Ops One',          category: 'Display',     weights: [400] },
  { family: 'Russo One',              category: 'Display',     weights: [400] },
  { family: 'Orbitron',               category: 'Display',     weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Chakra Petch',           category: 'Display',     weights: [300, 400, 500, 600, 700] },
  { family: 'Big Shoulders Display',  category: 'Display',     weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Archivo Black',          category: 'Display',     weights: [400] },
  { family: 'Bungee',                 category: 'Display',     weights: [400] },
  { family: 'Teko',                   category: 'Display',     weights: [300, 400, 500, 600, 700] },
  { family: 'Barlow Condensed',       category: 'Display',     weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Saira Condensed',        category: 'Display',     weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Exo 2',                  category: 'Display',     weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Bai Jamjuree',           category: 'Display',     weights: [300, 400, 500, 600, 700] },
  { family: 'Syncopate',              category: 'Display',     weights: [400, 700] },
  { family: 'Squada One',             category: 'Display',     weights: [400] },
  { family: 'Audiowide',              category: 'Display',     weights: [400] },
  { family: 'Rajdhani',               category: 'Display',     weights: [300, 400, 500, 600, 700] },
  { family: 'Play',                   category: 'Display',     weights: [400, 700] },
  { family: 'Michroma',               category: 'Display',     weights: [400] },
  { family: 'Plaster',                category: 'Display',     weights: [400] },
  { family: 'Handjet',                category: 'Display',     weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Playfair Display',       category: 'Serif',       weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Merriweather',           category: 'Serif',       weights: [300, 400, 700, 900] },
  { family: 'Lora',                   category: 'Serif',       weights: [400, 500, 600, 700] },
  { family: 'Cormorant Garamond',     category: 'Serif',       weights: [300, 400, 500, 600, 700] },
  { family: 'DM Serif Display',       category: 'Serif',       weights: [400] },
  { family: 'Fraunces',               category: 'Serif',       weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'EB Garamond',            category: 'Serif',       weights: [400, 500, 600, 700, 800] },
  { family: 'Spectral',               category: 'Serif',       weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Libre Baskerville',      category: 'Serif',       weights: [400, 700] },
  { family: 'Crimson Pro',            category: 'Serif',       weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Bitter',                 category: 'Serif',       weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Instrument Serif',       category: 'Serif',       weights: [400] },
  { family: 'JetBrains Mono',         category: 'Monospace',   weights: [400, 500, 600, 700, 800] },
  { family: 'Fira Code',              category: 'Monospace',   weights: [300, 400, 500, 600, 700] },
  { family: 'Source Code Pro',        category: 'Monospace',   weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Space Mono',             category: 'Monospace',   weights: [400, 700] },
  { family: 'IBM Plex Mono',          category: 'Monospace',   weights: [300, 400, 500, 600, 700] },
  { family: 'Inconsolata',            category: 'Monospace',   weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Courier Prime',          category: 'Monospace',   weights: [400, 700] },
  { family: 'Caveat',                 category: 'Handwriting', weights: [400, 500, 600, 700] },
  { family: 'Pacifico',               category: 'Handwriting', weights: [400] },
  { family: 'Dancing Script',         category: 'Handwriting', weights: [400, 500, 600, 700] },
  { family: 'Permanent Marker',       category: 'Handwriting', weights: [400] },
  { family: 'Sacramento',             category: 'Handwriting', weights: [400] },
  { family: 'Satisfy',                category: 'Handwriting', weights: [400] },
  { family: 'Great Vibes',            category: 'Handwriting', weights: [400] },
  { family: 'Kalam',                  category: 'Handwriting', weights: [300, 400, 700] },
  { family: 'Amatic SC',              category: 'Handwriting', weights: [400, 700] },
  { family: 'Indie Flower',           category: 'Handwriting', weights: [400] },
  { family: 'Shadows Into Light',     category: 'Handwriting', weights: [400] },
  { family: 'Courgette',              category: 'Handwriting', weights: [400] },
  { family: 'Lobster',                category: 'Handwriting', weights: [400] },
  { family: 'Yellowtail',             category: 'Handwriting', weights: [400] },
]

export const FONT_CATEGORIES: string[] = [
  'Sans Serif',
  'Display',
  'Serif',
  'Monospace',
  'Handwriting',
]

// Fonts are bundled locally via @fontsource / @fontsource-variable packages.
// All @import statements live in src/assets/fonts.css which is loaded by src/index.css.
// No network requests to fonts.googleapis.com — works fully offline and in Electron.

/**
 * Fonts that have native italic variants (metadata — used by callers that
 * need to know whether real italic glyphs are available).
 */
/**
 * Fonts loaded via @fontsource-variable register as "Family Variable" in CSS,
 * NOT as "Family". Fabric.js must use the exact CSS family name or it falls back.
 */
export const VARIABLE_FONT_FAMILIES = new Set([
  // Sans Serif
  'Inter', 'Outfit', 'Montserrat', 'Open Sans', 'Nunito', 'Raleway', 'Work Sans',
  'DM Sans', 'Manrope', 'Plus Jakarta Sans', 'Space Grotesk', 'Rubik', 'Urbanist',
  'Lexend', 'Figtree', 'Instrument Sans', 'Epilogue',
  // Display
  'Oswald', 'Orbitron', 'Big Shoulders Display',
  // Serif
  'Playfair Display', 'Lora', 'Fraunces', 'Crimson Pro', 'Bitter',
  // Monospace
  'JetBrains Mono', 'Fira Code', 'Source Code Pro', 'Inconsolata',
  // Handwriting
  'Caveat', 'Dancing Script',
])

/**
 * Returns the CSS font-family name as registered in @font-face rules.
 * Variable fonts need the " Variable" suffix to match the registered name.
 */
export function getCanvasFontFamily(displayName: string): string {
  const clean = displayName.replace(/ Variable$/i, '').replace(/, sans-serif$/i, '').trim()
  return VARIABLE_FONT_FAMILIES.has(clean) ? `${clean} Variable` : clean
}

/**
 * Strips " Variable" and ", sans-serif" suffixes for display in UI.
 */
export function getDisplayFontFamily(cssFamily: string): string {
  return cssFamily.replace(/ Variable$/i, '').replace(/, sans-serif$/i, '').trim()
}

export const ITALIC_SUPPORTED = new Set([
  'Inter', 'Outfit', 'Poppins', 'Montserrat', 'Roboto', 'Open Sans', 'Lato',
  'Nunito', 'Raleway', 'Work Sans', 'DM Sans', 'Manrope', 'Plus Jakarta Sans',
  'Space Grotesk', 'Sora', 'Rubik', 'Urbanist', 'Lexend', 'Figtree',
  'Instrument Sans', 'Be Vietnam Pro', 'Onest', 'Epilogue', 'Schibsted Grotesk',
  'Barlow Condensed', 'Exo 2', 'Chakra Petch', 'Oswald', 'Teko', 'Rajdhani',
  'Playfair Display', 'Merriweather', 'Lora', 'Cormorant Garamond', 'Fraunces',
  'EB Garamond', 'Spectral', 'Libre Baskerville', 'Crimson Pro', 'Bitter',
  'JetBrains Mono', 'Fira Code', 'Source Code Pro', 'IBM Plex Mono',
  'Inconsolata', 'Courier Prime',
  'Caveat', 'Dancing Script', 'Kalam',
])

const loadedFonts = new Set<string>()

/**
 * No-op — fonts are pre-bundled via src/assets/fonts.css.
 * Kept for API compatibility with any callers that invoke loadGoogleFont().
 */
export function loadGoogleFont(_family: string): void {
  void loadedFonts // suppress unused-variable warning; set is kept for future use
}

/**
 * No-op — all popular fonts are already available from the CSS bundle.
 * Kept for API compatibility.
 */
export function preloadPopularFonts(): void {
  /* fonts pre-bundled — nothing to do */
}
