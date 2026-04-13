#!/usr/bin/env node
/**
 * CreatorOS Design Studio MCP Server — v3 (10-tool consolidated API)
 *
 * Best-practice MCP design: 10 grouped tools replace 75 fine-grained ones.
 *   - Reduces model confusion and wrong-tool selection
 *   - Eliminates sequential round-trips (update_element applies N props in 1 call)
 *   - Optimised for Claude, ChatGPT, Perplexity, and any MCP-compatible client
 *
 * Transports:
 *   stdio (default)  — used by Claude Code (.mcp.json)
 *   HTTP/SSE         — used by web AIs: node mcp/dist/server.js --http
 *                      Endpoint: http://localhost:3100/mcp
 *
 * Bridge:  HTTP POST to localhost:8001/canvas-command  (canvas ops)
 *          HTTP POST to localhost:8001/app-command     (app/navigation ops)
 *          HTTP POST to localhost:8000/api/generate-image (AI image gen APIs)
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import http from 'http'
import { randomUUID } from 'crypto'

const BRIDGE_PORT   = 8001
const BACKEND_PORT  = 8000
const MCP_HTTP_PORT = 3100

// ── HTTP bridge helpers ────────────────────────────────────────────────────

function bridgePost(
  hostname: string,
  port: number,
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 30_000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const raw = JSON.stringify(body)
    const req = http.request(
      { hostname, port, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } },
      (res) => {
        let data = ''
        res.on('data', (c: Buffer) => { data += c.toString() })
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as { success?: boolean; data?: unknown; error?: string; url?: string; detail?: string }
            // Canvas/app bridge wraps response: { success, data, error }
            // Backend returns raw JSON
            if ('success' in json) {
              if (json.success) resolve(json.data ?? null)
              else reject(new Error(json.error ?? 'command failed'))
            } else {
              if (json.detail) reject(new Error(json.detail))
              else resolve(json)
            }
          } catch { reject(new Error(`invalid response: ${data.slice(0, 200)}`)) }
        })
      },
    )
    req.on('error', (e) => reject(new Error(`service unavailable — is CreatorOS running? (${e.message})`)))
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('request timed out')) })
    req.write(raw)
    req.end()
  })
}

function callCanvas(tool: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const ms = tool === 'generate_image' || tool === 'place_image_from_url' ? 360_000 : 30_000
  return bridgePost('127.0.0.1', BRIDGE_PORT, '/canvas-command', { requestId: randomUUID(), tool, params }, ms)
}

function callApp(tool: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return bridgePost('127.0.0.1', BRIDGE_PORT, '/app-command', { requestId: randomUUID(), tool, params })
}

function callBackend(path: string, body: Record<string, unknown> = {}, timeoutMs = 90_000): Promise<unknown> {
  return bridgePost('127.0.0.1', BACKEND_PORT, path, body, timeoutMs)
}

function callBackendGet(path: string, timeoutMs = 10_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: BACKEND_PORT, path, method: 'GET',
        headers: { 'Accept': 'application/json' } },
      (res) => {
        let data = ''
        res.on('data', (c: Buffer) => { data += c.toString() })
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as { detail?: string }
            if (json.detail) reject(new Error(json.detail))
            else resolve(json)
          } catch { reject(new Error(`invalid response: ${data.slice(0, 200)}`)) }
        })
      },
    )
    req.on('error', (e) => reject(new Error(`service unavailable (${e.message})`)))
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('request timed out')) })
    req.end()
  })
}

function ok(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

// ── Image job store (fire-and-forget for chatgpt provider) ─────────────────

type JobStatus = 'queued' | 'running' | 'done' | 'error'
interface JobRecord {
  status:    JobStatus
  prompt:    string
  provider:  string
  createdAt: number
  result?:   unknown
  error?:    string
}

const imageJobStore = new Map<string, JobRecord>()

function pruneOldJobs(): void {
  const cutoff = Date.now() - 10 * 60 * 1000
  for (const [id, job] of imageJobStore) {
    if (job.createdAt < cutoff) imageJobStore.delete(id)
  }
}

// ── Tool definitions (10 tools) ────────────────────────────────────────────
//
// Positioning guide for AI:
//   Canvas origin (0,0) = top-left. Standard IG Feed = 1080x1350 px.
//   x, y = top-left of the element bounding box.
//   Center horizontally: x = (canvasW - width) / 2

const TOOLS: Tool[] = [
  // ── 1. create_element ─────────────────────────────────────────────────
  {
    name: 'create_element',
    description: [
      'Add a new element to the canvas.',
      'type="text" — plain text; "title" — large bold headline (default 72px); "subtitle" — medium subheading (26px);',
      '"tag" — small accent-colored hashtag/label; "shape" — geometric shape (rect/circle/triangle/star/...);',
      '"accent_line" — brand-color bar (great at canvas bottom); "gradient_overlay" — transparent-to-color fade;',
      '"logo" — brand logo seal; "frame" — image placeholder; "icon" — SVG icon.',
      'FRAME RULE: always pass label="hero-img" (or similar) when creating frames — this label is required by generate_image target_frame. Without it a unique name is auto-assigned but you must read it back.',
      'All elements accept optional x/y/width/height for precise placement.',
      'LAYOUT TIPS: title at y=80, x=48. subtitle at y=title_y+title_h+24. tag at y=canvasH-80. accent_line at y=canvasH-6.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['text','title','subtitle','tag','shape','accent_line','gradient_overlay','logo','frame','icon'],
          description: 'Element type to create',
        },
        text:          { type: 'string',  description: 'Text content (text/title/subtitle/tag)' },
        shape:         { type: 'string',  description: 'Shape geometry: rect/circle/triangle/star/pentagon/hexagon/diamond/arrow/line (type="shape" only)' },
        label:         { type: 'string',  description: 'REQUIRED for frames — unique name used by generate_image target_frame. E.g. "hero-photo", "product-img". For icons: icon name e.g. "star", "heart". Auto-generated as "Frame-N" if omitted for frames.' },
        x:             { type: 'number',  description: 'Left edge X in canvas px' },
        y:             { type: 'number',  description: 'Top edge Y in canvas px' },
        width:         { type: 'number',  description: 'Element width in pixels' },
        height:        { type: 'number',  description: 'Element height in pixels' },
        color:         { type: 'string',  description: 'Text/icon color hex e.g. "#FFFFFF"' },
        fill:          { type: 'string',  description: 'Shape fill color hex' },
        fontSize:      { type: 'number',  description: 'Font size in px (text elements)' },
        fontFamily:    { type: 'string',  description: 'Font name e.g. "Bebas Neue"' },
        fontWeight:    { type: 'string',  description: 'Font weight "400"–"900" or "bold"' },
        textAlign:     { type: 'string',  enum: ['left','center','right','justify'] },
        opacity:       { type: 'number',  description: 'Opacity 0.0–1.0' },
      },
      required: ['type'],
    },
  },

  // ── 2. update_element ─────────────────────────────────────────────────
  {
    name: 'update_element',
    description: [
      'Update any property of a canvas element in a single call.',
      'Pass label (element name) or index (layer number) to auto-select; omit to edit the currently selected element.',
      'Combines position, size, style, typography, transform, and effects — no need for separate set_* calls.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        label:         { type: 'string',  description: 'Select element by eliteLabel before editing' },
        index:         { type: 'number',  description: 'Select element by layer index (0=bottom) before editing' },
        content:       { type: 'string',  description: 'New text content' },
        x:             { type: 'number',  description: 'X position (left edge)' },
        y:             { type: 'number',  description: 'Y position (top edge)' },
        width:         { type: 'number',  description: 'Width in pixels' },
        height:        { type: 'number',  description: 'Height in pixels' },
        opacity:       { type: 'number',  description: 'Opacity 0.0–1.0' },
        fill:          { type: 'string',  description: 'Fill / background color hex' },
        corner_radius: { type: 'number',  description: 'Corner radius in pixels' },
        rotate:        { type: 'number',  description: 'Rotation angle in degrees (-360 to 360)' },
        flip:          { type: 'string',  enum: ['horizontal','vertical'], description: 'Mirror the element' },
        z_order:       { type: 'string',  enum: ['front','back','forward','backward'], description: 'Layer order change' },
        visible:       { type: 'boolean', description: 'Show (true) or hide (false)' },
        locked:        { type: 'boolean', description: 'Lock (true) prevents move/resize; false unlocks' },
        stroke: {
          type: 'object',
          properties: {
            color: { type: 'string' },
            width: { type: 'number' },
          },
          description: 'Border stroke',
        },
        typography: {
          type: 'object',
          description: 'All text styling in one object',
          properties: {
            family:         { type: 'string',  description: 'Font family e.g. "Inter"' },
            size:           { type: 'number',  description: 'Font size px' },
            weight:         { type: 'string',  description: '"400"–"900" or "bold"' },
            style:          { type: 'string',  enum: ['normal','italic'] },
            align:          { type: 'string',  enum: ['left','center','right','justify'] },
            underline:      { type: 'boolean' },
            letter_spacing: { type: 'number',  description: '0=normal, 100=loose, -50=tight' },
            line_height:    { type: 'number',  description: 'Multiplier e.g. 1.2' },
            color:          { type: 'string',  description: 'Text color hex' },
            case:           { type: 'string',  enum: ['upper','lower','title','sentence','none'] },
          },
        },
        shadow: {
          type: 'object',
          description: 'Drop shadow',
          properties: {
            enabled: { type: 'boolean' },
            color:   { type: 'string' },
            blur:    { type: 'number' },
            offsetX: { type: 'number' },
            offsetY: { type: 'number' },
          },
        },
        blur:          { type: 'number',  description: 'Gaussian blur 0–100 (0=off)' },
        gradient: {
          type: 'object',
          description: 'Gradient overlay config (selected element must be type gradient_overlay)',
          properties: {
            color:     { type: 'string' },
            direction: { type: 'string', enum: ['tb','bt','lr','rl','tlbr','trbl'] },
            strength:  { type: 'number' },
          },
        },
        frame_fit:     { type: 'string',  enum: ['cover','contain','fill'], description: 'Image fit inside frame' },
        highlights: {
          type: 'array',
          description: 'Per-word color highlights on text',
          items: {
            type: 'object',
            properties: {
              word:  { type: 'string' },
              color: { type: 'string' },
              bold:  { type: 'boolean' },
            },
            required: ['word','color'],
          },
        },
      },
      required: [],
    },
  },

  // ── 3. select_elements ────────────────────────────────────────────────
  {
    name: 'select_elements',
    description: 'Select one or more canvas elements. Must select before calling update_element without label/index.',
    inputSchema: {
      type: 'object',
      properties: {
        by:      { type: 'string', enum: ['label','index','indices','none'], description: 'Selection method' },
        label:   { type: 'string', description: 'Element label for by="label"' },
        index:   { type: 'number', description: 'Layer index for by="index"' },
        indices: { type: 'array',  items: { type: 'number' }, description: 'Array of layer indices for by="indices"' },
      },
      required: ['by'],
    },
  },

  // ── 4. arrange_elements ───────────────────────────────────────────────
  {
    name: 'arrange_elements',
    description: 'Arrange, group, align, or delete selected element(s). Select elements first with select_elements.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['front','back','forward','backward','align','distribute','group','ungroup','duplicate','delete'],
          description: 'front/back/forward/backward=layer order; align=align to canvas; distribute=space evenly; group/ungroup/duplicate/delete',
        },
        alignment: { type: 'string', enum: ['left','center','right','top','middle','bottom'], description: 'For action="align"' },
        direction: { type: 'string', enum: ['horizontal','vertical'], description: 'For action="distribute"' },
      },
      required: ['action'],
    },
  },

  // ── 5. query_canvas ───────────────────────────────────────────────────
  {
    name: 'query_canvas',
    description: [
      'Read canvas state. Call before editing so you know what is already on canvas.',
      'what="elements" — list all elements on current page (label, type, x, y, w, h);',
      'what="all_pages" — read elements+state for EVERY page in one call (use this instead of switching pages manually);',
      'what="selected" — currently active element; what="state" — canvas size+bg+zoom;',
      'what="json" — raw Fabric JSON; what="fonts" — font list; what="icons" — icon library.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        what: {
          type: 'string',
          enum: ['elements','selected','state','json','fonts','icons','all_pages'],
          description: 'elements=list current page; all_pages=all pages at once (efficient batch read); selected=active; state=size+bg; json=fabric JSON; fonts; icons',
        },
      },
      required: ['what'],
    },
  },

  // ── 6. manage_page ────────────────────────────────────────────────────
  {
    name: 'manage_page',
    description: 'Create, switch, rename, duplicate, or delete canvas pages (carousel slides).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list','add','switch','rename','duplicate','delete'],
          description: 'list=get all pages; add=new blank page; switch=go to page; rename=set name; duplicate=copy page; delete=remove page',
        },
        index: { type: 'number', description: 'Page index (0-based). Defaults to active page.' },
        name:  { type: 'string', description: 'New page name for action="rename"' },
      },
      required: ['action'],
    },
  },

  // ── 7. canvas_settings ────────────────────────────────────────────────
  {
    name: 'canvas_settings',
    description: 'Configure canvas background, size, zoom, accent color, theme. Pass only the properties you want to change.',
    inputSchema: {
      type: 'object',
      properties: {
        background:   { type: 'string',  description: 'Background color hex e.g. "#111111"' },
        width:        { type: 'number',  description: 'Canvas width in pixels. Common: 1080 (IG), 1920 (Story)' },
        height:       { type: 'number',  description: 'Canvas height in pixels. Common: 1350 (IG), 1080 (Story)' },
        zoom:         { description: 'Zoom level: number=percent (100=100%), or "fit" to zoom-to-fit' },
        clear:        { type: 'boolean', description: 'true = remove all elements from canvas' },
        export:       { type: 'boolean', description: 'true = export canvas as PNG (returns base64 data URL)' },
        accent_color: { type: 'string',  description: 'Global brand accent color hex' },
        theme:        { type: 'string',  enum: ['dark','light'], description: 'App color theme' },
      },
      required: [],
    },
  },

  // ── 8. history ────────────────────────────────────────────────────────
  {
    name: 'history',
    description: 'Undo or redo canvas actions.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['undo','redo'], description: 'undo=revert last action; redo=re-apply undone action' },
      },
      required: ['action'],
    },
  },

  // ── 9. generate_image ─────────────────────────────────────────────────
  {
    name: 'generate_image',
    description: [
      'Generate one AI image and place it on the canvas.',
      'BEFORE calling: run app_control action="check_providers" to see which providers are ready.',
      'provider="fal" (FASTEST, 3-10s, SYNC): Flux — needs FAL_API_KEY in backend/.env.',
      'provider="openai" (5-15s, SYNC): DALL-E 3 — needs OPENAI_API_KEY.',
      'provider="stability" (10-20s, SYNC): SDXL — needs STABILITY_API_KEY.',
      'provider="chatgpt" (ASYNC, fire-and-forget): returns job_id immediately (~2ms), image places itself when ready. Poll with app_control action="job_status" job_id="<id>".',
      'target_frame: eliteLabel of a frame to fill. Must match exactly — use query_canvas what="elements" to list frame labels.',
      'For multiple images use batch_generate_images instead (parallel API calls).',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        prompt:        { type: 'string', description: 'Image prompt. Be detailed: subject, style, lighting, composition.' },
        provider:      { type: 'string', enum: ['chatgpt','openai','fal','stability'], description: 'AI provider. Default: chatgpt' },
        api_key:       { type: 'string', description: 'Provider API key (optional override; reads from env var if omitted)' },
        model:         { type: 'string', description: 'Provider model override e.g. "dall-e-3", "fal-ai/flux/dev"' },
        size:          { type: 'string', description: 'Image size for openai: "1024x1024" | "1792x1024" | "1024x1792"' },
        target_frame:  { type: 'string', description: 'eliteLabel of a frame element to load the image into' },
        replace_label: { type: 'string', description: 'eliteLabel of existing image to replace with the new one' },
        x:             { type: 'number', description: 'Left edge X for standalone placement' },
        y:             { type: 'number', description: 'Top edge Y for standalone placement' },
        w:             { type: 'number', description: 'Width for standalone placement' },
        h:             { type: 'number', description: 'Height for standalone placement' },
      },
      required: ['prompt'],
    },
  },

  // ── 11a. batch_generate_images ────────────────────────────────────────────
  {
    name: 'batch_generate_images',
    description: [
      'Generate multiple AI images in one tool call — far more efficient than repeated generate_image calls.',
      'API providers (fal/openai/stability): all images dispatched in PARALLEL — 5 images = ~same time as 1.',
      'chatgpt provider: images run sequentially (browser automation limitation).',
      'Each image can target a different frame and/or page_index (auto page-switches before placing).',
      'WHEN TO USE: whenever you need 2+ images. Always prefer this over looping generate_image.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          description: 'Array of image generation jobs — all dispatched in parallel for API providers',
          items: {
            type: 'object',
            properties: {
              prompt:        { type: 'string',  description: 'Image prompt (required)' },
              provider:      { type: 'string',  enum: ['chatgpt','openai','fal','stability'], description: 'AI provider. Default: fal if available, else chatgpt' },
              api_key:       { type: 'string',  description: 'Provider API key override' },
              target_frame:  { type: 'string',  description: 'eliteLabel of frame to fill' },
              replace_label: { type: 'string',  description: 'eliteLabel of existing image to replace' },
              page_index:    { type: 'number',  description: '0-based page to switch to before placing. Omit for current page.' },
              x:             { type: 'number' },
              y:             { type: 'number' },
              w:             { type: 'number' },
              h:             { type: 'number' },
            },
            required: ['prompt'],
          },
        },
      },
      required: ['images'],
    },
  },

  // ── 11. design_from_brief ─────────────────────────────────────────────
  {
    name: 'design_from_brief',
    description: [
      'AI canvas layout engine. Describe the design in natural language and the NVIDIA NIM LLM produces a complete layout plan,',
      'then executes it — placing every element at precise x/y/w/h with colours, fonts and text.',
      'Example: "Bold dark Instagram post about a product launch, orange accent".',
      'Optionally pass canvas_width/canvas_height (default 1080x1350).',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        brief:         { type: 'string',  description: 'Natural-language description of the design (required)' },
        canvas_width:  { type: 'number',  description: 'Canvas width in px. Default 1080.' },
        canvas_height: { type: 'number',  description: 'Canvas height in px. Default 1350.' },
        background:    { type: 'string',  description: 'Override background color hex e.g. "#111111"' },
        dry_run:       { type: 'boolean', description: 'Return the plan JSON without executing it' },
      },
      required: ['brief'],
    },
  },

  // ── 12. build_carousel ────────────────────────────────────────────────
  {
    name: 'build_carousel',
    description: [
      'Multi-page carousel builder. Pass an array of slide objects and all pages are created at once.',
      'Each slide: { background?, elements[] } — elements use the same schema as create_element.',
      'IDEMPOTENCY: pass reset_pages=true to wipe all existing pages back to 1 before building.',
      'Without reset_pages, calling this twice on a 5-slide carousel creates 10 pages (appends blindly).',
      'Always pass reset_pages=true when rebuilding a carousel.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        slides: {
          type: 'array',
          description: 'Array of slide definitions',
          items: {
            type: 'object',
            properties: {
              background: { type: 'string',  description: 'Background color hex' },
              elements: {
                type: 'array',
                description: 'Elements to add — each: { type, text?, x, y, width, height, color?, fill?, label? }',
                items: { type: 'object' },
              },
            },
          },
        },
        clear_first:  { type: 'boolean', description: 'Clear current page content before building slide 0. Default false.' },
        reset_pages:  { type: 'boolean', description: 'RECOMMENDED: Delete all extra pages first so you start from 1 page, preventing duplicates. Default false.' },
      },
      required: ['slides'],
    },
  },

  // ── 13. brand_kit ─────────────────────────────────────────────────────
  {
    name: 'brand_kit',
    description: 'Store and apply your brand: colors, font family/weight, logo URL. action="set" saves, "get" reads, "apply" applies to canvas.',
    inputSchema: {
      type: 'object',
      properties: {
        action:      { type: 'string', enum: ['set','get','apply'], description: 'set=save, get=read, apply=apply to canvas' },
        colors:      { type: 'array',  items: { type: 'string' },  description: 'Brand color hex array e.g. ["#FF5733","#FFFFFF"]' },
        font_family: { type: 'string', description: 'Primary brand font family e.g. "Bebas Neue"' },
        font_weight: { type: 'string', description: 'Brand font weight e.g. "700"' },
        logo_url:    { type: 'string', description: 'URL or file:// path to brand logo' },
      },
      required: ['action'],
    },
  },

  // ── 14. template_ops ──────────────────────────────────────────────────
  {
    name: 'template_ops',
    description: 'Save, load, list, or delete canvas templates. Templates persist across sessions in the database.',
    inputSchema: {
      type: 'object',
      properties: {
        action:         { type: 'string', enum: ['save','load','list','delete'], description: 'Operation to perform' },
        name:           { type: 'string', description: 'Template name (save: new name; load/delete: name or id)' },
        id:             { type: 'string', description: 'Template id for load/delete' },
        with_thumbnail: { type: 'boolean', description: 'Include thumbnail preview on save. Default true.' },
      },
      required: ['action'],
    },
  },

  // ── 15. fit_text ──────────────────────────────────────────────────────
  {
    name: 'fit_text',
    description: 'Auto-scale a text element\'s font size so it fills a bounding box. Select the text first or pass its label.',
    inputSchema: {
      type: 'object',
      properties: {
        label:      { type: 'string', description: 'Element label to target (optional if already selected)' },
        max_width:  { type: 'number', description: 'Max width in canvas px (defaults to element width)' },
        max_height: { type: 'number', description: 'Max height in canvas px (defaults to element height)' },
        min_font:   { type: 'number', description: 'Minimum font size px. Default 8.' },
        max_font:   { type: 'number', description: 'Maximum font size px. Default 200.' },
      },
      required: [],
    },
  },

  // ── 16. validate_design ───────────────────────────────────────────────
  {
    name: 'validate_design',
    description: 'Check WCAG contrast ratios for all text elements and warn about elements within the 48px safe zone. Returns a list of warnings and passed checks.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // ── 10. app_control ───────────────────────────────────────────────────
  {
    name: 'app_control',
    description: 'Navigate the app, read/save settings, or change appearance. Use check_providers before generating images.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['navigate','get_state','settings','save_keys','appearance','check_providers','job_status'],
          description: 'navigate=switch page; get_state=current page+theme; settings=check API keys; save_keys=write keys to .env; appearance=set theme; check_providers=which image AI providers have keys ready; job_status=poll async image gen (pass job_id)',
        },
        page: {
          type: 'string',
          enum: ['forge','studio','web','doc','templates','history','settings'],
          description: 'Target page for action="navigate"',
        },
        nvidia_key: { type: 'string', description: 'NVIDIA NIM API key for action="save_keys"' },
        tavily_key: { type: 'string', description: 'Tavily search API key for action="save_keys"' },
        chatgpt_url: { type: 'string', description: 'ChatGPT URL for image generation (action="save_keys")' },
        theme:       { type: 'string', enum: ['dark','light'], description: 'App theme for action="appearance"' },
      },
      required: ['action'],
    },
  },
]

// ── Tool dispatch ──────────────────────────────────────────────────────────

async function dispatch(name: string, params: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'create_element':        return dispatchCreate(params)
    case 'update_element':        return callCanvas('update_element', params)
    case 'select_elements':       return dispatchSelect(params)
    case 'arrange_elements':      return dispatchArrange(params)
    case 'query_canvas':          return dispatchQuery(params)
    case 'manage_page':           return dispatchPage(params)
    case 'canvas_settings':       return dispatchSettings(params)
    case 'history':               return dispatchHistory(params)
    case 'generate_image': {
      const provider = String(params.provider || 'chatgpt')
      return provider === 'chatgpt'
        ? dispatchImageGenAsync(params)
        : dispatchImageGen(params)
    }
    case 'batch_generate_images': return dispatchBatchImageGen(params)
    case 'app_control':           return dispatchApp(params)
    case 'design_from_brief':     return dispatchDesignFromBrief(params)
    case 'build_carousel':        return dispatchBuildCarousel(params)
    case 'brand_kit':             return callCanvas('brand_kit', params)
    case 'template_ops':          return callCanvas('template_ops', params)
    case 'fit_text':              return callCanvas('fit_text', params)
    case 'validate_design':       return callCanvas('validate_design', params)
    default: throw new Error(`unknown tool "${name}"`)
  }
}

function dispatchCreate(params: Record<string, unknown>): Promise<unknown> {
  const type = String(params.type || 'text')
  const toolMap: Record<string, string> = {
    text: 'add_text', title: 'add_title', subtitle: 'add_subtitle',
    tag: 'add_tag', shape: 'add_shape', accent_line: 'add_accent_line',
    gradient_overlay: 'add_gradient_overlay', logo: 'add_logo',
    frame: 'add_frame', icon: 'add_icon',
  }
  const tool = toolMap[type]
  if (!tool) throw new Error(`unknown element type "${type}". Valid: ${Object.keys(toolMap).join(', ')}`)
  return callCanvas(tool, params)
}

function dispatchSelect(params: Record<string, unknown>): Promise<unknown> {
  const by = String(params.by || '')
  if (by === 'label')   return callCanvas('select_by_label',  params)
  if (by === 'index')   return callCanvas('select_by_index',  params)
  if (by === 'indices') return callCanvas('select_multiple',  params)
  if (by === 'none')    return callCanvas('deselect',         params)
  throw new Error(`unknown by "${by}". Valid: label, index, indices, none`)
}

function dispatchArrange(params: Record<string, unknown>): Promise<unknown> {
  const action = String(params.action || '')
  const actionMap: Record<string, string> = {
    front: 'bring_to_front', back: 'send_to_back',
    forward: 'bring_forward', backward: 'send_backward',
    align: 'align_elements', distribute: 'distribute_elements',
    group: 'group_selected', ungroup: 'ungroup_selected',
    duplicate: 'duplicate_selected', delete: 'delete_selected',
  }
  const tool = actionMap[action]
  if (!tool) throw new Error(`unknown action "${action}". Valid: ${Object.keys(actionMap).join(', ')}`)
  return callCanvas(tool, params)
}

async function dispatchQuery(params: Record<string, unknown>): Promise<unknown> {
  const what = String(params.what || '')

  // Batch read all pages in one call — avoids N sequential switch+query round-trips
  if (what === 'all_pages') {
    type PageInfo = { index: number; label: string; isActive: boolean }
    const pages = (await callCanvas('get_canvas_pages', {})) as PageInfo[]
    if (!pages.length) return []
    const activeIdx = pages.findIndex(p => p.isActive)
    const allPageData: unknown[] = []

    for (const page of pages) {
      if (!page.isActive) {
        await callCanvas('switch_canvas_page', { index: page.index })
        await new Promise(r => setTimeout(r, 25))
      }
      const state = await callCanvas('get_canvas_state', {})
      allPageData.push({ pageIndex: page.index, pageName: page.label, ...(state as object) })
    }

    // Restore original active page
    if (activeIdx >= 0 && pages[activeIdx] && !pages[activeIdx].isActive) {
      await callCanvas('switch_canvas_page', { index: activeIdx })
    }
    return allPageData
  }

  const queryMap: Record<string, string> = {
    elements: 'get_elements', selected: 'get_selected',
    state: 'get_canvas_state', json: 'get_canvas_json',
    fonts: 'list_fonts', icons: 'list_icons',
  }
  const tool = queryMap[what]
  if (!tool) throw new Error(`unknown what "${what}". Valid: ${Object.keys(queryMap).join(', ')}, all_pages`)
  return callCanvas(tool, params)
}

function dispatchPage(params: Record<string, unknown>): Promise<unknown> {
  const action = String(params.action || '')
  const pageMap: Record<string, string> = {
    list: 'get_canvas_pages', add: 'add_canvas_page',
    switch: 'switch_canvas_page', rename: 'rename_canvas_page',
    duplicate: 'duplicate_canvas_page', delete: 'delete_canvas_page',
  }
  const tool = pageMap[action]
  if (!tool) throw new Error(`unknown action "${action}". Valid: ${Object.keys(pageMap).join(', ')}`)
  return callCanvas(tool, params)
}

async function dispatchSettings(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {}
  if (params.background   !== undefined) results.background   = await callCanvas('set_background',    { color: params.background })
  if (params.accent_color !== undefined) results.accent_color = await callCanvas('update_accent_color', { color: params.accent_color })
  if (params.width !== undefined || params.height !== undefined) {
    const state = (await callCanvas('get_canvas_state', {})) as { width: number; height: number }
    results.size = await callCanvas('set_canvas_size', {
      width:  params.width  ?? state.width,
      height: params.height ?? state.height,
    })
  }
  if (params.zoom !== undefined) {
    results.zoom = params.zoom === 'fit'
      ? await callCanvas('zoom_to_fit', {})
      : await callCanvas('set_zoom', { zoom: params.zoom })
  }
  if (params.clear  === true) results.clear  = await callCanvas('clear_canvas', {})
  if (params.export === true) results.export = await callCanvas('export_png',   {})
  if (params.theme  !== undefined) results.theme = await callApp('update_appearance', { theme: params.theme })
  return results
}

function dispatchHistory(params: Record<string, unknown>): Promise<unknown> {
  const action = String(params.action || '')
  if (action === 'undo') return callCanvas('undo', params)
  if (action === 'redo') return callCanvas('redo', params)
  throw new Error(`unknown action "${action}". Valid: undo, redo`)
}

async function dispatchImageGen(params: Record<string, unknown>): Promise<unknown> {
  const provider = String(params.provider || 'chatgpt')

  // ChatGPT browser automation — existing path (no API key needed, but slow)
  if (provider === 'chatgpt') {
    try {
      return await callCanvas('generate_image', params)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const isBrowserErr = /not active|not available|session|Electron|tab not open/i.test(msg)
      if (isBrowserErr) {
        throw new Error(
          `ChatGPT image generation failed: ${msg} ` +
          `Fix: (1) call app_control action="navigate" page="web" to open the browser tab, ` +
          `(2) log into ChatGPT in that tab, then retry. ` +
          `Or switch to an API provider: call app_control action="check_providers" to see what is ready, ` +
          `then retry with provider="fal" or provider="openai".`
        )
      }
      throw err
    }
  }

  // API-based providers: call backend, then place result on canvas
  let imageData: { url: string; provider: string }
  try {
    imageData = await callBackend('/api/generate-image', {
      provider,
      prompt:  params.prompt,
      api_key: params.api_key,
      size:    params.size   || '1024x1024',
      model:   params.model,
    }, 90_000) as { url: string; provider: string }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isKeyErr = /key not set|API_KEY|not configured|400/i.test(msg)
    if (isKeyErr) {
      throw new Error(
        `${provider} API key missing: ${msg} ` +
        `Add the key to backend/.env and restart the backend. ` +
        `Run app_control action="check_providers" to see all available providers.`
      )
    }
    throw err
  }

  if (!imageData?.url) throw new Error(`${provider} returned no image URL`)

  return callCanvas('place_image_from_url', {
    url:           imageData.url,
    target_frame:  params.target_frame,
    replace_label: params.replace_label,
    x: params.x, y: params.y, w: params.w, h: params.h,
  })
}

async function dispatchApp(params: Record<string, unknown>): Promise<unknown> {
  const action = String(params.action || '')
  if (action === 'navigate')   return callApp('navigate_to',     { page: params.page })
  if (action === 'get_state')  return callApp('get_app_state',   params)
  if (action === 'settings')   return callApp('get_settings',    params)
  if (action === 'appearance') return callApp('update_appearance', { theme: params.theme })
  if (action === 'save_keys') {
    const results: Record<string, unknown> = {}
    if (params.nvidia_key || params.tavily_key) {
      results.keys = await callApp('save_api_keys', {
        nvidiaKey: params.nvidia_key ?? '',
        tavilyKey: params.tavily_key ?? '',
      })
    }
    if (params.chatgpt_url) {
      results.chatgpt_url = await callApp('set_chatgpt_url', { url: params.chatgpt_url })
    }
    return results
  }
  if (action === 'check_providers') {
    return callBackendGet('/api/image-providers', 10_000)
  }
  if (action === 'job_status') {
    const jobId = String(params.job_id || '')
    if (!jobId) throw new Error('job_id is required for action="job_status"')
    const job = imageJobStore.get(jobId)
    if (!job) return { job_id: jobId, status: 'not_found', message: 'Job not found or expired (10 min TTL)' }
    return {
      job_id:   jobId,
      status:   job.status,
      prompt:   job.prompt,
      provider: job.provider,
      age_s:    Math.round((Date.now() - job.createdAt) / 1000),
      result:   job.result  ?? null,
      error:    job.error   ?? null,
    }
  }
  throw new Error(`unknown action "${action}". Valid: navigate, get_state, settings, save_keys, appearance, check_providers, job_status`)
}

// ── dispatchImageGenAsync — fire-and-forget for chatgpt ───────────────────────

async function dispatchImageGenAsync(params: Record<string, unknown>): Promise<unknown> {
  const jobId  = randomUUID().slice(0, 8)
  const prompt = String(params.prompt || '')

  pruneOldJobs()
  imageJobStore.set(jobId, { status: 'running', prompt, provider: 'chatgpt', createdAt: Date.now() } satisfies JobRecord)

  // Fire-and-forget — intentionally not awaited
  void dispatchImageGen(params).then(result => {
    const job = imageJobStore.get(jobId)
    if (job) imageJobStore.set(jobId, { ...job, status: 'done', result })
  }).catch((err: Error) => {
    const job = imageJobStore.get(jobId)
    if (job) imageJobStore.set(jobId, { ...job, status: 'error', error: err.message })
  })

  return {
    job_id:  jobId,
    status:  'running',
    message: `Image generation started. Poll with: app_control action="job_status" job_id="${jobId}"`,
  }
}

// ── batch_generate_images ──────────────────────────────────────────────────────

type ImageJob = {
  prompt: string
  provider?: string
  api_key?: string
  target_frame?: string
  replace_label?: string
  page_index?: number
  x?: number; y?: number; w?: number; h?: number
}

async function dispatchBatchImageGen(params: Record<string, unknown>): Promise<unknown> {
  const images: ImageJob[] = Array.isArray(params.images) ? (params.images as ImageJob[]) : []
  if (!images.length) throw new Error('images must be a non-empty array of {prompt, ...} objects')

  // Split jobs: API providers run in parallel via backend, chatgpt runs sequentially via canvas
  const results: Array<unknown> = new Array(images.length).fill(null)

  // --- API provider jobs (parallel) ---
  const apiIndices = images
    .map((img, i) => ({ img, i }))
    .filter(({ img }) => img.provider && img.provider !== 'chatgpt')

  if (apiIndices.length) {
    // Request all images from backend in parallel
    const backendPromises = apiIndices.map(({ img }) =>
      callBackend('/api/generate-image', {
        provider: img.provider!,
        prompt:   img.prompt,
        api_key:  img.api_key,
        size:     '1024x1024',
      }, 90_000).catch((err: Error) => ({ _error: err.message }))
    )
    const backendResults = await Promise.all(backendPromises)

    // Place images on canvas sequentially (must switch pages)
    for (let k = 0; k < apiIndices.length; k++) {
      const { img, i } = apiIndices[k]
      const br = backendResults[k] as { url?: string; _error?: string }
      if (br._error) {
        results[i] = { status: 'error', error: br._error, prompt: img.prompt }
        continue
      }
      if (!br.url) {
        results[i] = { status: 'error', error: 'no URL returned', prompt: img.prompt }
        continue
      }
      try {
        if (img.page_index !== undefined) {
          await callCanvas('switch_canvas_page', { index: img.page_index })
          await new Promise(r => setTimeout(r, 25))
        }
        const placed = await callCanvas('place_image_from_url', {
          url:           br.url,
          target_frame:  img.target_frame,
          replace_label: img.replace_label,
          x: img.x, y: img.y, w: img.w, h: img.h,
        })
        results[i] = { status: 'done', prompt: img.prompt, ...(placed as object) }
      } catch (err) {
        results[i] = { status: 'error', error: err instanceof Error ? err.message : String(err), prompt: img.prompt }
      }
    }
  }

  // --- ChatGPT jobs (sequential, browser automation) ---
  const cgptIndices = images
    .map((img, i) => ({ img, i }))
    .filter(({ img }) => !img.provider || img.provider === 'chatgpt')

  for (const { img, i } of cgptIndices) {
    try {
      if (img.page_index !== undefined) {
        await callCanvas('switch_canvas_page', { index: img.page_index })
        await new Promise(r => setTimeout(r, 150))
      }
      const placed = await callCanvas('generate_image', {
        prompt:        img.prompt,
        provider:      'chatgpt',
        target_frame:  img.target_frame,
        replace_label: img.replace_label,
        x: img.x, y: img.y, w: img.w, h: img.h,
      })
      results[i] = { status: 'done', prompt: img.prompt, ...(placed as object) }
    } catch (err) {
      results[i] = { status: 'error', error: err instanceof Error ? err.message : String(err), prompt: img.prompt }
    }
  }

  const done   = results.filter((r) => (r as { status: string }).status === 'done').length
  const errors = results.filter((r) => (r as { status: string }).status === 'error').length
  return { total: images.length, done, errors, results }
}

// ── design_from_brief ──────────────────────────────────────────────────────

async function dispatchDesignFromBrief(params: Record<string, unknown>): Promise<unknown> {
  const brief = String(params.brief || '').trim()
  if (!brief) throw new Error('brief is required')

  const canvasW = Number(params.canvas_width  ?? 1080)
  const canvasH = Number(params.canvas_height ?? 1350)

  // Ask NVIDIA NIM to produce a structured layout plan
  const planData = await callBackend('/api/design-brief', {
    brief,
    canvas_width:  canvasW,
    canvas_height: canvasH,
    background:    params.background,
  }, 90_000) as { plan: unknown[]; background?: string }

  if (params.dry_run) return planData

  // Apply background if provided
  if (planData.background) {
    await callCanvas('set_background', { color: planData.background })
  }

  // Execute the plan steps on the canvas
  return callCanvas('execute_design_plan', { plan: planData.plan })
}

// ── build_carousel ─────────────────────────────────────────────────────────

async function dispatchBuildCarousel(params: Record<string, unknown>): Promise<unknown> {
  type Slide = { background?: string; elements?: unknown[] }
  const slides: Slide[] = Array.isArray(params.slides) ? (params.slides as Slide[]) : []
  if (!slides.length) throw new Error('slides must be a non-empty array')

  // Reset pages first to prevent duplicates on repeated calls
  if (params.reset_pages) {
    type PageInfo = { index: number }
    const existingPages = (await callCanvas('get_canvas_pages', {})) as PageInfo[]
    // Delete from highest index down to avoid index shifting
    for (let d = existingPages.length - 1; d >= 1; d--) {
      await callCanvas('switch_canvas_page', { index: d })
      await new Promise(r => setTimeout(r, 15))
      await callCanvas('delete_canvas_page', { index: d })
    }
    // Land on page 0
    await callCanvas('switch_canvas_page', { index: 0 })
    await new Promise(r => setTimeout(r, 20))
  }

  const results: unknown[] = []

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]

    if (i === 0) {
      if (params.clear_first) await callCanvas('clear_canvas', {})
    } else {
      await callCanvas('add_canvas_page', {})
      await new Promise(r => setTimeout(r, 25))
    }

    const result = await callCanvas('build_carousel_page', {
      background: slide.background,
      elements:   slide.elements ?? [],
    })
    results.push({ slide: i, ...result as object })
  }

  const allPages = (await callCanvas('get_canvas_pages', {})) as Array<unknown>
  return {
    slides:     slides.length,
    totalPages: allPages.length,
    results,
    tip: 'Pass reset_pages=true on the next call to rebuild cleanly without duplicates.',
  }
}

// ── Server setup ───────────────────────────────────────────────────────────

const server = new Server(
  { name: 'creatoros-design-studio', version: '3.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(t => ({
    ...t,
    annotations: {
      destructiveHint: false,
      readOnlyHint:    false,
      idempotentHint:  false,
      openWorldHint:   false,
    },
  })),
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params
  try {
    const result = await dispatch(name, args as Record<string, unknown>)
    return ok(result)
  } catch (err) {
    return {
      content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    }
  }
})

// ── Start ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const useHttp = process.argv.includes('--http')

  if (useHttp) {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

    const httpServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id')
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id')

      if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }

      console.error(`[mcp-req] ${req.method} ${req.url}`)

      if (req.url !== '/mcp') {
        res.writeHead(404).end(JSON.stringify({ error: 'Use POST/GET /mcp for MCP protocol' }))
        return
      }

      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
        res.write(': connected\n\n')
        const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000)
        req.on('close', () => clearInterval(keepAlive))
        return
      }

      const REQUIRED_ACCEPT = 'application/json, text/event-stream'
      const acceptIdx = req.rawHeaders.findIndex(h => h.toLowerCase() === 'accept')
      if (acceptIdx === -1) {
        req.rawHeaders.push('Accept', REQUIRED_ACCEPT)
        req.headers['accept'] = REQUIRED_ACCEPT
      } else {
        const current = req.rawHeaders[acceptIdx + 1] ?? ''
        if (!current.includes('text/event-stream') || !current.includes('application/json')) {
          req.rawHeaders[acceptIdx + 1] = REQUIRED_ACCEPT
          req.headers['accept'] = REQUIRED_ACCEPT
        }
      }

      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', () => {
        void transport.handleRequest(req, res, body.trim() ? (JSON.parse(body) as unknown) : undefined)
      })
    })

    await server.connect(transport)
    httpServer.listen(MCP_HTTP_PORT, '0.0.0.0', () => {
      console.error(`[creatoros-mcp] HTTP transport on port ${MCP_HTTP_PORT}`)
      console.error(`[creatoros-mcp] Connect any AI at: http://localhost:${MCP_HTTP_PORT}/mcp`)
    })
  } else {
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error('[creatoros-mcp] Design Studio MCP server started (stdio)')
  }
}

main().catch((err) => {
  console.error('[creatoros-mcp] Fatal error:', err)
  process.exit(1)
})
