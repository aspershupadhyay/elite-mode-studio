/**
 * content-apply.ts — Apply AI-generated content (title, subtitle, tag, etc.)
 * to the objects currently on the canvas.
 *
 * Two exported functions:
 *   applyGeneratedContent()       — original sync API, used by CanvasHandle wrapper
 *   applyGeneratedContentFromSchema() — async schema-aware API used by DesignStudio
 *                                       batch injector and single-post send-to-studio
 */

import * as fabric from 'fabric'
import type { Canvas, FabricObject } from 'fabric'
import { applyImageToFrame } from '../../canvas/frames/frame-image'
import type { GeneratedContentArgs } from '@/types/canvas'
import type { Post, PostElementPrefs } from '@/types/domain'
import type { ContentSchemaConfig, SlotMapping } from '@/types/schema'
import type { Profile } from '@/types/profile'

// ── Default: apply only title + highlights (subtitle/tag require opt-in) ──────

const DEFAULT_PREFS: PostElementPrefs = {
  title:      true,
  highlights: true,
  subtitle:   false,
  tag:        false,
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function applyTitle(
  obj: FabricObject & { text?: string; styles?: Record<string, unknown>; dirty?: boolean },
  text: string,
): void {
  obj.set('text', text.toUpperCase())
  obj.set('styles', {})
  obj.dirty = true
}

function autoFitText(
  obj: FabricObject & {
    width?: number; height?: number; scaleY?: number
    fontSize?: number; dirty?: boolean
    initDimensions?: () => void
    calcTextHeight?: () => number
  },
): void {
  if (!obj.width || !obj.height) return
  const maxH = (obj.height) * (obj.scaleY || 1)
  let fs = obj.fontSize || 24
  const minFs = 8
  while (fs > minFs) {
    obj.set('fontSize', fs)
    try { obj.initDimensions?.() } catch { break }
    const h = obj.calcTextHeight ? obj.calcTextHeight() : (obj.height || 0)
    if (h <= maxH) break
    fs -= 1
  }
  obj.dirty = true
}

// ── Null-value guard ──────────────────────────────────────────────────────────
// AI models sometimes return placeholder strings when they have no answer.
// These should be treated as empty so the canvas fallback text stays intact.
const NULL_VALUE_PATTERNS = /^(not applicable|n\/a|na|none|null|undefined|—|-)$/i

function isNullValue(v: string): boolean {
  return !v.trim() || NULL_VALUE_PATTERNS.test(v.trim())
}

// ── Public API ────────────────────────────────────────────────────────────────

export function applyGeneratedContent(
  canvas: Canvas,
  args: GeneratedContentArgs,
  accent: string,
  prefs: PostElementPrefs = DEFAULT_PREFS,
): void {
  const { title, highlight_words, subtitle, tag } = args

  // Collect all text objects (including inside unlabelled groups)
  const allObjs: FabricObject[] = []
  const collect = (objs: FabricObject[]): void => {
    objs.forEach(o => {
      if (o instanceof fabric.Group) {
        if (!o.eliteType) collect(o.getObjects() as FabricObject[])
      } else {
        allObjs.push(o)
      }
    })
  }
  collect(canvas.getObjects() as FabricObject[])

  const textObjs = allObjs.filter(o => o.type === 'textbox' || o.type === 'i-text') as Array<FabricObject & {
    fontSize?: number; text?: string; styles?: Record<string, unknown>; dirty?: boolean
  }>

  // Pass 1: explicit eliteType matches
  let titleMatched = false, subtitleMatched = false, tagMatched = false

  textObjs.forEach(obj => {
    if (obj.eliteType === 'title' && prefs.title && title) {
      applyTitle(obj, title)
      titleMatched = true
    }
    if (obj.eliteType === 'text' && prefs.subtitle && subtitle) {
      obj.set('text', subtitle); obj.set('styles', {}); obj.dirty = true; subtitleMatched = true
    }
    if (obj.eliteType === 'tag' && prefs.tag) {
      obj.set('fill', accent)
      if (tag) { obj.set('text', tag); obj.dirty = true }
      tagMatched = true
    }
  })

  // Pass 2: heuristic fallback (only for enabled fields)
  if (!titleMatched || !subtitleMatched || !tagMatched) {
    const sorted = [...textObjs].sort((a, b) => (b.fontSize || 0) - (a.fontSize || 0))
    if (!titleMatched && prefs.title && title && sorted[0]) {
      applyTitle(sorted[0], title)
    }
    if (!subtitleMatched && prefs.subtitle && subtitle && sorted[1]) {
      sorted[1].set('text', subtitle); sorted[1].set('styles', {}); sorted[1].dirty = true
    }
    if (!tagMatched && prefs.tag && sorted.length >= 3) {
      const tagObj = sorted[sorted.length - 1]
      tagObj.set('fill', accent)
      if (tag) { tagObj.set('text', tag); tagObj.dirty = true }
    }
  }

  // Auto-fit: shrink font if title overflows
  textObjs.forEach(obj => {
    if (!obj.dirty) return
    autoFitText(obj)
  })

  canvas.renderAll()
}

// ── Schema-aware content injection ────────────────────────────────────────────

/**
 * Read a field value from a Post by fieldId.
 * Handles the current flat Post shape (title, caption, highlight_words, …)
 * as well as any future `fields` dict added in Task 6.
 */
function readPostField(post: Post, fieldId: string): string | undefined {
  // Future Task 6: if post has a typed fields dict, prefer it
  const postAny = post as unknown as Record<string, unknown>
  if (postAny['fields'] && typeof postAny['fields'] === 'object') {
    const fields = postAny['fields'] as Record<string, unknown>
    const v = fields[fieldId]
    if (v !== undefined && v !== null) return String(v)
  }
  // Current flat Post fields
  const flat = postAny[fieldId]
  if (flat === undefined || flat === null) return undefined
  if (Array.isArray(flat)) return flat.join(', ')
  return String(flat)
}

/**
 * Resolve which slotMapping to use for this render.
 * Returns undefined when no mapping is configured (triggers heuristic fallback).
 */
function resolveSlotMapping(
  schema: ContentSchemaConfig,
  slideRole?: string,
): SlotMapping[] | undefined {
  // Carousel: find the slide template whose role matches
  if (slideRole && schema.carousel) {
    const cfg = schema.carousel
    const slides =
      cfg.mode === 'fixed'   ? cfg.fixed?.slides :
      cfg.mode === 'dynamic' ? cfg.dynamic?.slideTemplates :
      undefined
    const slide = slides?.find(s => s.role === slideRole)
    if (slide?.slotMapping?.length) return slide.slotMapping
  }
  // Single post (or carousel fallback)
  if (schema.singlePost?.slotMapping?.length) {
    return schema.singlePost.slotMapping
  }
  return undefined
}

/**
 * Collect all canvas objects, descending into unlabelled groups.
 * Returns the flat list (same logic as the sync function above).
 */
function collectAllObjects(canvas: Canvas): FabricObject[] {
  const all: FabricObject[] = []
  const descend = (objs: FabricObject[]): void => {
    objs.forEach(o => {
      if (o instanceof fabric.Group && !o.eliteType) {
        descend(o.getObjects() as FabricObject[])
      } else {
        all.push(o)
      }
    })
  }
  descend(canvas.getObjects() as FabricObject[])
  return all
}

/** Detect the accent color already in use on a title object. */
/**
 * Apply a single slot mapping entry to the canvas.
 * Returns true if an object was found and touched.
 */
function applySlot(
  mapping: SlotMapping,
  value: string,
  allObjs: FabricObject[],
  accent: string,
  canvas: Canvas,
): boolean {
  // highlight_words slot: no-op (keyword highlighting removed — future Brand Kit feature)
  if (mapping.eliteSlot === 'highlight_words') {
    return true
  }

  // hashtags slot: inject into tag object
  if (mapping.eliteSlot === 'hashtags') {
    const tagObj = allObjs.find(o => o.eliteType === mapping.eliteType || o.eliteType === mapping.fieldId) as
      (FabricObject & { text?: string; dirty?: boolean }) | undefined
    if (!tagObj) return false
    // Extract hashtags from value (caption) or treat value as raw hashtag string
    const hashTags = value.match(/#[a-zA-Z0-9_]+/g) ?? value.split(/[,\s]+/).filter(Boolean)
    const tagText = hashTags.slice(0, 5).join(' ')
    if (tagText) {
      tagObj.set('fill', accent)
      tagObj.set('text', tagText)
      ;(tagObj as typeof tagObj & { dirty: boolean }).dirty = true
    }
    return true
  }

  // Standard text slot
  // Match by eliteType first (built-ins like 'title', 'text', 'tag'),
  // then fall back to matching by fieldId directly (custom fields assigned via UI).
  const obj = allObjs.find(o => o.eliteType === mapping.eliteType || o.eliteType === mapping.fieldId) as
    (FabricObject & { text?: string; styles?: Record<string, unknown>; dirty?: boolean; initDimensions?: () => void; fontSize?: number; width?: number; height?: number; scaleY?: number; calcTextHeight?: () => number }) | undefined
  if (!obj) {
    console.warn(`[content-apply] applySlot: no canvas object found for eliteType="${mapping.eliteType}" or fieldId="${mapping.fieldId}"`)
    return false
  }

  console.log(`[content-apply] applySlot: matched obj type="${obj.type}" eliteType="${obj.eliteType}"`)

  if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text') {
    // Use title formatting only when the eliteType is explicitly 'title' AND we matched by eliteType
    if (mapping.eliteType === 'title' && obj.eliteType === 'title') {
      applyTitle(obj, value)
    } else {
      obj.set('text', value)
      obj.set('styles', {})
      obj.dirty = true
    }
    autoFitText(obj)
    return true
  }

  console.warn(`[content-apply] applySlot: obj type="${obj.type}" is not a text type — cannot set text`)
  return false
}

/**
 * Schema-aware async content injection.
 *
 * Resolves which slotMapping to use (carousel slide role → single post → heuristic),
 * then walks each mapping entry and injects the corresponding Post field value.
 * Falls back to the existing heuristic font-size logic when no slotMapping is found.
 * Applies locked elements at the end.
 *
 * @param canvas     Fabric canvas instance (obtained via canvasHandle.getCanvas())
 * @param post       The generated Post
 * @param schema     Active ContentSchemaConfig (or in-memory draft)
 * @param slideRole  For carousel posts — the role of this slide (e.g. 'hook', 'point', 'cta')
 * @param accent     CSS color string for highlight/tag fill (defaults to app accent CSS var)
 */
export async function applyGeneratedContentFromSchema(
  canvas: Canvas,
  post: Post,
  schema: ContentSchemaConfig,
  slideRole?: string,
  accent = getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#10b981',
): Promise<void> {
  const allObjs = collectAllObjects(canvas)
  const mapping = resolveSlotMapping(schema, slideRole)

  if (!mapping) {
    // No slot mapping configured → heuristic fallback (same as existing logic)
    console.warn('[content-apply] No slot mapping found for schema "%s", using heuristic fallback', schema.name)
    const args: GeneratedContentArgs = {
      title:           post.title,
      highlight_words: Array.isArray(post.highlight_words)
        ? post.highlight_words
        : post.highlight_words ? [post.highlight_words as unknown as string] : [],
      subtitle:        post.caption
        ? post.caption.split('\n').find(l => l.trim().length > 10)?.slice(0, 150)
        : undefined,
      tag:             post.caption
        ? (post.caption.match(/#[a-zA-Z0-9_]+/g) ?? []).slice(0, 5).join(' ')
        : undefined,
    }
    // All prefs enabled for schema-driven path
    applyGeneratedContent(canvas, args, accent, { title: true, highlights: true, subtitle: true, tag: true })
    return
  }

  // Walk each slot mapping entry, track whether anything actually landed
  let anyApplied = false
  for (const slot of mapping) {
    const raw = readPostField(post, slot.fieldId)
    const value = (raw !== undefined && raw !== '' && !isNullValue(raw)) ? raw : (slot.fallbackText ?? '')
    if (!value) continue  // skip empty — leave canvas object as-is
    const applied = applySlot(slot, value, allObjs, accent, canvas)
    if (applied) anyApplied = true
  }

  // If slotMapping was configured but NOTHING matched canvas objects
  // (template has no eliteType labels set), fall back to heuristic so
  // content always gets applied rather than silently doing nothing.
  if (!anyApplied) {
    console.warn('[content-apply] Slot mapping for schema "%s" matched no canvas objects — using heuristic fallback', schema.name)
    const args: GeneratedContentArgs = {
      title:           post.title,
      highlight_words: Array.isArray(post.highlight_words)
        ? post.highlight_words
        : post.highlight_words ? [post.highlight_words as unknown as string] : [],
      subtitle:        post.caption
        ? post.caption.split('\n').find(l => l.trim().length > 10)?.slice(0, 150)
        : undefined,
      tag:             post.caption
        ? (post.caption.match(/#[a-zA-Z0-9_]+/g) ?? []).slice(0, 5).join(' ')
        : undefined,
    }
    applyGeneratedContent(canvas, args, accent, { title: true, highlights: true, subtitle: true, tag: true })
    return
  }

  // Auto-fit all dirty text objects
  allObjs.forEach(obj => {
    const o = obj as FabricObject & { dirty?: boolean }
    if (o.dirty) {
      autoFitText(o as Parameters<typeof autoFitText>[0])
    }
  })

  canvas.renderAll()

  // ── Apply locked elements ──────────────────────────────────────────────────
  const locked = schema.singlePost?.lockedElements ?? []
  if (locked.length > 0) {
    canvas.getObjects().forEach(obj => {
      if (locked.includes(obj.eliteType ?? '')) {
        obj.set({
          selectable:    false,
          evented:       false,
          lockMovementX: true,
          lockMovementY: true,
          lockScalingX:  true,
          lockScalingY:  true,
        })
      }
    })
    canvas.renderAll()
  }
}

// ── Profile-aware content injection ───────────────────────────────────────────

/**
 * Profile-aware async content injection.
 *
 * Uses the profile's slotMapping to apply post field values to canvas objects.
 * Falls back to heuristic font-size logic when slotMapping is empty or matches nothing.
 *
 * @param canvas   Fabric canvas instance
 * @param post     The generated Post
 * @param profile  Active Profile (from getActiveProfile())
 * @param accent   CSS color string for highlights/tag fill
 */
export interface ApplyResult {
  /** true = slot mapping matched at least one canvas object */
  precise: boolean
  /** true = heuristic font-size fallback was used */
  usedHeuristic: boolean
  /** human-readable reason shown to the user */
  reason: string
  /** fieldIds that had a value but no matching canvas element */
  missedFields?: string[]
}

export async function applyGeneratedContentFromProfile(
  canvas: Canvas,
  post: Post,
  profile: Profile,
  accent = getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#10b981',
): Promise<ApplyResult> {
  const allObjs = collectAllObjects(canvas)

  // ── CANVA MODEL: eliteType IS the field ID ─────────────────────────────────
  //
  // Every canvas element with an eliteType gets filled directly from post.fields[eliteType].
  // No slotMapping table required. The slot assignment IS the mapping.
  //
  // Special built-in eliteTypes with extra behaviour:
  //   'title'            → applyTitle() (ALL CAPS + highlight words)
  //   'highlight_words'  → applies highlight styles to the title element
  //   'tag'              → extracts hashtags, sets accent fill
  //
  // The profile's explicit slotMapping is still respected as an override layer
  // (for power users who need fieldId ≠ eliteType, e.g. 'caption' → 'text').
  // ──────────────────────────────────────────────────────────────────────────

  // Flatten all post field values into allFields.
  // Priority (highest wins): post.fields > post.content > flat post properties
  const postAny = post as unknown as Record<string, unknown>
  const allFields: Record<string, string> = {}

  // 1. Flat post properties (title, caption, highlight_words, etc.)
  for (const [k, v] of Object.entries(postAny)) {
    if (v === null || v === undefined) continue
    if (Array.isArray(v)) { allFields[k] = v.join(', '); continue }
    if (typeof v === 'object') continue
    allFields[k] = String(v)
  }
  // 2. post.content dict (raw AI output object, present in StreamPost→Post conversion)
  const contentDict = postAny['content'] as Record<string, unknown> | undefined
  if (contentDict && typeof contentDict === 'object') {
    for (const [k, v] of Object.entries(contentDict)) {
      if (v !== null && v !== undefined && typeof v !== 'object')
        allFields[k] = String(v)
    }
  }
  // 3. post.fields dict overrides (schema-aware, highest priority)
  const fieldsDict = postAny['fields'] as Record<string, string> | undefined
  if (fieldsDict && typeof fieldsDict === 'object') {
    for (const [k, v] of Object.entries(fieldsDict)) {
      if (v !== null && v !== undefined) allFields[k] = String(v)
    }
  }

  console.log('[content-apply] profile:', profile.name, '| post fields:', Object.keys(allFields))
  console.log('[content-apply] canvas slots:', allObjs.map(o => o.eliteType).filter(Boolean))

  // ── Pass 1: explicit profile slotMapping (override layer) ─────────────────
  //
  // Uses an eliteType-keyed claim set so that multiple slot entries that target
  // the same canvas object (e.g. 'title' text + 'highlight_words' both go to
  // eliteType='title') don't interfere with each other in Pass 2.
  // The claimed set tracks by eliteType string, not by object reference, because
  // applySlot() does its own find() — tracking the wrong reference was the source
  // of the double-application bug.
  const claimedEliteTypes = new Set<string>()
  let anyApplied = false
  const missedFields: string[] = []

  for (const slot of (profile.slotMapping ?? [])) {
    const raw   = allFields[slot.fieldId]
    const value = (raw && !isNullValue(raw)) ? raw : (slot.fallbackText ?? '')
    if (!value) continue
    const applied = applySlot(slot, value, allObjs, accent, canvas)
    if (applied) {
      anyApplied = true
      // Mark the target eliteType as claimed so Pass 2 skips it.
      // highlight_words shares eliteType='title' — that's intentional; both fire in Pass 1.
      claimedEliteTypes.add(slot.eliteType)
    } else if (allFields[slot.fieldId]) {
      missedFields.push(slot.fieldId)
    }
  }

  // ── Pass 2: direct eliteType → fieldId match (Canva model) ────────────────
  // Every element whose eliteType exactly matches a key in allFields gets filled.
  // Skip eliteTypes already handled by an explicit slotMapping entry above.
  for (const obj of allObjs) {
    if (!obj.eliteType) continue
    const fieldId = obj.eliteType as string
    // Skip if Pass 1 already handled this eliteType
    if (claimedEliteTypes.has(fieldId)) continue
    const value = allFields[fieldId]
    if (!value || isNullValue(value)) continue

    const slot: SlotMapping = { fieldId, eliteType: fieldId }
    const applied = applySlot(slot, value, allObjs, accent, canvas)
    if (applied) {
      anyApplied = true
      claimedEliteTypes.add(fieldId)
      // Remove from missedFields if it was there
      const idx = missedFields.indexOf(fieldId)
      if (idx >= 0) missedFields.splice(idx, 1)
    }
  }

  if (!anyApplied) {
    // Nothing matched at all — full heuristic
    const prefs: PostElementPrefs = profile.studioPrefs
      ? { ...profile.studioPrefs }
      : { title: true, highlights: true, subtitle: false, tag: false }

    const args: GeneratedContentArgs = {
      title:           post.title,
      highlight_words: Array.isArray(post.highlight_words)
        ? post.highlight_words
        : post.highlight_words ? [post.highlight_words as unknown as string] : [],
      subtitle:        post.caption
        ? post.caption.split('\n').find(l => l.trim().length > 10)?.slice(0, 150)
        : undefined,
      tag:             post.caption
        ? (post.caption.match(/#[a-zA-Z0-9_]+/g) ?? []).slice(0, 5).join(' ')
        : undefined,
    }
    console.warn('[content-apply] No slots matched — heuristic fallback')
    applyGeneratedContent(canvas, args, accent, prefs)
    return {
      precise:       false,
      usedHeuristic: true,
      reason:        'No tagged elements matched AI fields — auto-filled by font size. Select elements and set Content Slot = the field ID.',
    }
  }

  // Partial heuristic disabled intentionally:
  // When the canvas has ANY tagged elements (anyApplied = true), we trust that
  // the user designed the template with explicit eliteType slots. Filling unclaimed
  // text objects with title/caption from the heuristic would clobber static layout
  // elements (decorative text, labels, etc.) that were intentionally left untagged.
  //
  // Users must tag every text element they want filled — static elements stay static.

  allObjs.forEach(obj => {
    const o = obj as FabricObject & { dirty?: boolean }
    if (o.dirty) autoFitText(o as Parameters<typeof autoFitText>[0])
  })

  canvas.renderAll()

  return {
    precise:       true,
    usedHeuristic: false,
    reason:        '',
    missedFields:  missedFields.length ? missedFields : undefined,
  }
}

// ── Image injection ───────────────────────────────────────────────────────────

/**
 * Inject an image into a specific canvas object.
 *
 * Frame path (eliteType === 'frame'):
 *   Delegates to applyImageToFrame() — frame shape, clip mask, fit mode,
 *   pan/zoom, layer ordering all preserved. Only the image fill changes.
 *
 * FabricImage / image-slot path:
 *   Figma/Canva model — the CONTAINER (bounding box) is fixed; only the
 *   image content swaps. Uses setSrc() so scaleX/scaleY/angle/clipPath
 *   are untouched. Re-scales the image content to fill the placeholder box.
 */
export async function injectImage(
  canvas: Canvas,
  targetObj: FabricObject,
  imageSrc: string,
): Promise<void> {
  if (!imageSrc || !imageSrc.trim()) return

  if (targetObj.eliteType === 'frame') {
    // ── Frame: full pipeline — shape / clip / fit mode / layer order preserved
    await new Promise<void>((resolve, reject) => {
      const imgEl = new window.Image()
      if (!imageSrc.startsWith('file://')) imgEl.crossOrigin = 'anonymous'
      imgEl.onload = (): void => {
        try { applyImageToFrame(targetObj, imgEl); canvas.renderAll(); resolve() }
        catch (e) { reject(e) }
      }
      imgEl.onerror = (): void => reject(new Error(`Failed to load image: ${imageSrc}`))
      imgEl.src = imageSrc
    })
    return
  }

  // ── FabricImage / image-area slot: Figma model ───────────────────────────
  // The placeholder bounding box is the container — it NEVER changes.
  // We compute the displayed pixel size (width * scaleX, height * scaleY),
  // load the new image, then scale it so it fills the same box.
  const target = targetObj as fabric.FabricImage & FabricObject
  const boxW = (target.width  ?? 0) * (target.scaleX ?? 1)
  const boxH = (target.height ?? 0) * (target.scaleY ?? 1)

  await new Promise<void>((resolve, reject) => {
    const imgEl = new window.Image()
    if (!imageSrc.startsWith('file://')) imgEl.crossOrigin = 'anonymous'
    imgEl.onload = (): void => {
      try {
        const iw = imgEl.naturalWidth  || imgEl.width  || 1
        const ih = imgEl.naturalHeight || imgEl.height || 1

        // Scale the new image to FILL the placeholder box (same as Figma fill mode).
        // Aspect ratio of the new image is preserved — crop if needed.
        const scale = Math.max(boxW / iw, boxH / ih)
        const newScaleX = scale
        const newScaleY = scale

        if (typeof (target as fabric.FabricImage).setSrc === 'function') {
          // setSrc keeps left/top/angle/clipPath/eliteType intact — only src changes.
          const srcOpts = imageSrc.startsWith('file://') ? {} : { crossOrigin: 'anonymous' as const }
          ;(target as fabric.FabricImage).setSrc(imageSrc, srcOpts)
            .then(() => {
              target.set({ scaleX: newScaleX, scaleY: newScaleY })
              target.setCoords()
              canvas.renderAll()
              resolve()
            })
            .catch(reject)
        } else {
          // Fallback for older Fabric builds without async setSrc
          const newImg = new fabric.FabricImage(imgEl, {
            left:      target.left,
            top:       target.top,
            angle:     target.angle,
            originX:   target.originX,
            originY:   target.originY,
            scaleX:    newScaleX,
            scaleY:    newScaleY,
            clipPath:  target.clipPath,
            eliteType: target.eliteType,
            eliteSlot: (target as FabricObject & { eliteSlot?: string }).eliteSlot,
          })
          const idx = canvas.getObjects().indexOf(target)
          canvas.remove(target)
          if (idx >= 0) canvas.insertAt(idx, newImg)
          else canvas.add(newImg)
          newImg.setCoords()
          canvas.renderAll()
          resolve()
        }
      } catch (e) { reject(e) }
    }
    imgEl.onerror = (): void => reject(new Error(`Failed to load image: ${imageSrc}`))
    imgEl.src = imageSrc
  })
}

/**
 * Find the best image slot on the canvas and inject the generated image into it.
 *
 * "Best slot" detection — no hardcoding, no eliteType required:
 *
 * Priority order (mirrors how Figma/Canva pick the target when you paste):
 *   1. eliteType === 'frame' with an existing image fill (designer already placed
 *      an image in this frame — it's clearly the hero image slot)
 *   2. eliteType === 'frame' without image fill (empty frame placeholder)
 *   3. eliteType === 'image' or 'image_area' (explicitly tagged image slot)
 *   4. A FabricImage that is NOT a frame's internal layer (_elitePrevFabricImg)
 *      — a standalone placeholder image the designer dropped on the canvas
 *
 * When multiple candidates exist at the same priority level, the largest
 * bounding-box area wins (same heuristic Python uses for CDN image picking).
 *
 * The selected object's position / size / rotation / clip shape are NEVER
 * changed — only the image content is swapped, exactly like Figma "replace image".
 */
export async function injectGeneratedImage(
  canvas: Canvas,
  imageUrl: string,
): Promise<boolean> {
  if (!imageUrl?.trim()) return false

  const allObjs = collectAllObjects(canvas)

  // Collect the internal image layers that applyImageToFrame() inserts so we
  // can exclude them from standalone-image detection in priority 4.
  const frameManagedImgs = new Set<FabricObject>(
    canvas.getObjects().filter(o =>
      (o as FabricObject & { _elitePrevFabricImg?: unknown })._elitePrevFabricImg ||
      allObjs.some(f => (f as FabricObject & { _elitePrevFabricImg?: FabricObject })._elitePrevFabricImg === o)
    ) as FabricObject[]
  )

  type Candidate = { obj: FabricObject; priority: number; area: number }
  const candidates: Candidate[] = []

  const area = (o: FabricObject): number =>
    (o.width ?? 0) * (o.scaleX ?? 1) * (o.height ?? 0) * (o.scaleY ?? 1)

  for (const obj of allObjs) {
    const et = obj.eliteType

    if (et === 'frame') {
      // Priority 1: frame with existing image fill
      if ((obj as FabricObject & { eliteImageSrc?: string }).eliteImageSrc) {
        candidates.push({ obj, priority: 1, area: area(obj) })
      } else {
        // Priority 2: empty frame
        candidates.push({ obj, priority: 2, area: area(obj) })
      }
    } else if (et === 'image' || et === 'image_area') {
      // Priority 3: explicitly tagged image slot
      candidates.push({ obj, priority: 3, area: area(obj) })
    } else if (obj instanceof fabric.FabricImage && !frameManagedImgs.has(obj)) {
      // Priority 4: standalone placeholder image (not a frame's internal layer)
      candidates.push({ obj, priority: 4, area: area(obj) })
    }
  }

  if (!candidates.length) {
    // Fallback: no designated slot — add image centered on canvas at 80% canvas size
    console.warn('[injectGeneratedImage] No image slot — adding as new background image')
    try {
      const cw = canvas.width  ?? 1080
      const ch = canvas.height ?? 1350
      const imgEl = new window.Image()
      imgEl.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        imgEl.onload = (): void => {
          const iw = imgEl.naturalWidth  || imgEl.width  || 1
          const ih = imgEl.naturalHeight || imgEl.height || 1
          const targetW = cw * 0.8
          const targetH = ch * 0.8
          const scale = Math.min(targetW / iw, targetH / ih)
          const img = new fabric.FabricImage(imgEl, {
            left:    cw / 2,
            top:     ch / 2,
            originX: 'center',
            originY: 'center',
            scaleX:  scale,
            scaleY:  scale,
          })
          canvas.add(img)
          canvas.sendObjectToBack(img)
          canvas.renderAll()
          resolve()
        }
        imgEl.onerror = (): void => reject(new Error('Failed to load fallback image'))
        imgEl.src = imageUrl
      })
      return true
    } catch (e) {
      console.error('[injectGeneratedImage] Fallback injection failed:', e)
      return false
    }
  }

  // Pick best: lowest priority number wins; within same priority, largest area wins
  candidates.sort((a, b) => a.priority !== b.priority ? a.priority - b.priority : b.area - a.area)
  const best = candidates[0]

  console.log(
    `[injectGeneratedImage] Injecting into ${best.obj.eliteType ?? best.obj.type} ` +
    `(priority ${best.priority}, ${Math.round(best.area)}px²) url: ${imageUrl.slice(0, 60)}`
  )

  try {
    await injectImage(canvas, best.obj, imageUrl)
    return true
  } catch (e) {
    console.error('[injectGeneratedImage] Injection failed:', e)
    return false
  }
}
