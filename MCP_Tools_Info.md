# CreatorOS Design Studio — MCP Tools Reference

## Server Config

- **Server name:** `creatoros-design-studio`
- **Transport:** stdio (Claude Code via `.mcp.json`) or HTTP/SSE (`node mcp/dist/server.js --http` → `http://localhost:3100/mcp`)
- **Entry:** `mcp/dist/server.js` (compiled from `mcp/server.ts`)
- **Bridge ports:**
  - `8001` — canvas/app IPC bridge (Electron renderer ↔ MCP)
  - `8000` — Python FastAPI backend (image gen, design-brief, assets)

**.mcp.json** sits in the project root and registers the server for Claude Code. All 70+ low-level canvas ops are in `alwaysAllow` so Claude never has to prompt for permission on routine actions.

---

## How the Bridge Works

```
AI (Claude / ChatGPT / Perplexity)
        ↓  MCP tool call
mcp/server.ts  (Node.js stdio or HTTP)
        ↓  HTTP POST :8001/canvas-command  or  /app-command
Electron main process (main.ts)
        ↓  IPC  canvas:command
React renderer (canvasBridge.ts)
        ↓  calls handler in commandHandlers*.ts
Fabric.js canvas (Canvas.tsx)
```

For image generation, the server also talks directly to the Python backend at `:8000`.

---

## The 16 Public MCP Tools

### 1. `create_element`
Add any element to the canvas in one call.

| param | type | notes |
|-------|------|-------|
| `type` | enum | `text` `title` `subtitle` `tag` `shape` `accent_line` `gradient_overlay` `logo` `frame` `icon` |
| `text` | string | content for text types |
| `shape` | string | `rect` `circle` `triangle` `star` `pentagon` `hexagon` `diamond` `arrow` `line` |
| `label` | string | required for frames (used by `generate_image target_frame`) |
| `x y width height` | number | pixel position/size |
| `color` | string | text/icon hex |
| `fill` | string | shape fill hex |
| `fontSize fontFamily fontWeight textAlign opacity` | mixed | text styling |

---

### 2. `update_element`
Update any property of an existing element in a single round-trip. Pass `label` or `index` to auto-select first.

Key param groups:
- **Position/size:** `x y width height`
- **Appearance:** `fill opacity corner_radius rotate flip`
- **Stroke:** `{ color, width }`
- **Typography:** `{ family, size, weight, style, align, underline, letter_spacing, line_height, color, case }`
- **Effects:** `shadow { color, blur, offsetX, offsetY }`, `blur` (0-100), `gradient`, `frame_fit`
- **Highlights:** `[{ word, color, bold }]` — per-word color on text
- **Layer:** `z_order` — `front` `back` `forward` `backward`
- **State:** `visible locked`

---

### 3. `select_elements`
Select one or more elements before editing.

| `by` value | effect |
|-----------|--------|
| `label` | select by eliteLabel |
| `index` | select by layer index (0=bottom) |
| `indices` | multi-select array of indices |
| `none` | deselect all |

---

### 4. `arrange_elements`
Layer order, alignment, grouping, delete. Select elements first.

| `action` | effect |
|----------|--------|
| `front` `back` `forward` `backward` | layer order |
| `align` | align to canvas edge/center (`alignment`: left/center/right/top/middle/bottom) |
| `distribute` | space evenly (`direction`: horizontal/vertical) |
| `group` `ungroup` | group/ungroup selection |
| `duplicate` `delete` | copy or remove |

---

### 5. `query_canvas`
Read canvas state before editing.

| `what` | returns |
|--------|---------|
| `elements` | all elements on current page (label, type, x, y, w, h, fill, font…) |
| `all_pages` | elements + state for every page in one call |
| `selected` | currently active element |
| `state` | canvas size, background, zoom |
| `json` | raw Fabric.js JSON |
| `fonts` | full font registry |
| `icons` | full icon library |

---

### 6. `manage_page`
Create/navigate carousel pages.

| `action` | effect |
|----------|--------|
| `list` | all pages with index, label, isActive |
| `add` | append blank page (pass `index` to insert at position) |
| `switch` | go to page by `index` |
| `rename` | set `name` on page at `index` |
| `duplicate` | copy page at `index` |
| `delete` | remove page at `index` |

