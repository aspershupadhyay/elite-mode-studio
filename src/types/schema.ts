/**
 * schema.ts — Content Schema Config
 *
 * Defines the Zod schema and TypeScript types for user-configurable
 * content generation schemas. Each schema controls:
 *  - What fields the AI generates (title, caption, image_prompt, etc.)
 *  - How the LLM is prompted (systemPrompt, tone, language)
 *  - How generated fields map to canvas objects (slotMapping via eliteType)
 *  - Whether users can customize individual elements post-generation
 *
 * DEFAULT_SCHEMA is derived from the app's current hardcoded values:
 *  - Fields: extracted from ContentResponse in api.ts + prompt output blocks
 *  - slotMapping: extracted from content-apply.ts eliteType matching logic
 *  - systemPrompt: references docs/elite_mode_instruction.md (loaded by backend)
 */

import { z } from 'zod'

// ── Sub-schemas ───────────────────────────────────────────────────────────────

export const FieldSchema = z.object({
  id:           z.string(),
  label:        z.string(),
  type:         z.enum(['text', 'image_prompt', 'hashtags', 'url', 'number']),
  required:     z.boolean().default(true),
  enabled:      z.boolean().default(true),   // whether to include in AI output
  maxLength:    z.number().optional(),
  defaultValue: z.string().optional(),
  aiHint:       z.string().optional(),
})

export const SlotMappingSchema = z.object({
  fieldId:      z.string(),
  eliteType:    z.string(),
  eliteSlot:    z.string().optional(),
  fallbackText: z.string().optional(),
})

export const SinglePostSchema = z.object({
  templateId:             z.string(),
  slotMapping:            z.array(SlotMappingSchema),
  allowUserCustomization: z.boolean().default(true),
  lockedElements:         z.array(z.string()).default([]),
})

export const SlideTemplateSchema = z.object({
  slideIndex:             z.number().optional(),
  role:                   z.string().optional(),
  templateId:             z.string(),
  slotMapping:            z.array(SlotMappingSchema),
  allowUserCustomization: z.boolean().default(true),
  lockedElements:         z.array(z.string()).default([]),
})

export const CarouselSchema = z.object({
  mode: z.enum(['fixed', 'dynamic']),
  fixed: z.object({
    slideCount: z.number(),
    slides:     z.array(SlideTemplateSchema),
  }).optional(),
  dynamic: z.object({
    minSlides:      z.number().default(3),
    maxSlides:      z.number().default(10),
    slideRoles:     z.array(z.string()),
    slideTemplates: z.array(SlideTemplateSchema),
    repeatRole:     z.string().default('point'),
  }).optional(),
})

export const GenerationSchema = z.object({
  systemPrompt:       z.string(),
  tone:               z.string().optional(),
  language:           z.string().default('en'),
  customInstructions: z.string().optional(),
  postCount:          z.number().default(1),
  searchEnabled:      z.boolean().default(false),
  searchQuery:        z.string().optional(),
})

// ── Root schema ───────────────────────────────────────────────────────────────

export const ContentSchemaConfig = z.object({
  id:         z.string(),
  name:       z.string(),
  version:    z.string().default('1.0'),
  createdAt:  z.string(),
  fields:     z.array(FieldSchema),
  generation: GenerationSchema,
  postType:   z.enum(['single', 'carousel', 'both']),
  singlePost: SinglePostSchema.optional(),
  carousel:   CarouselSchema.optional(),
})

// ── TypeScript types ──────────────────────────────────────────────────────────

export type ContentSchemaConfig = z.infer<typeof ContentSchemaConfig>
export type ContentField        = z.infer<typeof FieldSchema>
export type SlotMapping         = z.infer<typeof SlotMappingSchema>
export type CarouselConfig      = z.infer<typeof CarouselSchema>
export type GenerationConfig    = z.infer<typeof GenerationSchema>
export type SinglePostConfig    = z.infer<typeof SinglePostSchema>
export type SlideTemplateConfig = z.infer<typeof SlideTemplateSchema>

