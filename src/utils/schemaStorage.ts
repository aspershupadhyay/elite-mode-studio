/**
 * schemaStorage.ts — Content Schema CRUD via localStorage
 *
 * localStorage keys used:
 *   'elite_schemas'           — JSON array of ContentSchemaConfig
 *   'elite_active_schema_id'  — string id of the currently active schema
 *
 * All writes validate with ContentSchemaConfig.parse() before persisting.
 * The DEFAULT_SCHEMA is always the fallback — it is never deletable from
 * the storage layer (callers should guard in UI).
 */

import { ContentSchemaConfig, DEFAULT_SCHEMA } from '../types/schema'

const SCHEMAS_KEY    = 'elite_schemas'
const ACTIVE_KEY     = 'elite_active_schema_id'

// ── Internal helpers ──────────────────────────────────────────────────────────

function readRaw(): ContentSchemaConfig[] {
  try {
    const raw = localStorage.getItem(SCHEMAS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as ContentSchemaConfig[]
    // Migration: old schemas saved before `enabled` was added default each field to enabled=true
    return list.map(s => ({
      ...s,
      fields: s.fields.map(f => ({ ...f, enabled: f.enabled ?? true })),
    }))
  } catch {
    return []
  }
}

function writeRaw(list: ContentSchemaConfig[]): void {
  localStorage.setItem(SCHEMAS_KEY, JSON.stringify(list))
  window.dispatchEvent(new CustomEvent('schemasChange'))
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns all saved schemas.
 * If storage is empty, returns [DEFAULT_SCHEMA] — does NOT auto-write.
 * Call bootstrapSchemas() on app boot to seed storage.
 */
export function getSchemas(): ContentSchemaConfig[] {
  const list = readRaw()
  return list.length > 0 ? list : [DEFAULT_SCHEMA]
}

/**
 * Validates and upserts a schema by id.
 * Throws a ZodError if the schema fails validation.
 */
export function saveSchema(schema: ContentSchemaConfig): void {
  // Validate first — throws ZodError if invalid
  const validated = ContentSchemaConfig.parse(schema)
  const list = readRaw()
  const idx = list.findIndex(s => s.id === validated.id)
  if (idx >= 0) {
    list[idx] = validated
  } else {
    list.unshift(validated)
  }
  writeRaw(list)
}

/**
 * Removes a schema by id.
 * If the deleted schema was active, switches active to the first remaining
 * schema (or DEFAULT_SCHEMA if list becomes empty).
 * Refuses to delete the DEFAULT_SCHEMA id 'default'.
 */
export function deleteSchema(id: string): void {
  if (id === 'default') return   // DEFAULT_SCHEMA is protected
  const list = readRaw().filter(s => s.id !== id)
  writeRaw(list)

  // Fix active pointer if it pointed at the deleted schema
  const activeId = localStorage.getItem(ACTIVE_KEY)
  if (activeId === id) {
    const nextId = list[0]?.id ?? 'default'
    localStorage.setItem(ACTIVE_KEY, nextId)
  }
}

/**
 * Returns the currently active schema.
 * Reads 'elite_active_schema_id', finds it in getSchemas().
 * Falls back to DEFAULT_SCHEMA if id is missing or not found.
 */
export function getActiveSchema(): ContentSchemaConfig {
  const activeId = localStorage.getItem(ACTIVE_KEY)
  if (!activeId) return DEFAULT_SCHEMA
  const schemas = getSchemas()
  return schemas.find(s => s.id === activeId) ?? DEFAULT_SCHEMA
}

/**
 * Sets the active schema id.
 * Does not validate that the id exists — callers should ensure it does.
 */
export function setActiveSchema(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id)
  window.dispatchEvent(new CustomEvent('schemasChange'))
}

/**
 * Seeds storage on first boot:
 *  - If 'elite_schemas' is empty, saves DEFAULT_SCHEMA and sets it active.
 *  - If schemas exist but no active id is set, sets the first schema as active.
 * Safe to call multiple times (idempotent).
 */
export function bootstrapSchemas(): void {
  const list = readRaw()
  if (list.length === 0) {
    writeRaw([DEFAULT_SCHEMA])
    localStorage.setItem(ACTIVE_KEY, DEFAULT_SCHEMA.id)
    return
  }
  // Ensure active id is valid
  const activeId = localStorage.getItem(ACTIVE_KEY)
  const validActive = list.some(s => s.id === activeId)
  if (!validActive) {
    localStorage.setItem(ACTIVE_KEY, list[0]!.id)
  }
}
