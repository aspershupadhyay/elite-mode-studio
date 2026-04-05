/**
 * promptBuilder.ts — Schema-driven prompt assembly for content generation.
 *
 * buildPrompt() translates a ContentSchemaConfig into a custom_instructions
 * string that the backend injects into the system prompt as
 * "## CUSTOM INSTRUCTIONS (USER OVERRIDE — FOLLOW EXACTLY)".
 *
 * The backend already handles:
 *   - The full elite_mode_instruction.md system prompt (fenced-code-block format)
 *   - Tone, persona, platform, caption_length modifiers
 *   - Tavily web search + context injection
 *   - parse_code_blocks() response parsing keyed on field names
 *
 * buildPrompt() supplements that with schema-specific field instructions so
 * the LLM knows exactly what fields to produce, their types, and any constraints.
 * It does NOT replace the backend system prompt — it layers on top.
 */

import type { ContentSchemaConfig, ContentField } from '../types/schema'

// ── Field type → instruction template ────────────────────────────────────────

function fieldTypeInstruction(field: ContentField): string {
  const hints: string[] = []

  switch (field.type) {
    case 'text':
      hints.push('string')
      if (field.maxLength) hints.push(`max ${field.maxLength} chars`)
      if (field.aiHint)    hints.push(field.aiHint)
      return hints.join(', ')

    case 'image_prompt':
      hints.push('detailed visual image generation prompt as string')
      if (field.aiHint) hints.push(field.aiHint)
      return hints.join(', ')

    case 'hashtags':
      if (field.aiHint) hints.push(field.aiHint)
      else              hints.push('array of lowercase strings, no # symbol')
      return `["string", "string"] (${hints.join(', ')})`

    case 'url':
      hints.push('source URL string')
      if (field.aiHint) hints.push(field.aiHint)
      return hints.join(', ')

    case 'number':
      hints.push('number')
      if (field.aiHint) hints.push(field.aiHint)
      return hints.join(', ')

    default:
      return field.aiHint ?? 'string'
  }
}

function fieldLine(field: ContentField): string {
  const typeDesc = fieldTypeInstruction(field)
  const req = field.required ? '(required)' : '(optional)'
  return `  "${field.id}": ${typeDesc} ${req}`
}

// ── Carousel instruction builder ──────────────────────────────────────────────

function buildCarouselInstruction(schema: ContentSchemaConfig): string {
  const { carousel, postType } = schema
  if (!postType.includes('carousel') || !carousel) return ''

  const lines: string[] = ['', 'CAROUSEL STRUCTURE:']

  if (carousel.mode === 'fixed' && carousel.fixed) {
    const { slideCount } = carousel.fixed
    lines.push(
      `Return posts as array. Each post has a "slides" array of exactly ${slideCount} objects.`,
      'Each slide has a "role" field and all content fields.'
    )
  } else if (carousel.mode === 'dynamic' && carousel.dynamic) {
    const { minSlides, maxSlides, repeatRole } = carousel.dynamic
    lines.push(
      `Return posts as array. Each post has a "slides" array of ${minSlides} to ${maxSlides} objects.`,
      'First slide role: "hook". Last slide role: "cta".',
      `Middle slides role: "${repeatRole}".`,
      'AI decides how many middle slides based on content depth.'
    )
  }

  return lines.join('\n')
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build the custom_instructions string from a ContentSchemaConfig.
 *
 * The returned string is sent to the backend as `custom_instructions`.
 * The backend injects it verbatim after all other modifiers under the heading:
 * "## CUSTOM INSTRUCTIONS (USER OVERRIDE — FOLLOW EXACTLY)"
 *
 * @param schema  The active ContentSchemaConfig (or in-memory draft)
 * @param topic   Optional user-entered topic — prepended as "Topic: <topic>"
 */
export function buildPrompt(
  schema: ContentSchemaConfig,
  topic?: string
): string {
  const { generation, fields, postType, carousel } = schema

  const parts: string[] = []

  // ── 1. Topic ─────────────────────────────────────────────────────────────
  if (topic?.trim()) {
    parts.push(`Topic: ${topic.trim()}`)
    parts.push('')
  }

  // ── 2. Tone + Language ───────────────────────────────────────────────────
  const toneStr = generation.tone?.trim() || 'neutral'
  parts.push(`Tone: ${toneStr}`)
  if (generation.language && generation.language !== 'en') {
    parts.push(`Language: ${generation.language}`)
  }

  // ── 3. User custom instructions ──────────────────────────────────────────
  if (generation.customInstructions?.trim()) {
    parts.push('')
    parts.push(generation.customInstructions.trim())
  }

  // ── 4. Field output specification ────────────────────────────────────────
  // Only emit if the schema has fields — the default backend schema handles
  // the standard fields on its own; only emit when the user has customised.
  const enabledFields = fields.filter(f => f.enabled !== false)
  if (enabledFields.length > 0) {
    parts.push('')
    parts.push('REQUIRED OUTPUT FORMAT:')
    parts.push('Return ONLY a valid JSON object. No markdown fences. No backticks. No explanation text.')
    parts.push('No text before or after the JSON.')
    parts.push('')
    parts.push('Structure:')
    parts.push('{')
    parts.push('  "posts": [')
    parts.push('    {')

    for (const field of enabledFields) {
      parts.push(fieldLine(field))
    }

    parts.push('    }')
    parts.push('  ]')
    parts.push('}')

    const postCount = generation.postCount ?? 1
    parts.push('')
    parts.push(`Generate exactly ${postCount} post${postCount !== 1 ? 's' : ''}.`)

    // ── 5. Carousel structure ─────────────────────────────────────────────
    const carouselInstr = buildCarouselInstruction(schema)
    if (carouselInstr) {
      parts.push(carouselInstr)
    }
  } else if (fields.length > 0 && enabledFields.length === 0) {
    // All fields disabled — notify AI to skip output format block
    parts.push('')
    parts.push('NOTE: All output fields are currently disabled. Generate a minimal response with just title and caption.')
  }

  // ── 6. Search context hint ────────────────────────────────────────────────
  // (Actual Tavily call happens on the backend; this is a hint for when
  // search is disabled so the LLM knows it may not have live context.)
  if (!generation.searchEnabled) {
    parts.push('')
    parts.push('NOTE: Web search is disabled. Base your response on your training knowledge.')
  }

  return parts.join('\n')
}

/**
 * Build the search query to use for Tavily.
 * Returns the user-entered topic if present, otherwise falls back to
 * schema.generation.searchQuery, otherwise returns undefined.
 */
export function buildSearchQuery(
  schema: ContentSchemaConfig,
  userTopic?: string
): string | undefined {
  if (userTopic?.trim()) return userTopic.trim()
  if (schema.generation.searchQuery?.trim()) return schema.generation.searchQuery.trim()
  return undefined
}
