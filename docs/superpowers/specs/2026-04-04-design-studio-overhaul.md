# Design Studio Overhaul — Premium Canvas Editor

**Date:** 2026-04-04
**Status:** Approved
**Scope:** Complete redesign of the Design Studio to deliver Figma/Canva-grade UX across all subsystems.

---

## Table of Contents

1. [Canvas Feel — Figma-Grade Experience](#1-canvas-feel)
2. [Layer Panel — Accurate Element Identification](#2-layer-panel)
3. [Element Settings Persistence & Context-Aware Properties](#3-element-settings)
4. [Advanced Image Settings](#4-advanced-image-settings)
5. [Smart Snap & Grid](#5-smart-snap--grid)
6. [Export System — Native Feel, Multi-Format](#6-export-system)
7. [Font System — Offline-First + System Fonts](#7-font-system)
8. [Advanced Gradient Overlay](#8-advanced-gradient)
9. [Advanced Icon Settings](#9-advanced-icons)
10. [Hybrid Texture System](#10-hybrid-texture)
11. [Remove Deprecated Features](#11-remove-deprecated)
12. [Premium UI Polish](#12-premium-ui-polish)
13. [Dropdowns, Selection, & Everything Else](#13-everything-else)

---

## 1. Canvas Feel

**Goal:** Make the canvas feel indistinguishable from Figma/Canva in interaction quality.

### Pan & Zoom
- Trackpad pinch-to-zoom with smooth interpolation (no snapping)
- Space+drag pan with grab cursor (smooth out existing)
- Scroll wheel zoom centered on cursor position (not canvas center)
- Animated ease-out zoom transitions when using zoom controls or fit-to-screen
- Mini-map in bottom-right corner showing viewport position on large canvases

### Selection Handles
- Custom-rendered handles replacing Fabric defaults:
  - Corner handles: 8x8px white squares with 1px `zinc-400` border
  - Rotation handle: Curved arrow icon above selection (not the default circle)
  - Midpoint handles: 6x6px rectangles on edges
  - Multi-select: Dashed blue border instead of solid
  - Hover state: Light blue outline on hover before click

### Grid & Background
- Dot grid (not lines) — subtle dots at intersections, fades with zoom
- Checkerboard for transparent areas
- Toggle grid visibility from bottom toolbar
- Canvas boundary shown with subtle shadow/drop edge

### Object Manipulation
- Live resize preview (no lag/flicker during transform)
- Proportional resize by default (hold Shift to unlock aspect ratio)
- Rotation snapping at 15deg increments (hold Shift for free rotate)
- Smart distribute — equal spacing when dragging between objects
- Cursor changes: move cursor on hover, resize arrows on handles, rotation cursor near corners

---

## 2. Layer Panel

**Goal:** Layer panel always correctly identifies every element regardless of template state.

### Smart Auto-Labeling
- Text elements: Show first ~20 characters of actual text content (e.g., "The Future of AI...")
- Images: Show "Image" + filename if available, or "Pasted Image"
- Frames: Show shape name + "Frame" (e.g., "Circle Frame", "Heart Frame")
- Icons: Show icon name (e.g., "Star Icon", "Arrow Icon")
- Shapes: Show shape type (e.g., "Rectangle", "Circle", "Line")
- Gradients: "Gradient Overlay"
- Logos: "Logo" or company name if set
- Groups: "Group (N items)" with expand/collapse

### Live Label Updates
- Text layer names update in real-time as user types in canvas
- Renamed layers (via double-click) persist through save/load
- Custom names take priority over auto-labels

### Thumbnail Previews
- 24x24px thumbnail next to each layer showing visual preview
- Color swatch for solid shapes
- Mini text preview for text elements
- Image thumbnail for images/frames with loaded images

### Interaction Improvements
- Drag reorder with visible drop indicator line (not just highlight)
- Right-click context menu on layers: Rename, Duplicate, Delete, Lock, Hide, Move to Front/Back
- Multi-select layers with Cmd+Click or Shift+Click range select
- Search/filter layers when canvas has 10+ objects

### Ungroup Fix
- Fix ungroup to match Figma behavior exactly:
  - Children preserve world position after ungrouping
  - Children preserve scale and rotation
  - Children preserve visual appearance (opacity, filters composited correctly)
  - Nested groups ungroup one level at a time (not recursive)
  - Layer order preserved — children appear in same visual stacking order

---

## 3. Element Settings Persistence & Context-Aware Properties

**Goal:** Clicking any element always shows its full settings panel regardless of active tab or prior selection.

### Settings Architecture
- Single source of truth: PropertiesPanel listens to Fabric selection events
- No tab dependency: Panel content driven purely by `selectedObject.eliteType`
- Instant switch: Panel rebuilds in <16ms (single render frame)
- Multi-select: Show only shared properties with "Mixed" indicators for differing values

### Universal Effects Section (All Element Types)
Every element gets these controls:
- **Opacity** — 0-100% slider
- **Shadow** — toggle on/off:
  - Color picker
  - X/Y offset (-50 to 50)
  - Blur radius (0-50)
  - Spread (0-20)
- **Blur** — Gaussian blur 0-20px
- **Blend Mode** — dropdown: Normal, Multiply, Screen, Overlay, Darken, Lighten, Color Dodge, Color Burn, Hard Light, Soft Light, Difference, Exclusion

### Per-Element-Type Settings

| Element | Sections |
|---------|----------|
| Text | Position, TextSection, TextFillSection (solid/gradient/texture), Effects |
| Shape | Position, FillSection, StrokeSection, Effects |
| Image | Position, Image Adjustments (Section 4), StrokeSection (border), Effects |
| Frame | Position, FrameSection, StrokeSection, Effects |
| Icon | Position, IconSection (advanced), Effects |
| Logo | Position, Logo replace button, Effects |
| Gradient Overlay | Position, GradientSection (advanced), Effects |
| Group | Position, Ungroup button, Effects |
| Multi-select | Position (shared), Alignment tools, Effects (shared) |

---

## 4. Advanced Image Settings

**Goal:** Canva-level image editing with AI upscaling.

### Adjust Tab
- Brightness: -100 to 100
- Contrast: -100 to 100
- Saturation: -100 to 100
- Temperature: cool to warm (-100 to 100)
- Tint: green to magenta (-100 to 100)
- Blur: 0-20px
- Sharpness: 0-100 (unsharp mask on offscreen canvas)
- Vignette: 0-100 (darken edges)
- Reset All button

### Filters Tab (One-Click Presets)
- Presets: Grayscale, Sepia, Vintage, Warm, Cool, Dramatic, Fade, Noir, Vivid, Muted
- Each filter = preset combination of adjustments
- Intensity slider 0-100% to control filter strength

### Crop & Transform
- Free crop with drag handles
- Aspect ratio lock: Free, 1:1, 4:3, 16:9, 9:16, 3:2
- Flip horizontal / vertical
- Rotate: precise angle input + 90deg quick buttons

### AI Upscale (via Backend)
- Detect image resolution on load — show "Low resolution" warning badge if below canvas export size
- Upscale button → sends to backend → NVIDIA NIM super-resolution API
- Options: 2x, 4x
- Before/after comparison slider while processing
- Replace original with upscaled version on confirm

### Implementation
- All adjustments via CSS filters on offscreen canvas at export time
- Non-destructive: original image data always preserved
- "Reset All" restores original at any time

---

## 5. Smart Snap & Grid

**Goal:** Replace basic snapping with Figma/Canva-grade alignment system. Single accent color for all guides.

### Snap System
- Object-to-object snapping: edges, centers, midpoints of all visible objects
- Equal spacing detection: magenta distance indicators when spacing matches between 3+ objects
- Alignment guides: single accent color lines extending across full canvas
- Snap threshold: 5px (configurable in settings)
- Pixel-perfect positioning: snap to whole pixels

### Distance Indicators
- Show distance (px) between selected object and nearby objects during drag
- Labels in small rounded badges on guide lines
- Show spacing on all 4 sides simultaneously
- Single highlight color for all indicators (no color mixing)

### Smart Distribute
- Moving object between two others snaps to equal spacing
- Visual indicator shows matched distances
- Works horizontally and vertically

### Grid System
- Dot grid — subtle intersection dots that scale with zoom
- Custom grid size: 8px, 16px, 32px, etc.
- Snap-to-grid toggle — independent from object snapping
- Show/hide grid: Cmd+' shortcut and bottom toolbar toggle

### Alignment Toolbar (Multi-Select)
When 2+ objects selected:
- Align: left, center, right, top, middle, bottom
- Distribute: horizontally, vertically (equal spacing)
- Match: width, height, both

---

## 6. Export System

**Goal:** Native-feeling export with full format support.

### Export Panel
Figma-style panel triggered from toolbar — clean, not a clunky dialog.

### Scope Selection
- Selected element(s)
- Current page
- All pages (carousel)
- All generated posts (batch from Forge)

### Formats

| Format | Controls |
|--------|----------|
| PNG | Scale: 1x/2x/3x/4x. Transparent background toggle |
| JPEG | Scale: 1x/2x/3x/4x. Quality slider 1-100% |
| SVG | Outline text toggle (convert to paths for font safety) |
| PDF | Single file with all pages. Quality: Screen/Print/High |
| WEBP | Scale: 1x/2x/3x/4x. Quality slider 1-100% |

### Naming
- Auto-name: `{template_name}_{page}_{scale}.{ext}`
- Custom name: editable field with `{page}` and `{format}` tokens
- Toggle between auto and custom

### Preview & Output
- Thumbnail preview of export content
- File size estimate before download
- Multi-page/batch: shows count ("Exporting 5 files")
- Single file: direct download
- Multiple files: ZIP archive (JSZip in renderer)
- Progress bar for batch exports

---

## 7. Font System

**Goal:** Offline-first fonts with system font access. Fonts always apply correctly.

### Bundled Fonts (Offline-First)
- Bundle top 30-40 Google Fonts as `.woff2` in `assets/fonts/`
- Load via `@font-face` at app startup — zero network dependency
- Remaining registry fonts lazy-loadable from CDN as fallback

### System Fonts Access
- Electron main process scans system fonts via `font-list` package (or native `fc-list`/registry)
- Exposed via IPC: `window.api.getSystemFonts()` → `{ family, styles }[]`
- Show in font picker under "System Fonts" category
- No loading needed — already available to renderer

### Font Picker Redesign
- Categories: System Fonts | Sans Serif | Display | Serif | Mono | Handwriting
- Search bar at top — filter by name across all categories
- Recently used section (localStorage, top 10)
- Each font previewed in its own typeface
- Favorite/pin fonts — star icon, pinned fonts appear at top

### Font Application Fix
- Use `document.fonts.ready` / `FontFaceSet.load()` — apply to canvas only AFTER confirmed loaded
- Call `canvas.requestRenderAll()` after font loads
- When changing font at object level, clear all per-character `fontFamily` overrides
- When picking a font, fetch ALL available weights; if selected weight missing, snap to nearest
- Bundled + system fonts = fully offline capable
- Network fonts show cloud icon, greyed out if offline

---

## 8. Advanced Gradient

**Goal:** Canva-level gradient editor with full creative control.

### Multi-Stop Gradient Editor
- Visual gradient bar — horizontal strip showing current gradient
- Draggable color stops: click to add, drag to reposition, click+delete to remove
- Minimum 2 stops, maximum 10
- Each stop: color picker + opacity slider (0-100%) + position (0-100%)

### Gradient Types
- **Linear** — angle picker (0-360deg) with visual dial, or drag-to-set direction on canvas
- **Radial** — center point position (draggable), radius control
- **Conic** — sweep gradient around center point

### Presets
- 15-20 built-in: Sunset, Ocean, Neon, Forest, Midnight, Aurora, Fire, Pastel, Monochrome, etc.
- Save as custom preset for reuse
- Recently used: last 5 gradients quick-access

### Live Preview
- Canvas updates in real-time as user drags stops, changes angle, picks colors
- No "apply" button — all changes immediate

### Apply Modes
- **Overlay** — gradient on top of content (with opacity)
- **Fill** — gradient replaces object fill (shapes and text)
- **Background** — gradient as canvas background

---

## 9. Advanced Icons

**Goal:** Icons become fully-featured creative elements.

### Color Controls
- Multi-part recoloring: detect SVG path groups, recolor each independently
- Fill: solid or gradient (reuse gradient picker)
- Stroke color: independent from fill
- Stroke thickness: 0-10px slider

### Transform
- Precise rotation: angle input + 90deg quick buttons + free drag
- Flip: horizontal / vertical toggles
- Size presets: Small (24px), Medium (48px), Large (72px), XL (96px)
- Scale slider: continuous resize, SVG stays crisp at any size

### Effects
- Universal effects (shadow, blur, blend mode) from Section 3
- Icon-specific:
  - Glow: outer glow with color picker + radius + intensity
  - Outline: secondary outer stroke (different from SVG stroke)

### Pattern Repeat
- Duplicate as pattern: generate grid/row/column of the icon
- Options: rows x columns, spacing, alternating rotation, color variation
- Output as group for further manipulation

### Quality
- All icons remain vector (SVG paths) — no rasterization until export
- Zoom never pixelates
- Export at any scale retains crispness

---

## 10. Hybrid Texture System

**Goal:** Texture applies to whole text by default, character-level when user has text selection.

### Object-Level (No Text Selection)
- User selects text element on canvas (single click, not editing)
- Opens texture panel, picks texture/preset
- Texture applies to entire text object

### Character-Level (Text Selection Active)
- User double-clicks text to enter edit mode
- Highlights specific word(s) or letter(s)
- Opens texture panel, picks texture
- Texture applies ONLY to highlighted characters
- Rest of text keeps existing fill

### Technical Approach
- Object-level: custom `_render` override on whole textbox (current, improved)
- Character-level: store per-range params in `eliteCharTextures` custom property: `[{ start, end, params: TextureParams }]`
- During render: draw base text first, then for each textured range, render those glyphs on offscreen canvas, apply texture mask, composite back
- When user edits text (add/remove chars), shift `start/end` indices accordingly

### UX Indicators
- Textured characters show subtle dotted underline in edit mode
- Texture panel shows "Applying to: Whole text" or "Applying to: Selection (N chars)"
- Clear texture button — context-aware (selection or whole object)

### Panel Improvements
- Larger preset thumbnails showing texture on sample "Aa" text
- Custom texture upload via drag & drop
- Live preview — canvas updates as user adjusts sliders

---

## 11. Remove Deprecated Features

### Image Area (Old)
- Remove `eliteType='image_area'` from element creation in `defaults.ts`
- Remove from PropertiesPanel type detection
- Remove from LayerPanel type icons
- Remove from BottomToolbar/ToolPicker if listed
- Delete dedicated image_area files
- Backward compat: saved templates with `image_area` render as plain rectangle (no special UI)

### Keyword Style Section
- Delete `KeywordStyleSection.tsx`
- Remove `buildHighlightStyles()` from `defaults.ts`
- Remove `eliteHighlightStyle` from PropertiesPanel routing
- Remove auto-highlight logic from `content-apply.ts` — AI content applies plain text only
- Keep `eliteHighlightStyle` in `ELITE_CUSTOM_PROPS` so old templates load without errors

---

## 12. Premium UI Polish

**Goal:** Every panel, button, and interaction feels like a $50/month design tool.

### Panel Design Language
- Frosted glass panels: subtle backdrop-blur on sidebars and toolbars
- 8px grid system for all padding/margins
- Collapsible sections with smooth animation + chevron icon
- Micro-interactions: buttons scale on press (0.97), sliders have snap feel, toggles animate
- Color pickers: proper popover with spectrum + hue bar + opacity bar + hex input + recent colors
- Number inputs: scrub-to-adjust (drag left/right to change value, like Figma)
- Tooltips: clean dark tooltips on every icon button (150ms delay)

### Typography in UI
- System font stack (SF Pro on macOS, Segoe on Windows)
- 11px for labels, 12px for values, 13px for section headers
- Muted labels: `text-zinc-500` secondary, `text-zinc-200` primary

### Performance
- No layout thrashing — properties panel updates via React state only
- Debounced canvas renders — slider drags at 16ms (60fps cap)
- Virtualized layer list for 50+ objects
- Offscreen texture caching — tiles not regenerated every frame

### Empty States
- No element selected: show canvas settings + hint "Select an element to edit its properties"
- Empty canvas: centered illustration + "Add elements from the toolbar below"

---

## 13. Dropdowns, Selection, & Everything Else

### Dropdowns & Selectors
- All dropdowns: dark popover, smooth animation, keyboard navigable (arrow keys + enter), search/filter when list > 8 items
- Canvas size picker: visual cards showing size + preview ratio (Instagram Post, Story, LinkedIn, Twitter, Custom)
- Fit mode selector (frames): visual icons for fill/fit/stretch/none instead of text labels
- Blend mode dropdown: live preview thumbnail of each mode

### Selection Behavior
- Rubber band selection: drag on empty canvas draws selection rectangle (semi-transparent blue fill + border)
- Click-through locked objects: locked objects don't intercept clicks
- Deep select in groups: double-click to enter group, click children, Escape to exit
- Tab to cycle: Tab key cycles selection through canvas objects

### Frame Digits & Letters
- All A-Z and 0-9 frames get preview thumbnails in frame picker
- Categorized: Basic Shapes | Geometric | Letters | Digits
- Search by name in frame picker
- Recently used frames at top

### Context Menu (Right-Click)
- Consistent dark theme matching panels
- Full options: Cut, Copy, Paste, Duplicate, Delete, Lock/Unlock, Hide/Show, Bring Forward, Send Backward, Bring to Front, Send to Back, Group, Ungroup, Copy Style, Paste Style
- Dividers between logical groups
- Keyboard shortcut hints right-aligned

### Scrollbars
- Custom thin scrollbars: 4px wide, rounded, `zinc-700` track, `zinc-500` thumb, auto-hide

### Loading & Error States
- Skeleton loaders for heavy content (font list, textures, icons)
- Image loading: shimmer placeholder while decoding
- Error badges: broken-image icon + "Retry" on failed loads
- Upscale progress: indeterminate bar with "Enhancing..." label

### Keyboard Shortcuts
- Shortcuts panel via `Cmd+/` or toolbar help icon
- Clean modal showing all shortcuts grouped by category

### Undo/Redo
- Increase history from 50 to 100 snapshots
- History panel (optional, via toolbar): list of actions with labels ("Added text", "Moved Rectangle", "Changed font") for visual undo browsing

### Page/Template Management
- Page thumbnails in PagesPanel update live
- Drag to reorder pages
- Duplicate page button
- Delete page with confirmation
- Add blank page + Add from template options

---

## Files Affected

### New Files
- `assets/fonts/*.woff2` — bundled font files (30-40 fonts)
- `src/studio/editor/properties/EffectsSection.tsx` — universal shadow/blur/blend
- `src/studio/editor/properties/ImageAdjustSection.tsx` — image adjustments + filters
- `src/studio/editor/properties/GradientEditor.tsx` — multi-stop gradient editor
- `src/studio/editor/ExportPanel.tsx` — new export panel
- `src/studio/editor/ShortcutsModal.tsx` — keyboard shortcuts reference
- `src/studio/editor/HistoryPanel.tsx` — visual undo history
- `src/studio/canvas/grid.ts` — dot grid rendering + snap-to-grid
- `src/studio/data/gradient-presets.ts` — built-in gradient presets
- `src/studio/data/filter-presets.ts` — image filter presets
- `backend/routes/upscale.py` — NVIDIA NIM super-resolution endpoint

### Modified Files
- `src/studio/editor/Canvas.tsx` — handle overhaul, zoom/pan smoothing, selection behavior
- `src/studio/editor/PropertiesPanel.tsx` — restructure for context-aware settings + effects
- `src/studio/editor/LayerPanel.tsx` — smart labels, thumbnails, ungroup fix, search
- `src/studio/editor/Toolbar.tsx` — export button → ExportPanel, history panel toggle
- `src/studio/editor/BottomToolbar.tsx` — grid toggle, remove image_area tool
- `src/studio/editor/ContextMenu.tsx` — expanded options, dark theme, shortcuts display
- `src/studio/editor/properties/TextSection.tsx` — font picker redesign
- `src/studio/editor/properties/IconSection.tsx` — advanced controls
- `src/studio/editor/properties/FillSection.tsx` — gradient editor integration
- `src/studio/editor/properties/texture/engine.ts` — per-character texture rendering
- `src/studio/editor/properties/texture/TexturePanel.tsx` — hybrid mode UI
- `src/studio/canvas/snapping.ts` — rewrite for equal spacing + distance indicators
- `src/studio/canvas/defaults.ts` — remove image_area, remove buildHighlightStyles
- `src/studio/canvas/frames/frame-shapes.ts` — categorized picker data
- `src/studio/components/GuideOverlay.tsx` — single accent color, distance badges
- `src/studio/components/PagesPanel.tsx` — live thumbnails, reorder, duplicate
- `src/studio/data/fonts.ts` — bundled + system font integration
- `src/studio/editor/canvas-core/fabric-init.ts` — custom handle rendering
- `src/studio/editor/canvas-core/event-bindings.ts` — hover states, rubber band, deep select
- `src/studio/editor/canvas-core/keyboard.ts` — Tab cycle, Cmd+/ shortcuts modal
- `src/types/canvas.ts` — new types for effects, image adjustments, gradient stops
- `main.ts` — IPC handler for system fonts
- `preload.ts` — expose `getSystemFonts` API
- `src/types/ipc.ts` — new IPC channel types

### Deleted Files
- `src/studio/editor/properties/KeywordStyleSection.tsx`
- Any standalone image_area files (if they exist)

---

## Constraints & Non-Goals

### Constraints
- All image adjustments are non-destructive (original data preserved)
- Font system must work fully offline (bundled + system fonts)
- Export must handle large canvases (4x scale) without crashing — use offscreen canvas
- Texture per-character must not break text editing flow
- Backward compatibility: old templates with `image_area` or `eliteHighlightStyle` must still load

### Non-Goals (Future Work)
- Brand kit tab (separate project, planned for later)
- Collaborative editing
- Cloud template storage
- Video/animation export
- AI auto-layout suggestions

