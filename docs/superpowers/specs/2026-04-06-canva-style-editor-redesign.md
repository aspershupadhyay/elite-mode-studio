# Canva-Style Editor Redesign

**Date:** 2026-04-06
**Approach:** Incremental Reskin (A) + Feature Parity (C)
**Scope:** Visual/UI overhaul of the Design Studio to match Canva's look, feel, and workflow. Preserve all existing Fabric.js engine, content injection pipelines, and session persistence.

---

## 1. Overall Layout

```
+-----------------------------------------------------------+
|  Context Toolbar (48px, top)                               |
|  [EM] [File] [Resize] | context tools | [Undo][Redo][Export]|
+--+------------------------------------------------+-------+
|  |                                                 |       |
|I |                                                 | Props |
|c |         Workspace (#2b2b2b)                     | Panel |
|o |                                                 |(280px)|
|n |        +--------------------+                   |(only  |
|  |        |                    |                   | when  |
|T |        |   Design Card      |                   |select)|
|a |        |   (zoom only here) |                   |       |
|b |        |                    |                   |       |
|s |        +--------------------+                   |       |
|  |        [+ Add page] [v]                         |       |
|56|                                                 |       |
|px|                                                 |       |
|  |                                                 |       |
|P |                                                 |       |
|a |                                                 |       |
|n |                                                 |       |
|e |                                                 |       |
|l |                                                 |       |
+--+------------------------------------------------+-------+
|  Status Bar: [Notes][Timer] ... zoom slider 40% [Pages][1/1][grid][fs] |
+-----------------------------------------------------------+
```

- Left: 56px icon strip (always visible) + 240px expandable panel
- Top: 48px context-sensitive toolbar
- Right: 280px properties panel (contextual, slides in on selection)
- Bottom: Status bar with zoom controls. Page thumbnail strip toggleable.
- Center: Workspace fills remaining space, card centered with drop shadow

## 2. Left Sidebar

### Icon Strip Tabs (56px wide, vertical)

| Order | Icon | Tab | Content |
|-------|------|-----|---------|
| 1 | Grid | Templates | Built-in + saved template gallery with filter tabs |
| 2 | Type | Text | Add heading/subheading/body, font presets |
| 3 | Square | Elements | Shapes, lines, frames, icons (consolidated) |
| 4 | Image | Uploads | Drag-drop upload area, recent images list |
| 5 | Layers | Layers | Layer tree (existing LayerPanel functionality) |

### Behavior
- Click tab: expands 240px panel with that tab's content
- Click active tab: collapses panel (toggle)
- Smooth slide animation
- Panel header: tab name + search bar where relevant
- Templates tab reuses existing template gallery (built-in + My Saved)
- Elements tab consolidates shapes, frames, and icons into one browsable panel
- Layers tab wraps existing LayerPanel with eye/lock/drag-reorder

## 3. Context Toolbar (48px)

Changes dynamically based on selection state:

### Nothing selected (page tools)
```
[EM Logo] [File v] [Resize v] | Page title (editable) | [Undo] [Redo] | [Export v]
```

### Text selected
```
[Font family v] [Size v] [B] [I] [U] [Color] [Align v] [Spacing v] [Effects v] | [Undo] [Redo]
```
- Merges existing FloatingTextToolbar functionality
- Font family/size from existing text-toolbar pills

### Image/Shape selected
```
[Color] [Border v] [Opacity v] [Position v] [Flip v] [Crop] | [Undo] [Redo]
```

### Frame selected
```
[Fit mode v] [Replace image] [Flip v] [Opacity v] | [Undo] [Redo]
```

### Fixed elements (always visible, pinned right)
- Undo / Redo buttons
- Export dropdown

### Dropdowns
- Each opens a small popover, not a modal
- File menu: Save, Save as template, Download, Canvas size

## 4. Bottom Page Strip (Hybrid)

### Two modes toggled by "Pages" button in status bar:

#### Mode A: Strip Hidden (default for 1 page)
- No thumbnail strip
- Below design card: "+ Add page" button with dropdown chevron
- Above card (top-right): floating action icons on hover (lock, duplicate, export)
- Status bar: `[Notes] [Timer] ... zoom slider ... 40% [Pages] [1/1] [grid] [fullscreen]`

#### Mode B: Strip Visible (auto for 2+ pages, or manual toggle)
- ~90px tall horizontal thumbnail strip
- Active page: purple/blue border with page number
- Inactive: thumbnail previews (always rendered, not lazy)
- Hover thumbnail: duplicate/delete overlay
- Drag thumbnails to reorder
- [+] at the end to add page
- Zoom slider in status bar row

### Auto behavior
- 1 page: strip hidden by default
- 2+ pages: strip auto-shows
- User can manually toggle with "Pages" button regardless
- Smooth slide up/down animation

## 5. Workspace & Card