Response includes `activePageIndex` and `pageCount`.

---

### 7. `canvas_settings`
Configure canvas in one call. Only pass what you want to change.

| param | effect |
|-------|--------|
| `background` | hex color |
| `width height` | resize canvas (px) |
| `zoom` | number=percent or `"fit"` to reset zoom |
| `clear` | true = remove all elements |
| `export` | true = export PNG (returns base64 data URL) |
| `accent_color` | global brand accent hex |
| `theme` | `"dark"` or `"light"` |

> To reset a wild zoom (e.g. 4100%), call `canvas_settings zoom="fit"`.

---

### 8. `history`
| `action` | effect |
|----------|--------|
| `undo` | revert last action |
| `redo` | re-apply |

---

### 9. `generate_image`
Generate one AI image and place it on canvas.

| `provider` | speed | requires |
|-----------|-------|---------|
| `fal` | 3-10s sync | `FAL_API_KEY` in `backend/.env` |
| `openai` | 5-15s sync | `OPENAI_API_KEY` |
| `stability` | 10-20s sync | `STABILITY_API_KEY` |
| `chatgpt` | async (~2ms, fire-and-forget) | ChatGPT browser tab open |

Key params: `prompt`, `provider`, `target_frame` (frame label to fill), `replace_label`, `x y w h` (standalone placement).

For chatgpt: returns `job_id` immediately. Poll with `app_control action="job_status" job_id="..."`.

---

### 9b. `batch_generate_images`
Generate 2+ images in one call. API providers run in parallel.

Each item in `images[]`: `{ prompt, provider, target_frame, replace_label, page_index, x, y, w, h }`.

`page_index` auto-switches pages before placing each image.

---

### 10. `app_control`
Navigate the app, manage settings.

| `action` | effect |
|----------|--------|
| `navigate` | switch to page: `forge` `studio` `web` `doc` `templates` `history` `settings` |
| `get_state` | current page + theme |
| `settings` | check which API keys are configured |
| `save_keys` | write `nvidia_key`, `tavily_key`, `chatgpt_url` to `.env` |
| `appearance` | set `theme`: dark/light |
| `check_providers` | which image AI providers are ready (have keys) |
| `job_status` | poll chatgpt async image job by `job_id` |

---

### 11. `design_from_brief`
AI layout engine. Describe the design in plain English, NVIDIA NIM generates a complete layout plan and executes it.

| param | notes |
|-------|-------|
| `brief` | natural-language description (required) |
| `canvas_width canvas_height` | defaults to 1080x1350 |
| `background` | override background hex |
| `dry_run` | return plan JSON without executing |

Internally calls `POST /api/design-brief` on the Python backend (uses `meta/llama-3.3-70b-instruct`).

---

### 11b. `upload_asset`
Ingest a user-uploaded image, logo, or font into the canvas asset system.

| param | notes |
|-------|-------|
| `url` | HTTP/HTTPS URL of the asset |
| `base64` | base64 blob (alternative to url) |
| `filename` | e.g. `logo.png` (for extension detection) |
| `type` | `image` `logo` `font` — `logo` auto-saves to brand_kit |

Returns `{ asset_id, canvas_url }`. Use `canvas_url` in `create_element`, `generate_image target_frame`, or `brand_kit logo_url`.

Assets are saved to `DATA_DIR/assets/` and served at `http://127.0.0.1:8000/api/assets/files/<id>`.

---

### 12. `build_carousel`
Build a multi-page carousel in one call. Each slide becomes its own page.

```jsonc
{
  "slides": [
    {
      "background": "#111111",
      "elements": [
        { "type": "shape", "shape": "rect", "fill": "#222", "x": 0, "y": 0, "width": 1080, "height": 1350, "zIndex": "back" },
        { "type": "title", "text": "SLIDE 1", "x": 48, "y": 120, "width": 984, "color": "#fff", "fontSize": 120 },
        { "type": "subtitle", "text": "Caption here", "x": 48, "y": 280, "width": 600, "auto_fit_text": true }
      ]
    }
  ],
  "reset_pages": true
}
```

**Element extras (beyond create_element):**

| param | effect |
|-------|--------|
| `zIndex` | `"back"` `"front"` `"forward"` `"backward"` — set layer order immediately after creation |
| `auto_fit_text` | `true` = auto-scale font to fit `width`/`height` |
| `letterSpacing` | defaults to `0` (prevents Bebas Neue wide spacing at large sizes) |

