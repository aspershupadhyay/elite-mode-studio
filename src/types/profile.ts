/**
 * profile.ts — AI Behavior Profile
 *
 * A Profile bundles everything needed to generate and apply content:
 *   - systemPrompt     : full user-written AI instructions (no hidden base prompt)
 *   - outputFields     : what fields the AI should return (user-defined, any count)
 *   - tone/language    : generation modifiers
 *   - slotMapping      : how fields map to canvas eliteType objects
 *   - templateId       : which Design Studio template to use
 *
 * Built-in presets (id starts with 'preset_') are non-deletable but duplicatable.
 * Users can create unlimited custom profiles.
 */

// ── Output field ──────────────────────────────────────────────────────────────

export type FieldType = 'text' | 'image_prompt' | 'hashtags' | 'url' | 'number' | 'code'

export interface OutputField {
  id:           string
  label:        string
  type:         FieldType
  enabled:      boolean
  required:     boolean
  aiHint:       string       // instruction sent to AI for this field
  maxLength?:   number
}

// ── Slot mapping ──────────────────────────────────────────────────────────────

export interface SlotMapping {
  fieldId:      string       // OutputField.id
  eliteType:    string       // canvas object eliteType ('title' | 'text' | 'tag' | 'image' | 'code' | ...)
  eliteSlot?:   string       // sub-slot hint (e.g. 'highlight_words')
  fallbackText?: string
}

// ── Studio fill preferences (per-profile) ────────────────────────────────────

export interface ProfileStudioPrefs {
  title:      boolean   // always true, locked
  highlights: boolean   // keyword highlights in accent color
  subtitle:   boolean   // first caption line → subtitle text box
  tag:        boolean   // hashtags → tag text box
}

export const DEFAULT_STUDIO_PREFS: ProfileStudioPrefs = {
  title:      true,
  highlights: true,
  subtitle:   false,
  tag:        false,
}

// ── Profile ───────────────────────────────────────────────────────────────────

export interface Profile {
  id:                 string
  name:               string
  description:        string
  isPreset:           boolean   // true = non-deletable built-in

  // AI Behavior
  systemPrompt:       string    // full system prompt, user owns it entirely
  outputFields:       OutputField[]
  tone:               string    // free-text, e.g. 'analytical', 'casual', 'punchy'
  language:           string    // BCP-47, e.g. 'en', 'hi', 'es'
  postCount:          number
  searchEnabled:      boolean
  searchFreshness:    string    // 'today' | '2days' | '7days' | 'any'
  searchMode:         string    // 'news' = breaking news | 'general' = evergreen facts/profiles
  customInstructions: string

  // Output format (per-profile)
  titleMinLength:     number    // minimum title character count
  titleMaxLength:     number    // maximum title character count
  studioPrefs:        ProfileStudioPrefs  // which fields are written to canvas

  // Canvas mapping
  slotMapping:        SlotMapping[]
  templateId:         string    // '' = use active template from templateStorage

  // Meta
  createdAt:          string
}

// ── Built-in presets ──────────────────────────────────────────────────────────