### Workspace
- Background: dark neutral (#2b2b2b), never zooms or scales
- Card always centered in available workspace
- Soft drop shadow around card

### Zoom
- Zoom only scales the card (Fabric canvas), workspace stays static
- Range: 10% to 500%
- Controls: Ctrl+scroll, pinch, slider, +/- buttons, fit-to-screen
- Fit-to-screen: auto-calculates zoom so card fits with padding
- Zoomed in: space+drag or middle-mouse to pan

### Card boundary
- Objects outside card boundary visually clipped but still selectable
- Subtle edge indicator at page boundary
- Overflow portions dimmed/faded

## 6. Right Properties Panel (Contextual)

### Behavior
- Hidden when nothing selected (workspace gets full width)
- Slides in (280px) when object selected
- Smooth animation, pushes workspace (not overlay)
- Closes when clicking empty canvas

### Content by selection type

**Text:** Position & Size, Opacity, Text Fill (solid/gradient/texture), Stroke, Effects (shadow, blur, blend)

**Image/Shape:** Position & Size, Fill color, Stroke, Opacity, Effects

**Frame:** Position & Size, Fit mode, Image offset & scale, Opacity, Effects

**Group:** Position & Size, Opacity

- Each section collapsible with chevron
- Only relevant sections shown

## 7. Preserved Integrations (NO CHANGES)

### Content injection (canvas-core/content-apply.ts)
- `applyGeneratedContent()` -- legacy path
- `applyGeneratedContentFromSchema()` -- schema-aware path
- `applyGeneratedContentFromProfile()` -- profile-aware path
- `injectGeneratedImage()` -- image injection with priority heuristic
- All three paths and image injection completely untouched

### Batch rendering pipeline
- `pendingBatch` flow in DesignStudio
- Background pre-rendering pages 1..N
- Page status: pending -> images_ready -> rendered
- Abort on user navigation

### Session persistence
- `SessionData` save/restore via IPC
- Auto-save debounce (1s)
- Full state: pages, zoom, pan, active page index

### Canvas internals
- `Canvas.tsx` and `CanvasHandle` API -- no changes
- All `canvas-core/` modules -- untouched
- Snapping, clipboard, frames, auto-format -- kept
- `ELITE_CUSTOM_PROPS` serialization -- unchanged

### Template system
- Backend CRUD API unchanged
- Gallery moves to left sidebar Templates tab

## 8. Files Changed vs Preserved

### Changed (reskinned/restructured)
| File | Change |
|------|--------|
| `src/pages/studio/DesignStudio.tsx` | Layout restructured for new shell |
| `src/studio/editor/Toolbar.tsx` | Replaced with ContextToolbar |
| `src/studio/editor/PropertiesPanel.tsx` | Made contextual (slide in/out) |
| `src/studio/editor/LayerPanel.tsx` | Moved into left sidebar Layers tab |
| `src/studio/components/PageScrollView.tsx` | Replaced with bottom strip + Add page |
| `src/studio/editor/BottomToolbar.tsx` | Zoom controls move to status bar |
| `src/studio/editor/ExportPanel.tsx` | Triggered from toolbar, stays as modal |
| `src/studio/editor/FloatingTextToolbar.tsx` | Merged into text context toolbar |

### New components
| Component | Purpose |
|-----------|---------|
| `CanvaShell.tsx` | New layout shell (sidebar + toolbar + workspace + strip) |
| `IconSidebar.tsx` | 56px vertical icon strip |
| `SidebarPanel.tsx` | 240px expandable panel container |
| `ContextToolbar.tsx` | Dynamic top toolbar |
| `PageStrip.tsx` | Bottom thumbnail strip |
| `StatusBar.tsx` | Bottom bar with zoom + page toggle |
| `TemplatesTab.tsx` | Templates panel for sidebar |
| `TextTab.tsx` | Text presets panel for sidebar |
| `ElementsTab.tsx` | Shapes/frames/icons panel for sidebar |
| `UploadsTab.tsx` | Image upload panel for sidebar |
| `WorkspaceArea.tsx` | Canvas workspace with centering + shadow |

### Untouched
- `src/studio/editor/Canvas.tsx`
- `src/studio/editor/canvas-core/*` (all modules)
- `src/studio/canvas/*` (snapping, clipboard, frames, etc.)
- `src/studio/editor/ContextMenu.tsx` (restyled only)
- `src/studio/editor/properties/*` (all sections reused inside new panel)
- `src/studio/text/*` (all text utilities)
- `src/studio/data/*` (templateStorage, canvasSizes, fonts)
- `src/types/*` (all type definitions)

## 9. Visual Design

- Clean, modern aesthetic matching Canva
- Dark workspace background (#2b2b2b)
- Light panels/toolbar (#ffffff or #f5f5f5)
- Consistent 8px spacing grid
- Rounded corners (8px) on panels and cards
- Subtle shadows for depth
- Lucide React icons throughout
- Smooth transitions (200ms ease) for panel show/hide
- Active tab: accent color highlight
- Hover states on all interactive elements