**Response includes:**
- `totalPages` — actual page count in canvas (not just slides in this call)
- `activePageIndex` — which page is active after build
- `results[].overlapWarnings` — when a shape fully covers a text element
- `tip` — only shown when `reset_pages` was not used

**Flags:**
- `reset_pages: true` — delete all extra pages, clear and relabel page 0 to "Page 1", then build. Use this every time you rebuild.

---

### 13. `brand_kit`
Store and apply brand identity.

| `action` | effect |
|----------|--------|
| `set` | save `colors[]`, `font_family`, `font_weight`, `logo_url` |
| `get` | read current brand kit |
| `apply` | apply saved kit to all canvas elements |

---

### 14. `template_ops`
Persist canvas layouts across sessions via backend database.

| `action` | notes |
|----------|-------|
| `save` | save current canvas as template with `name` |
| `load` | load by `id` or `name` |
| `list` | all saved templates |
| `delete` | remove by `id` |

---

### 15. `fit_text`
Auto-scale a text element's font size to fill a bounding box.

Params: `label` (or select first), `max_width`, `max_height`, `min_font` (default 8), `max_font` (default 200).

Uses binary search (20 iterations) — precise and fast.

---

### 16. `validate_design`
Check the current page for issues:
- WCAG contrast ratio for all text vs background (warns below 3:1)
- Safe-zone violations (elements within 48px of canvas edge)

Returns `warnings[]`, `passed[]`, and a summary string.

---

## Internal Canvas Commands (via bridge — not directly callable by AI)

These are the low-level commands that the 16 public tools dispatch to via the bridge. They're listed in `.mcp.json → alwaysAllow` for automatic permission.

```
add_text / add_title / add_subtitle / add_tag / add_shape / add_frame /
add_accent_line / add_gradient_overlay / add_logo / add_icon /
set_background / set_canvas_size / set_zoom / zoom_to_fit /
get_canvas_state / get_elements / get_selected / get_canvas_json / export_png /
select_by_label / select_by_index / select_multiple / deselect /
set_position / set_size / set_fill / set_opacity / set_stroke / set_corner_radius /
set_text_content / set_font_family / set_font_size / set_font_weight /
set_font_style / set_text_align / set_underline / set_letter_spacing /
set_line_height / set_text_case / set_text_color /
highlight_words / clear_word_highlights /
bring_to_front / send_to_back / bring_forward / send_backward /
flip_horizontal / flip_vertical / toggle_lock / toggle_visibility /
delete_selected / duplicate_selected / group_selected / ungroup_selected /
set_gradient / set_frame_fit / update_accent_color /
rotate_element / set_shadow / set_blur / align_elements / distribute_elements /
generate_image (canvas) / replace_image / place_image_from_url /
update_element / brand_kit / template_ops / fit_text / validate_design /
execute_design_plan / build_carousel_page / assign_elite_id /
add_canvas_page / switch_canvas_page / delete_canvas_page /
duplicate_canvas_page / rename_canvas_page / get_canvas_pages /
undo / redo / clear_canvas / list_fonts / list_icons /
navigate_to / get_app_state / get_settings / save_api_keys /
update_appearance / set_chatgpt_url
```

---

## File Map

| File | Role |
|------|------|
| `mcp/server.ts` | MCP server — tool definitions, dispatch, bridge HTTP calls |
| `src/studio/mcp/canvasBridge.ts` | IPC listener in renderer — routes commands to handlers, owns page ops |
| `src/studio/mcp/commandHandlers.ts` | Basic canvas ops (add, select, style, transform) |
| `src/studio/mcp/commandHandlersAdvanced.ts` | Advanced ops (multi-select, shadow, blur, align, image gen) |
| `src/studio/mcp/commandHandlersConsolidated.ts` | `update_element` + `place_image_from_url` |
| `src/studio/mcp/commandHandlersDesign.ts` | `brand_kit` `template_ops` `fit_text` `validate_design` `build_carousel_page` |
| `backend/api.py` | Python FastAPI — `/api/design-brief`, `/api/generate-image`, `/api/assets/ingest` |
| `.mcp.json` | Claude Code registration + alwaysAllow list |