// ── DEFAULT_SCHEMA ────────────────────────────────────────────────────────────
// Populated from real app values:
//
// Fields   → ContentResponse in src/types/api.ts + prompt output blocks in
//            docs/elite_mode_instruction.md (title, caption, highlight_words,
//            image_prompt_1x1)
//
// slotMapping → content-apply.ts Pass 1 eliteType matching:
//   eliteType='title'  → receives title text + highlight_words styled characters
//   eliteType='text'   → receives caption / subtitle
//   eliteType='tag'    → receives hashtags, filled with accent color
//
// systemPrompt → summary note; the full prompt lives in
//   docs/elite_mode_instruction.md and is loaded by the Python backend.
//   This field stores the user-visible description / override instructions.

export const DEFAULT_SCHEMA: ContentSchemaConfig = {
  id:        'default',
  name:      'Elite Mode Default',
  version:   '1.0',
  createdAt: new Date().toISOString(),
  postType:  'single',

  fields: [
    {
      id:        'title',
      label:     'Title',
      type:      'text',
      required:  true,
      enabled:   true,
      maxLength: 130,
      aiHint:    'ALL CAPS headline. One named actor + one specific action + one number. 60–110 characters.',
    },
    {
      id:        'caption',
      label:     'Caption',
      type:      'text',
      required:  true,
      enabled:   true,
      maxLength: 1500,
      aiHint:    'Instagram caption. Opening fact, full context, second-order consequences, analytical read, ≤5 hashtags. 1000–1500 chars.',
    },
    {
      id:       'highlight_words',
      label:    'Highlight Words',
      type:     'text',
      required: true,
      enabled:  true,
      aiHint:   '4–5 comma-separated words from the title that render in the accent color. No filler words.',
    },
    {
      id:       'image_prompt_1x1',
      label:    'Image Prompt (1:1)',
      type:     'image_prompt',
      required: false,
      enabled:  true,
      aiHint:   'Photorealistic editorial image prompt. Includes SUBJECT, COMPOSITION, SCENE, LIGHTING, COLOR, ATMOSPHERE, STYLE, TECHNICAL sections.',
    },
  ],

  generation: {
    // The full system prompt lives in docs/elite_mode_instruction.md and is
    // loaded by the Python backend at runtime. This field holds the user-facing
    // label / any additional custom instructions layered on top.
    systemPrompt:  'Elite Mode Content Forge v9.0 — geopolitics, AI, finance, business. Verified facts, named actors, specific numbers. No sensationalism.',
    tone:          'analytical',
    language:      'en',
    postCount:     1,
    searchEnabled: true,
  },

  singlePost: {
    // templateId is set by the user when they pick a template in Forge/Settings.
    // Empty string = use the active template from templateStorage.
    templateId:             '',
    allowUserCustomization: true,
    lockedElements:         [],

    slotMapping: [
      // Maps 'title' field → canvas object with eliteType='title'
      // content-apply.ts applyTitle() handles highlight_words coloring on this object
      {
        fieldId:      'title',
        eliteType:    'title',
        fallbackText: 'YOUR HEADLINE HERE',
      },
      // Maps 'highlight_words' field → same title object (applied as character styles)
      // content-apply.ts reads highlight_words from GeneratedContentArgs and styles
      // matching words inside the title textbox — not a separate object
      {
        fieldId:   'highlight_words',
        eliteType: 'title',
        eliteSlot: 'highlight_words',
      },
      // Maps 'caption' field → canvas object with eliteType='text' (subtitle slot)
      // content-apply.ts Pass 1: obj.eliteType === 'text' && prefs.subtitle && subtitle
      {
        fieldId:      'caption',
        eliteType:    'text',
        fallbackText: 'Caption goes here...',
      },
      // Maps hashtags extracted from caption → canvas object with eliteType='tag'
      // content-apply.ts Pass 1: obj.eliteType === 'tag' → set text + accent fill color
      {
        fieldId:      'caption',
        eliteType:    'tag',
        eliteSlot:    'hashtags',
        fallbackText: '#elitemode',
      },
    ],
  },
}