export const PRESET_ELITE_MODE: Profile = {
  id:          'preset_elite',
  name:        'Elite Mode',
  description: 'Geopolitics, AI & finance. Analytical, fact-driven, named actors.',
  isPreset:    true,

  systemPrompt: `You are an elite geopolitical and financial analyst writing for a sophisticated social media audience.

RULES:
- Every claim must cite a named source from the research context
- Use specific numbers, percentages, named actors — no vague generalisations
- Titles must be ALL CAPS, include one specific number, 60–110 characters
- Captions: 1000–1500 chars, opening fact, full context, second-order consequences, ≤5 hashtags
- No sensationalism, no fabrication, no assumptions outside the research context
- Highlight words: 4–5 high-signal words from the title that will render in accent color`,

  outputFields: [
    { id: 'title',            label: 'Title',            type: 'text',         enabled: true,  required: true,  aiHint: 'ALL CAPS headline. One named actor + one specific action + one number. 60–110 characters.', maxLength: 130 },
    { id: 'highlight_words',  label: 'Highlight Words',  type: 'text',         enabled: true,  required: true,  aiHint: '4–5 comma-separated words from the title that render in accent color. No filler words.' },
    { id: 'caption',          label: 'Caption',          type: 'text',         enabled: true,  required: true,  aiHint: 'Instagram caption. Opening fact, full context, second-order consequences, analytical read, ≤5 hashtags. 1000–1500 chars.', maxLength: 1500 },
    { id: 'image_prompt_1x1', label: 'Image Prompt 1:1', type: 'image_prompt', enabled: true,  required: false, aiHint: 'Photorealistic editorial image prompt. SUBJECT / COMPOSITION / SCENE / LIGHTING / COLOR / ATMOSPHERE / STYLE / TECHNICAL sections.' },
  ],

  tone:               'analytical',
  language:           'en',
  postCount:          1,
  searchEnabled:      true,
  searchFreshness:    '2days',
  searchMode:         'news',
  customInstructions: '',

  titleMinLength: 60,
  titleMaxLength: 110,
  studioPrefs: { title: true, highlights: true, subtitle: false, tag: false },

  slotMapping: [
    { fieldId: 'title',           eliteType: 'title', fallbackText: 'YOUR HEADLINE HERE' },
    { fieldId: 'highlight_words', eliteType: 'title', eliteSlot: 'highlight_words' },
    { fieldId: 'caption',         eliteType: 'text',  fallbackText: 'Caption goes here...' },
    { fieldId: 'caption',         eliteType: 'tag',   eliteSlot: 'hashtags', fallbackText: '#elitemode' },
  ],
  templateId: '',
  createdAt:  new Date().toISOString(),
}

export const PRESET_LIFESTYLE: Profile = {
  id:          'preset_lifestyle',
  name:        'Lifestyle Brand',
  description: 'Casual, aspirational content for lifestyle, fashion, food, travel.',
  isPreset:    true,

  systemPrompt: `You are a creative content strategist for a lifestyle brand on social media.

RULES:
- Tone is warm, aspirational, and relatable — never corporate
- Lead with an emotion or scene, not a fact
- Caption: 300–600 chars, punchy sentences, end with a CTA or question
- Hashtags: relevant, community-based, mix of niche and broad
- Image prompts: lifestyle photography aesthetic, natural light, authentic moments`,

  outputFields: [
    { id: 'title',        label: 'Hook',        type: 'text',         enabled: true,  required: true,  aiHint: 'Short punchy hook. 5–10 words. Creates curiosity or emotion.', maxLength: 80 },
    { id: 'caption',      label: 'Caption',     type: 'text',         enabled: true,  required: true,  aiHint: 'Warm, conversational caption 300–600 chars. End with question or CTA.', maxLength: 600 },
    { id: 'hashtags',     label: 'Hashtags',    type: 'hashtags',     enabled: true,  required: false, aiHint: '10–15 relevant hashtags. Mix of niche and broad. No # symbol.' },
    { id: 'image_prompt', label: 'Image Prompt', type: 'image_prompt', enabled: true, required: false, aiHint: 'Lifestyle photography. Natural light, authentic setting, warm tones.' },
    { id: 'cta',          label: 'CTA',         type: 'text',         enabled: true,  required: false, aiHint: 'Short call-to-action. 1 sentence. Invites engagement.' },
  ],

  tone:               'casual',
  language:           'en',
  postCount:          1,
  searchEnabled:      false,
  searchFreshness:    'any',
  searchMode:         'general',
  customInstructions: '',

  titleMinLength: 50,
  titleMaxLength: 80,
  studioPrefs: { title: true, highlights: false, subtitle: true, tag: true },

  slotMapping: [
    { fieldId: 'title',   eliteType: 'title', fallbackText: 'Hook here' },
    { fieldId: 'caption', eliteType: 'text',  fallbackText: 'Caption here...' },
    { fieldId: 'hashtags',eliteType: 'tag',   fallbackText: '#lifestyle' },
  ],
  templateId: '',
  createdAt:  new Date().toISOString(),
}

