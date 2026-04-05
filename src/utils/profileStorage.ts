/**
 * profileStorage.ts — Profile CRUD via localStorage
 *
 * localStorage keys:
 *   'elite_profiles'          — JSON array of Profile
 *   'elite_active_profile_id' — string id of currently active profile
 *
 * Built-in presets are never stored in localStorage — they are always
 * merged in from BUILT_IN_PRESETS at read time so updates to presets
 * are reflected automatically.
 *
 * Preset profiles (isPreset=true) cannot be deleted or overwritten.
 * Users can duplicate a preset to create an editable copy.
 */

import type { Profile } from '../types/profile'
import { BUILT_IN_PRESETS, DEFAULT_STUDIO_PREFS } from '../types/profile'

/** Migrate profiles saved before new fields were added. */
function migrate(p: Profile): Profile {
  return {
    titleMinLength: 60,
    titleMaxLength: 110,
    studioPrefs:    { ...DEFAULT_STUDIO_PREFS },
    // searchMode added later — default based on freshness so old profiles behave correctly
    searchMode:     (p.searchFreshness === 'any') ? 'general' : 'news',
    ...p,
  }
}

const PROFILES_KEY   = 'elite_profiles'
const ACTIVE_KEY     = 'elite_active_profile_id'

// ── Internal helpers ──────────────────────────────────────────────────────────

function readCustom(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY)
    if (!raw) return []
    return (JSON.parse(raw) as Profile[]).map(migrate)
  } catch {
    return []
  }
}

function writeCustom(list: Profile[]): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(list))
  window.dispatchEvent(new CustomEvent('profilesChange'))
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns all profiles: built-in presets first, then user-created custom profiles.
 */
export function getProfiles(): Profile[] {
  const custom = readCustom()
  return [...BUILT_IN_PRESETS, ...custom]
}

/**
 * Upserts a custom profile by id.
 * Refuses to overwrite built-in presets — call duplicateProfile() first.
 */
export function saveProfile(profile: Profile): void {
  if (profile.isPreset) return  // presets are immutable
  const list = readCustom()
  const idx  = list.findIndex(p => p.id === profile.id)
  if (idx >= 0) {
    list[idx] = profile
  } else {
    list.push(profile)
  }
  writeCustom(list)
}

/**
 * Deletes a custom profile by id.
 * Refuses to delete built-in presets.
 * If the deleted profile was active, falls back to first available profile.
 */
export function deleteProfile(id: string): void {
  const isPreset = BUILT_IN_PRESETS.some(p => p.id === id)
  if (isPreset) return

  const list = readCustom().filter(p => p.id !== id)
  writeCustom(list)

  const activeId = localStorage.getItem(ACTIVE_KEY)
  if (activeId === id) {
    const all    = getProfiles()
    const nextId = all[0]?.id ?? BUILT_IN_PRESETS[0].id
    localStorage.setItem(ACTIVE_KEY, nextId)
    window.dispatchEvent(new CustomEvent('profilesChange'))
  }
}

/**
 * Returns the currently active profile.
 * Falls back to the first preset if id is missing or not found.
 */
export function getActiveProfile(): Profile {
  const activeId = localStorage.getItem(ACTIVE_KEY)
  if (!activeId) return BUILT_IN_PRESETS[0]
  const all = getProfiles()
  return all.find(p => p.id === activeId) ?? BUILT_IN_PRESETS[0]
}

/**
 * Sets the active profile id.
 */
export function setActiveProfile(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id)
  window.dispatchEvent(new CustomEvent('profilesChange'))
}

/**
 * Seeds storage on first boot.
 * If no active id is set, sets the first preset as active.
 * Safe to call multiple times (idempotent).
 */
export function bootstrapProfiles(): void {
  const activeId = localStorage.getItem(ACTIVE_KEY)
  if (!activeId) {
    localStorage.setItem(ACTIVE_KEY, BUILT_IN_PRESETS[0].id)
    window.dispatchEvent(new CustomEvent('profilesChange'))
    return
  }
  // Validate active id still exists
  const all   = getProfiles()
  const valid = all.some(p => p.id === activeId)
  if (!valid) {
    localStorage.setItem(ACTIVE_KEY, BUILT_IN_PRESETS[0].id)
    window.dispatchEvent(new CustomEvent('profilesChange'))
  }
}
