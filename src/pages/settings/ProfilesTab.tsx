/**
 * ProfilesTab.tsx — AI Behavior Profile Editor
 *
 * Layout (matches wireframe):
 *   Col 1 (180px) — profile list + New button
 *   Col 2 (flex)  — tab bar (AI Identity | AI Behavior | Output Fields | Canvas Slot | Template)
 *                 — tab content panel below
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { T, Icons } from './shared'
import { getProfiles, saveProfile, deleteProfile, getActiveProfile, setActiveProfile } from '../../utils/profileStorage'
import { blankProfile, duplicateProfile } from '../../types/profile'
import type { Profile, OutputField, SlotMapping, FieldType } from '../../types/profile'
import { getTemplates } from '../../studio/data/templateStorage'
import type { Template } from '@/types/domain'
import { KNOWN_ELITE_TYPES } from '@/types/fabric-custom'

// ── Constants ─────────────────────────────────────────────────────────────────

const FIELD_TYPES: FieldType[] = ['text', 'image_prompt', 'hashtags', 'url', 'number', 'code']
const FRESHNESS_OPTIONS = [
  { value: 'today', label: 'Today only' },
  { value: '2days', label: 'Last 2 days' },
  { value: '7days', label: 'Last 7 days' },
  { value: 'any',   label: 'No date filter' },
]
const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
]

type EditorTab = 'identity' | 'behavior' | 'fields' | 'mapping' | 'template'

const TABS: { id: EditorTab; label: string }[] = [
  { id: 'identity', label: 'AI Identity'   },
  { id: 'behavior', label: 'AI Behavior'   },
  { id: 'fields',   label: 'Output Fields' },
  { id: 'mapping',  label: 'Canvas Slot'   },
  { id: 'template', label: 'Template'      },
]

function genFieldId(): string {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`
}

// ── Shared input style helpers ─────────────────────────────────────────────────

function inp(disabled: boolean): React.CSSProperties {
  return {
    width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '8px 12px',
    background: disabled ? T.bg3 : T.bg,
    border: `1px solid ${T.border}`, borderRadius: 8,
    color: disabled ? T.text3 : T.text,
    cursor: disabled ? 'not-allowed' : 'text',
    outline: 'none',
  }
}

function label(text: string): React.ReactElement {
  return <p style={{ fontSize: 11, color: T.text3, marginBottom: 5, fontWeight: 500 }}>{text}</p>
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg, ok }: { msg: string; ok: boolean }): React.ReactElement {
  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, padding: '9px 20px', borderRadius: 9,
      background: ok ? T.accent : T.red, color: '#fff',
      fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)', pointerEvents: 'none',
    }}>{msg}</div>
  )
}

// ── Output Field Row ──────────────────────────────────────────────────────────

function FieldRow({
  field, onChange, onDelete, canDelete, isPreset,
}: {
  field: OutputField; onChange: (f: OutputField) => void
  onDelete: () => void; canDelete: boolean; isPreset: boolean
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 9, overflow: 'hidden', marginBottom: 8 }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: T.bg2 }}>
        {/* Toggle */}
        <button
          onClick={() => !isPreset && onChange({ ...field, enabled: !field.enabled })}
          disabled={isPreset}
          style={{
            width: 30, height: 17, borderRadius: 9, border: 'none', flexShrink: 0,
            background: field.enabled ? T.accent : T.bg4,
            position: 'relative', transition: 'background .15s',
            cursor: isPreset ? 'not-allowed' : 'pointer',
          }}
        >
          <div style={{
            position: 'absolute', top: 2.5, left: field.enabled ? 15 : 2.5,
            width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left .15s',
          }} />
        </button>
        {/* ID */}
        <input
          value={field.id} disabled={isPreset}
          onChange={e => onChange({ ...field, id: e.target.value.replace(/\s+/g, '_').toLowerCase() })}
          placeholder="field_id"
          style={{ width: 110, fontSize: 11, fontFamily: 'monospace', padding: '4px 7px',
            background: isPreset ? T.bg3 : T.bg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text }}
        />
        {/* Label */}
        <input
          value={field.label} disabled={isPreset}
          onChange={e => onChange({ ...field, label: e.target.value })}
          placeholder="Label"
          style={{ flex: 1, fontSize: 12, padding: '4px 7px',
            background: isPreset ? T.bg3 : T.bg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text }}
        />
        {/* Type */}
        <select
          value={field.type} disabled={isPreset}
          onChange={e => onChange({ ...field, type: e.target.value as FieldType })}
          style={{ fontSize: 11, padding: '4px 7px', background: isPreset ? T.bg3 : T.bg,
            border: `1px solid ${T.border}`, borderRadius: 6, color: T.text2,
            cursor: isPreset ? 'not-allowed' : 'pointer' }}
        >
          {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => setExpanded(x => !x)} style={{
          padding: '3px 8px', borderRadius: 5, border: `1px solid ${T.border}`,
          background: expanded ? T.bg3 : 'transparent', color: T.text3, fontSize: 10, cursor: 'pointer',
        }}>{expanded ? '▲' : '▼'}</button>
        {canDelete && (
          <button onClick={onDelete} style={{
            padding: '3px 7px', borderRadius: 5, border: `1px solid ${T.red}30`,
            background: 'transparent', color: T.red, fontSize: 11, cursor: 'pointer',
          }}>✕</button>
        )}
      </div>
      {/* Expanded */}
      {expanded && (
        <div style={{ padding: '12px 14px', background: T.bg3, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <p style={{ fontSize: 10, color: T.text3, marginBottom: 4 }}>AI Hint — sent to AI for this field</p>
            <textarea
              value={field.aiHint} disabled={isPreset}
              onChange={e => onChange({ ...field, aiHint: e.target.value })}
              placeholder="e.g. ALL CAPS headline, 60–110 characters..."
              rows={2}
              style={{ width: '100%', fontSize: 11, padding: '6px 8px', resize: 'vertical',
                background: isPreset ? T.bg2 : T.bg, border: `1px solid ${T.border}`,
                borderRadius: 6, color: T.text, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.text2, cursor: 'pointer' }}>
              <input type="checkbox" checked={field.required} disabled={isPreset}
                onChange={e => onChange({ ...field, required: e.target.checked })} />
              Required
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: T.text3 }}>Max length</span>
              <input
                type="number" min={0} disabled={isPreset}
                value={field.maxLength ?? ''}
                onChange={e => onChange({ ...field, maxLength: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="—"
                style={{ width: 72, fontSize: 11, padding: '4px 7px',
                  background: isPreset ? T.bg2 : T.bg, border: `1px solid ${T.border}`, borderRadius: 5, color: T.text }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Slot Mapping Row ──────────────────────────────────────────────────────────

function SlotRow({
  slot, fieldIds, onChange, onDelete,
}: {
  slot: SlotMapping; fieldIds: string[]
  onChange: (s: SlotMapping) => void; onDelete: () => void
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
      <select value={slot.fieldId} onChange={e => {
        const fid = e.target.value
        // Auto-populate eliteType with fieldId when eliteType is empty or same as old fieldId
        const autoElite = (!slot.eliteType || slot.eliteType === slot.fieldId) ? fid : slot.eliteType
        onChange({ ...slot, fieldId: fid, eliteType: autoElite })
      }}
        style={{ flex: 1, fontSize: 11, padding: '6px 8px', background: T.bg,
          border: `1px solid ${T.border}`, borderRadius: 7, color: T.text }}>
        <option value="">— field —</option>
        {fieldIds.map(id => <option key={id} value={id}>{id}</option>)}
      </select>
      <span style={{ fontSize: 12, color: T.text3, flexShrink: 0 }}>→</span>
      <input
        list="elite-types-list"
        value={slot.eliteType}
        onChange={e => onChange({ ...slot, eliteType: e.target.value })}
        placeholder="canvas type"
        style={{ flex: 1, fontSize: 11, padding: '6px 8px', background: T.bg,
          border: `1px solid ${T.border}`, borderRadius: 7, color: T.text }}
      />
      <datalist id="elite-types-list">
        {KNOWN_ELITE_TYPES.map(t => <option key={t} value={t} />)}
      </datalist>
      <input value={slot.eliteSlot ?? ''} onChange={e => onChange({ ...slot, eliteSlot: e.target.value || undefined })}
        placeholder="sub-slot"
        style={{ width: 74, fontSize: 11, padding: '6px 7px', background: T.bg,
          border: `1px solid ${T.border}`, borderRadius: 7, color: T.text2 }} />
      <input value={slot.fallbackText ?? ''} onChange={e => onChange({ ...slot, fallbackText: e.target.value || undefined })}
        placeholder="fallback"
        style={{ width: 84, fontSize: 11, padding: '6px 7px', background: T.bg,
          border: `1px solid ${T.border}`, borderRadius: 7, color: T.text2 }} />
      <button onClick={onDelete} style={{
        padding: '4px 8px', borderRadius: 5, border: `1px solid ${T.red}30`,
        background: 'transparent', color: T.red, fontSize: 11, cursor: 'pointer', flexShrink: 0,
      }}>✕</button>
    </div>
  )
}

// ── Profile Editor — tab content panels ───────────────────────────────────────

function ProfileEditor({
  profile, isActive, activeTab, onSave, onSetActive,
}: {
  profile: Profile
  isActive: boolean
  activeTab: EditorTab
  onSave: (p: Profile, silent?: boolean) => void
  onSetActive: (id: string) => void
}): React.ReactElement {
  const [draft, setDraft] = useState<Profile>(profile)
  const [templates, setTemplates] = useState<Template[]>([])
  const isPreset = profile.isPreset
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setDraft(profile) }, [profile])
  useEffect(() => {
    const result = getTemplates()
    if (result instanceof Promise) {
      result.then(t => setTemplates(t)).catch(() => {})
    } else {
      setTemplates(result as Template[])
    }
  }, [])

  function patch(partial: Partial<Profile>): void {
    if (isPreset) return
    setDraft(d => {
      const updated = { ...d, ...partial }
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => { onSave(updated, true) }, 400)
      return updated
    })
  }

  function saveField(idx: number, f: OutputField): void {
    const fields = [...draft.outputFields]; fields[idx] = f; patch({ outputFields: fields })
  }
  function addField(): void {
    patch({ outputFields: [...draft.outputFields, { id: genFieldId(), label: 'New Field', type: 'text', enabled: true, required: false, aiHint: '' }] })
  }
  function deleteField(idx: number): void {
    patch({ outputFields: draft.outputFields.filter((_, i) => i !== idx) })
  }
  function saveSlot(idx: number, s: SlotMapping): void {
    const slots = [...draft.slotMapping]; slots[idx] = s; patch({ slotMapping: slots })
  }
  function addSlot(): void {
    patch({ slotMapping: [...draft.slotMapping, { fieldId: '', eliteType: '' }] })
  }
  function deleteSlot(idx: number): void {
    patch({ slotMapping: draft.slotMapping.filter((_, i) => i !== idx) })
  }

  const fieldIds = draft.outputFields.map(f => f.id).filter(Boolean)

  // ── Preset notice banner ──────────────────────────────────────────────
  const presetBanner = isPreset ? (
    <div style={{
      padding: '8px 14px', borderRadius: 8, marginBottom: 16,
      background: `${T.accent}15`, border: `1px solid ${T.accentBd}`,
      fontSize: 11, color: T.text3,
    }}>
      Built-in preset — read-only. <strong style={{ color: T.text2 }}>Duplicate</strong> it to make a custom copy.
    </div>
  ) : null

  // ── Tab: AI Identity ──────────────────────────────────────────────────
  if (activeTab === 'identity') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {presetBanner}
      <div>
        {label('Profile Name')}
        <input value={draft.name} disabled={isPreset}
          onChange={e => patch({ name: e.target.value })}
          style={{ ...inp(isPreset), fontSize: 15, fontWeight: 600 }} />
      </div>
      <div>
        {label('Description')}
        <input value={draft.description} disabled={isPreset}
          onChange={e => patch({ description: e.target.value })}
          placeholder="Short description of this profile's use case"
          style={inp(isPreset)} />
      </div>
      <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
        {isActive ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: T.accent, background: T.accentDim,
            border: `1px solid ${T.accentBd}`, borderRadius: 20, padding: '5px 14px' }}>
            ● ACTIVE
          </span>
        ) : (
          <button onClick={() => onSetActive(profile.id)} style={{
            fontSize: 12, fontWeight: 600, color: T.text2, background: T.bg3,
            border: `1px solid ${T.border}`, borderRadius: 20, padding: '5px 14px', cursor: 'pointer',
          }}>
            Set as Active Profile
          </button>
        )}
        {!isPreset && (
          <span style={{ fontSize: 10, color: T.text3, display: 'flex', alignItems: 'center', marginLeft: 4 }}>
            auto-saves
          </span>
        )}
      </div>
    </div>
  )

  // ── Tab: AI Behavior ──────────────────────────────────────────────────
  if (activeTab === 'behavior') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {presetBanner}

      {/* ── Row 1: Quick settings ───────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10,
        padding: '14px 16px', borderRadius: 10,
        background: T.bg2, border: `1px solid ${T.border}`,
      }}>
        {/* Tone */}
        <div>
          <p style={{ fontSize: 10, color: T.text3, marginBottom: 5, fontWeight: 500 }}>Writing Style</p>
          <input value={draft.tone} disabled={isPreset}
            onChange={e => patch({ tone: e.target.value })}
            placeholder="e.g. analytical, casual..."
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '7px 10px',
              background: isPreset ? T.bg3 : T.bg, border: `1px solid ${T.border}`,
              borderRadius: 7, color: T.text, outline: 'none' }} />
        </div>
        {/* Language */}
        <div>
          <p style={{ fontSize: 10, color: T.text3, marginBottom: 5, fontWeight: 500 }}>Language</p>
          <select value={draft.language} disabled={isPreset}
            onChange={e => patch({ language: e.target.value })}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '7px 10px',
              background: isPreset ? T.bg3 : T.bg, border: `1px solid ${T.border}`,
              borderRadius: 7, color: T.text, cursor: isPreset ? 'not-allowed' : 'pointer' }}>
            {LANGUAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {/* Posts per run */}
        <div>
          <p style={{ fontSize: 10, color: T.text3, marginBottom: 5, fontWeight: 500 }}>Posts per Run</p>
          <input type="number" min={1} max={20} value={draft.postCount} disabled={isPreset}
            onChange={e => patch({ postCount: Math.max(1, Number(e.target.value)) })}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '7px 10px',
              background: isPreset ? T.bg3 : T.bg, border: `1px solid ${T.border}`,
              borderRadius: 7, color: T.text, outline: 'none' }} />
        </div>
        {/* Web Search + Freshness combined */}
        <div>
          <p style={{ fontSize: 10, color: T.text3, marginBottom: 5, fontWeight: 500 }}>
            Web Search
            <span style={{ marginLeft: 6, fontSize: 9, color: draft.searchEnabled ? T.accent : T.text3 }}>
              {draft.searchEnabled ? '● on' : '○ off'}
            </span>
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={isPreset}
              onClick={() => patch({ searchEnabled: !draft.searchEnabled })}
              style={{
                width: 36, height: 20, borderRadius: 10, border: 'none', flexShrink: 0,
                background: draft.searchEnabled ? T.accent : T.bg4,
                position: 'relative', transition: 'background .15s',
                cursor: isPreset ? 'not-allowed' : 'pointer',
              }}>
              <div style={{
                position: 'absolute', top: 3, left: draft.searchEnabled ? 18 : 3,
                width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .15s',
              }} />
            </button>
            <select value={draft.searchFreshness} disabled={isPreset || !draft.searchEnabled}
              onChange={e => patch({ searchFreshness: e.target.value })}
              style={{ flex: 1, fontSize: 11, padding: '4px 6px',
                background: isPreset || !draft.searchEnabled ? T.bg3 : T.bg,
                border: `1px solid ${T.border}`, borderRadius: 7,
                color: draft.searchEnabled ? T.text : T.text3,
                cursor: isPreset ? 'not-allowed' : 'pointer', opacity: draft.searchEnabled ? 1 : 0.5 }}>
              {FRESHNESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={draft.searchMode ?? 'news'} disabled={isPreset || !draft.searchEnabled}
              onChange={e => patch({ searchMode: e.target.value })}
              style={{ flex: 1, fontSize: 11, padding: '4px 6px',
                background: isPreset || !draft.searchEnabled ? T.bg3 : T.bg,
                border: `1px solid ${T.border}`, borderRadius: 7,
                color: draft.searchEnabled ? T.text : T.text3,
                cursor: isPreset ? 'not-allowed' : 'pointer', opacity: draft.searchEnabled ? 1 : 0.5 }}>
              <option value="news">News search</option>
              <option value="general">General web</option>
            </select>
          </div>
          <p style={{ fontSize: 10, color: T.text3, marginTop: 4, lineHeight: 1.4 }}>
            <strong style={{ color: T.text }}>News search</strong> — breaking stories, current events.{'  '}
            <strong style={{ color: T.text }}>General web</strong> — profiles, stats, evergreen facts.
          </p>
        </div>
      </div>

      {/* ── Row 2: AI Instructions ──────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 2 }}>AI Instructions</p>
            <p style={{ fontSize: 11, color: T.text3, lineHeight: 1.4 }}>
              Tell the AI who it is and how to write. This is the main "brain" of your profile.
            </p>
          </div>
          <span style={{ fontSize: 10, color: T.text3, flexShrink: 0, marginLeft: 12 }}>
            {draft.systemPrompt.length} chars
          </span>
        </div>
        <textarea
          value={draft.systemPrompt} disabled={isPreset}
          onChange={e => patch({ systemPrompt: e.target.value })}
          rows={10}
          placeholder={`Example:\nYou are an expert financial analyst writing for a sophisticated audience.\n- Be precise and cite specific numbers\n- Use named sources, not vague references\n- Keep tone analytical but accessible`}
          style={{
            width: '100%', boxSizing: 'border-box', fontSize: 12, fontFamily: 'monospace',
            padding: '12px 14px', resize: 'vertical', lineHeight: 1.7,
            background: isPreset ? T.bg3 : T.bg2, border: `1px solid ${T.border}`,
            borderRadius: 10, color: isPreset ? T.text3 : T.text, outline: 'none',
          }}
        />
      </div>

      {/* ── Row 3: Quick override ───────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 2 }}>
            Quick Override
            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 400, color: T.text3 }}>optional</span>
          </p>
          <p style={{ fontSize: 11, color: T.text3, lineHeight: 1.4 }}>
            A short note added at the end of every generation. Use it for quick one-off tweaks
            without editing the main instructions — e.g. <em style={{ color: T.text2 }}>"always end with a question"</em> or
            <em style={{ color: T.text2 }}> "today focus on US market impact"</em>.
          </p>
        </div>
        <textarea
          value={draft.customInstructions} disabled={isPreset}
          onChange={e => patch({ customInstructions: e.target.value })}
          rows={3}
          placeholder="e.g. always end with a question to drive engagement..."
          style={{
            width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '10px 14px',
            resize: 'vertical', lineHeight: 1.6,
            background: isPreset ? T.bg3 : T.bg2, border: `1px solid ${T.border}`,
            borderRadius: 10, color: isPreset ? T.text3 : T.text, outline: 'none',
          }}
        />
      </div>

      {/* ── Row 4: Title Length ──────────────────────────────────────── */}
      <div style={{
        padding: '14px 16px', borderRadius: 10,
        background: T.bg2, border: `1px solid ${T.border}`,
      }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 2 }}>Title Length</p>
        <p style={{ fontSize: 11, color: T.text3, marginBottom: 14, lineHeight: 1.5 }}>
          Character limits enforced on every generated title for this profile.
        </p>
        {/* Presets */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {([
            { label: 'Compact',   min: 50,  max: 80  },
            { label: 'Standard',  min: 60,  max: 110 },
            { label: 'Long-form', min: 80,  max: 140 },
          ] as const).map(p => {
            const active = draft.titleMinLength === p.min && draft.titleMaxLength === p.max
            return (
              <button key={p.label} disabled={isPreset}
                onClick={() => patch({ titleMinLength: p.min, titleMaxLength: p.max })}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, cursor: isPreset ? 'not-allowed' : 'pointer',
                  border: `1px solid ${active ? T.violet : T.border2}`,
                  background: active ? T.violetBg : T.bg,
                  color: active ? T.violetL : T.text2, fontSize: 11,
                }}>
                <div style={{ fontWeight: 600 }}>{p.label}</div>
                <div style={{ fontSize: 10, opacity: 0.7, marginTop: 1 }}>{p.min}–{p.max}</div>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 10, color: T.text3, marginBottom: 6, fontWeight: 500 }}>Min characters</p>
            <input type="range" min={30} max={100} value={draft.titleMinLength} disabled={isPreset}
              onChange={e => patch({ titleMinLength: Number(e.target.value) })}
              style={{ width: '100%', accentColor: T.violet, cursor: isPreset ? 'not-allowed' : 'pointer' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.text3, marginTop: 3 }}>
              <span>30</span>
              <span style={{ color: T.violetL, fontWeight: 700, fontFamily: 'monospace' }}>{draft.titleMinLength}</span>
              <span>100</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 10, color: T.text3, marginBottom: 6, fontWeight: 500 }}>Max characters</p>
            <input type="range" min={70} max={160} value={draft.titleMaxLength} disabled={isPreset}
              onChange={e => patch({ titleMaxLength: Number(e.target.value) })}
              style={{ width: '100%', accentColor: T.violet, cursor: isPreset ? 'not-allowed' : 'pointer' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.text3, marginTop: 3 }}>
              <span>70</span>
              <span style={{ color: T.violetL, fontWeight: 700, fontFamily: 'monospace' }}>{draft.titleMaxLength}</span>
              <span>160</span>
            </div>
          </div>
        </div>
        <div style={{
          marginTop: 12, padding: '8px 12px', borderRadius: 7,
          background: T.violetBg, border: `1px solid ${T.violetBd}`,
          fontSize: 11, color: T.violetL,
        }}>
          Range: <strong>{draft.titleMinLength}–{draft.titleMaxLength} characters</strong>
        </div>
      </div>

      {/* ── Row 5: Studio Fill ───────────────────────────────────────── */}
      <div style={{
        padding: '14px 16px', borderRadius: 10,
        background: T.bg2, border: `1px solid ${T.border}`,
      }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 2 }}>Studio Fill</p>
        <p style={{ fontSize: 11, color: T.text3, marginBottom: 14, lineHeight: 1.5 }}>
          Which output fields are written to the canvas. Each row maps an AI field → canvas slot (eliteType).
          Go to <strong>Canvas Slot</strong> tab to change the mapping.
        </p>
        {draft.outputFields.filter(f => f.enabled !== false).length === 0 ? (
          <p style={{ fontSize: 11, color: T.text3, opacity: 0.6 }}>No output fields defined.</p>
        ) : (
          draft.outputFields.filter(f => f.enabled !== false).map((f, i, arr) => {
            const mapping = draft.slotMapping.find(m => m.fieldId === f.id)
            const canvasSlot = mapping?.eliteType ?? '—'
            const hasMapping = !!mapping
            return (
              <div key={f.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : 'none',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: T.text, margin: 0 }}>{f.label || f.id}</p>
                  <p style={{ fontSize: 11, color: T.text3, margin: 0, marginTop: 2 }}>
                    {hasMapping
                      ? <span>→ canvas slot: <code style={{ fontFamily: 'monospace', background: T.bg3, padding: '1px 4px', borderRadius: 3, fontSize: 10 }}>{canvasSlot}</code></span>
                      : <span style={{ color: '#f59e0b' }}>⚠ no canvas slot mapped — go to Canvas Slot tab</span>
                    }
                  </p>
                </div>
                <div style={{
                  fontSize: 10, color: hasMapping ? T.accent : T.text3,
                  fontWeight: 600, marginLeft: 12, flexShrink: 0,
                  padding: '3px 8px', borderRadius: 4,
                  background: hasMapping ? `${T.accent}18` : T.bg3,
                  border: `1px solid ${hasMapping ? `${T.accent}40` : T.border}`,
                }}>
                  {hasMapping ? 'MAPPED' : 'UNMAPPED'}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )

  // ── Tab: Output Fields ────────────────────────────────────────────────
  if (activeTab === 'fields') return (
    <div>
      {presetBanner}
      <p style={{ fontSize: 11, color: T.text3, marginBottom: 14, lineHeight: 1.5 }}>
        Define what fields the AI must return. Each enabled field becomes an XML tag in the response.
        The field <code style={{ fontFamily: 'monospace', background: T.bg3, padding: '1px 5px', borderRadius: 4 }}>id</code> is
        the XML tag name.
      </p>
      {draft.outputFields.map((f, i) => (
        <FieldRow
          key={f.id || i}
          field={f}
          isPreset={isPreset}
          onChange={updated => saveField(i, updated)}
          onDelete={() => deleteField(i)}
          canDelete={!isPreset && draft.outputFields.length > 1}
        />
      ))}
      {!isPreset && (
        <button onClick={addField} style={{
          width: '100%', padding: '10px', borderRadius: 8, marginTop: 4,
          border: `1px dashed ${T.border}`, background: 'transparent',
          color: T.text3, fontSize: 12, cursor: 'pointer',
        }}>
          + Add Field
        </button>
      )}
    </div>
  )

  // ── Tab: Canvas Slot Mapping ──────────────────────────────────────────
  if (activeTab === 'mapping') return (
    <div>
      {presetBanner}
      <p style={{ fontSize: 11, color: T.text3, marginBottom: 14, lineHeight: 1.5 }}>
        Map AI output fields → canvas elements. The <strong style={{ color: T.text2 }}>Canvas Type</strong> must match
        what you tagged the element with in Design Studio (right-click → Assign Content Slot).
        For custom fields, it auto-fills to the field ID — just tag your canvas element with the same value.
      </p>
      {/* Column headers */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        {['Field ID', '→ Canvas Type', 'Sub-slot', 'Fallback text', ''].map((h, i) => (
          <span key={i} style={{
            flex: i === 4 ? 0 : 1, width: i === 4 ? 32 : 'auto',
            fontSize: 9, color: T.text3, textTransform: 'uppercase', letterSpacing: '.07em',
          }}>{h}</span>
        ))}
      </div>
      {draft.slotMapping.map((s, i) => (
        <SlotRow key={i} slot={s} fieldIds={fieldIds}
          onChange={updated => saveSlot(i, updated)}
          onDelete={() => deleteSlot(i)} />
      ))}
      {!isPreset && (
        <button onClick={addSlot} style={{
          width: '100%', padding: '10px', borderRadius: 8, marginTop: 4,
          border: `1px dashed ${T.border}`, background: 'transparent',
          color: T.text3, fontSize: 12, cursor: 'pointer',
        }}>
          + Add Slot Mapping
        </button>
      )}
    </div>
  )

  // ── Tab: Template ─────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {presetBanner}
      <p style={{ fontSize: 11, color: T.text3, lineHeight: 1.5 }}>
        Assign a Design Studio template to this profile. When generating content, this template
        will be auto-loaded before applying slot mappings.
      </p>
      <div>
        {label('Template')}
        <select value={draft.templateId} disabled={isPreset}
          onChange={e => patch({ templateId: e.target.value })}
          style={{ ...inp(isPreset), cursor: isPreset ? 'not-allowed' : 'pointer' }}>
          <option value="">— Use active Design Studio template —</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      {templates.length === 0 && (
        <p style={{ fontSize: 11, color: T.text3, fontStyle: 'italic' }}>
          No saved templates yet. Create one in Design Studio → save as template.
        </p>
      )}
    </div>
  )
}

// ── Profile list item ─────────────────────────────────────────────────────────

function ProfileListItem({
  profile, isSelected, isActive, onSelect, onDuplicate, onDelete,
}: {
  profile: Profile; isSelected: boolean; isActive: boolean
  onSelect: () => void; onDuplicate: () => void; onDelete?: () => void
}): React.ReactElement {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '8px 10px', borderRadius: 8, marginBottom: 2, cursor: 'pointer',
        background: isSelected ? T.accentDim : hovered ? T.bg3 : 'transparent',
        border: `1px solid ${isSelected ? T.accentBd : 'transparent'}`,
        transition: 'all .1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          flex: 1, fontSize: 12, fontWeight: isSelected ? 600 : 400,
          color: isSelected ? T.accent : T.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{profile.name}</span>
        {isActive && (
          <span style={{
            fontSize: 8, fontWeight: 700, color: T.accent,
            background: T.accentDim, border: `1px solid ${T.accentBd}`,
            borderRadius: 4, padding: '1px 5px', flexShrink: 0,
          }}>ACTIVE</span>
        )}
      </div>
      {/* Action buttons on hover */}
      {(hovered || isSelected) && (
        <div style={{ display: 'flex', gap: 4, marginTop: 5 }} onClick={e => e.stopPropagation()}>
          <button onClick={onDuplicate} title="Duplicate" style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
            border: `1px solid ${T.border}`, background: T.bg3, color: T.text2,
          }}>⧉ copy</button>
          {onDelete && (
            <button onClick={onDelete} title="Delete" style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
              border: `1px solid ${T.red}30`, background: 'transparent', color: T.red,
            }}>✕</button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function ProfilesTab(): React.ReactElement {
  const [profiles,   setProfiles]   = useState<Profile[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [activeId,   setActiveId]   = useState<string>('')
  const [activeTab,  setActiveTab]  = useState<EditorTab>('identity')
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const loadAll = useCallback(() => {
    const all    = getProfiles()
    const active = getActiveProfile()
    setProfiles(all)
    setActiveId(active.id)
    if (!selectedId || !all.find(p => p.id === selectedId)) setSelectedId(active.id)
  }, [selectedId])

  useEffect(() => {
    loadAll()
    const h = (): void => loadAll()
    window.addEventListener('profilesChange', h)
    return (): void => window.removeEventListener('profilesChange', h)
  }, [loadAll])

  function showToast(msg: string, ok = true): void {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 2000)
  }

  function handleSave(profile: Profile, silent = false): void {
    saveProfile(profile); loadAll()
    if (!silent) showToast('Profile saved')
  }
  function handleSetActive(id: string): void {
    setActiveProfile(id); setActiveId(id); showToast('Active profile updated')
  }
  function handleNew(): void {
    const p = blankProfile(); saveProfile(p); loadAll()
    setSelectedId(p.id); showToast('New profile created')
  }
  function handleDuplicate(profile: Profile): void {
    const copy = duplicateProfile(profile); saveProfile(copy); loadAll()
    setSelectedId(copy.id); showToast(`Duplicated "${profile.name}"`)
  }
  function handleDelete(profile: Profile): void {
    if (profile.isPreset) return
    deleteProfile(profile.id); loadAll()
    setSelectedId(activeId); showToast('Profile deleted')
  }

  const selected = profiles.find(p => p.id === selectedId) ?? profiles[0]
  const presets  = profiles.filter(p => p.isPreset)
  const custom   = profiles.filter(p => !p.isPreset)

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', overflow: 'hidden' }}>

      {/* ── Col 1: Profile list ─────────────────────────────────────── */}
      <div style={{
        width: 200, borderRight: `1px solid ${T.border}`, display: 'flex',
        flexDirection: 'column', overflow: 'hidden', background: T.bg2, flexShrink: 0,
      }}>
        {/* New button */}
        <div style={{ padding: '14px 12px 10px', borderBottom: `1px solid ${T.border}` }}>
          <button onClick={handleNew} style={{
            width: '100%', padding: '8px 0', borderRadius: 9,
            border: `1px solid ${T.accentBd}`, background: T.accentDim,
            color: T.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            + New Profile
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {presets.length > 0 && (
            <>
              <p style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: 'uppercase',
                letterSpacing: '.09em', padding: '6px 6px 5px' }}>Built-in</p>
              {presets.map(p => (
                <ProfileListItem key={p.id} profile={p}
                  isSelected={p.id === selectedId} isActive={p.id === activeId}
                  onSelect={() => setSelectedId(p.id)}
                  onDuplicate={() => handleDuplicate(p)} />
              ))}
            </>
          )}
          {custom.length > 0 && (
            <>
              <p style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: 'uppercase',
                letterSpacing: '.09em', padding: '10px 6px 5px' }}>My Profiles</p>
              {custom.map(p => (
                <ProfileListItem key={p.id} profile={p}
                  isSelected={p.id === selectedId} isActive={p.id === activeId}
                  onSelect={() => setSelectedId(p.id)}
                  onDuplicate={() => handleDuplicate(p)}
                  onDelete={() => handleDelete(p)} />
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Col 2: Tab editor ───────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selected ? (
          <>
            {/* Tab bar */}
            <div style={{
              display: 'flex', gap: 6, padding: '12px 20px 0',
              borderBottom: `1px solid ${T.border}`, background: T.bg2, flexShrink: 0,
            }}>
              {TABS.map(tab => {
                const isActive = activeTab === tab.id
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                    padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none',
                    background: isActive ? T.bg : 'transparent',
                    color: isActive ? T.text : T.text3,
                    fontSize: 12, fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer', borderBottom: isActive ? `2px solid ${T.accent}` : '2px solid transparent',
                    transition: 'all .12s', outline: 'none',
                  }}>
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              <ProfileEditor
                key={`${selected.id}-${activeTab}`}
                profile={selected}
                isActive={selected.id === activeId}
                activeTab={activeTab}
                onSave={handleSave}
                onSetActive={handleSetActive}
              />
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.text3, fontSize: 13 }}>
            Select a profile or create a new one
          </div>
        )}
      </div>

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  )
}