export const PRESET_TECH_CODE: Profile = {
  id:          'preset_tech',
  name:        'Tech & Code',
  description: 'Developer content with code examples, tutorials, and tech insights.',
  isPreset:    true,

  systemPrompt: `You are a senior software engineer and technical educator creating content for developers.

RULES:
- Be precise and technically accurate — no hand-wavy explanations
- Include concrete code examples when relevant (use triple-backtick fences for code)
- Titles: clear, benefit-driven, include the technology name
- Captions: educational flow — problem → solution → why it matters
- Code snippets: clean, minimal, runnable — include language identifier in fences
- Hashtags: dev community tags only`,

  outputFields: [
    { id: 'title',        label: 'Title',       type: 'text',         enabled: true,  required: true,  aiHint: 'Clear benefit-driven title. Include technology name. 50–90 chars.', maxLength: 90 },
    { id: 'caption',      label: 'Caption',     type: 'text',         enabled: true,  required: true,  aiHint: 'Educational caption. Problem → solution → why it matters. 500–900 chars.', maxLength: 900 },
    { id: 'code_example', label: 'Code Example', type: 'code',        enabled: true,  required: false, aiHint: 'Clean minimal runnable code snippet. Use triple-backtick fences with language identifier.' },
    { id: 'hashtags',     label: 'Hashtags',    type: 'hashtags',     enabled: true,  required: false, aiHint: '5–8 developer community hashtags. No # symbol.' },
    { id: 'image_prompt', label: 'Image Prompt', type: 'image_prompt', enabled: false, required: false, aiHint: 'Tech/developer aesthetic. Dark theme code editor, clean desk setup.' },
  ],

  tone:               'educational',
  language:           'en',
  postCount:          1,
  searchEnabled:      false,
  searchFreshness:    'any',
  searchMode:         'general',
  customInstructions: '',

  titleMinLength: 50,
  titleMaxLength: 90,
  studioPrefs: { title: true, highlights: false, subtitle: true, tag: true },

  slotMapping: [
    { fieldId: 'title',        eliteType: 'title', fallbackText: 'Tech tip here' },
    { fieldId: 'caption',      eliteType: 'text',  fallbackText: 'Explanation here...' },
    { fieldId: 'hashtags',     eliteType: 'tag',   fallbackText: '#coding' },
  ],
  templateId: '',
  createdAt:  new Date().toISOString(),
}

export const PRESET_BLANK: Profile = {
  id:          'preset_blank',
  name:        'Blank Profile',
  description: 'Start from scratch. Define your own AI behavior, fields, and mappings.',
  isPreset:    true,

  systemPrompt: 'You are a social media content creator. Generate engaging content based on the topic provided.',

  outputFields: [
    { id: 'title',   label: 'Title',   type: 'text', enabled: true, required: true,  aiHint: 'Engaging title for the post.', maxLength: 120 },
    { id: 'caption', label: 'Caption', type: 'text', enabled: true, required: true,  aiHint: 'Main body of the post.', maxLength: 1200 },
  ],

  tone:               '',
  language:           'en',
  postCount:          1,
  searchEnabled:      false,
  searchFreshness:    'any',
  searchMode:         'general',
  customInstructions: '',

  titleMinLength: 60,
  titleMaxLength: 110,
  studioPrefs: { title: true, highlights: true, subtitle: false, tag: false },

  slotMapping: [
    { fieldId: 'title',   eliteType: 'title', fallbackText: 'Title here' },
    { fieldId: 'caption', eliteType: 'text',  fallbackText: 'Caption here...' },
  ],
  templateId: '',
  createdAt:  new Date().toISOString(),
}

export const BUILT_IN_PRESETS: Profile[] = [
  PRESET_ELITE_MODE,
  PRESET_LIFESTYLE,
  PRESET_TECH_CODE,
  PRESET_BLANK,
]

// ── Helper ────────────────────────────────────────────────────────────────────

export function blankProfile(): Profile {
  return {
    id:                 `profile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name:               'New Profile',
    description:        '',
    isPreset:           false,
    systemPrompt:       '',
    outputFields:       [
      { id: 'title',   label: 'Title',   type: 'text', enabled: true, required: true,  aiHint: '', maxLength: 120 },
      { id: 'caption', label: 'Caption', type: 'text', enabled: true, required: false, aiHint: '' },
    ],
    tone:               '',
    language:           'en',
    postCount:          1,
    searchEnabled:      true,
    searchFreshness:    '2days',
    searchMode:         'news',
    customInstructions: '',
    titleMinLength:     60,
    titleMaxLength:     110,
    studioPrefs:        { title: true, highlights: true, subtitle: false, tag: false },
    slotMapping:        [],
    templateId:         '',
    createdAt:          new Date().toISOString(),
  }
}

export function duplicateProfile(source: Profile): Profile {
  return {
    ...source,
    id:       `profile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name:     `${source.name} (Copy)`,
    isPreset: false,
    createdAt: new Date().toISOString(),
  }
}
