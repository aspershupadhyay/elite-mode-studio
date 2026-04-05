/**
 * ContentMappingPanel.tsx — Schema content-mapping sidebar panel for DesignStudio.
 *
 * Shows the active schema's slot mappings in a read-only list.
 * Provides an "Allow Customization" toggle and an "Edit in Schema Editor" button.
 * Collapsible; state persisted to localStorage key 'studio_mapping_panel_open'.
 */

import { useState, useEffect } from 'react'
import { getActiveSchema } from '@/utils/schemaStorage'
import { saveSchema } from '@/utils/schemaStorage'
import type { ContentSchemaConfig } from '@/types/schema'

interface ContentMappingPanelProps {
  /** Called when user clicks "Edit in Schema Editor" */
  onEditInSettings: () => void
  /** Called when the schema is mutated (e.g. allowCustomization toggle) */
  onSchemaChanged?: (schema: ContentSchemaConfig) => void
}

// ── Slot row ──────────────────────────────────────────────────────────────────

interface SlotRowProps {
  fieldLabel: string
  eliteType: string
  eliteSlot?: string
}

function SlotRow({ fieldLabel, eliteType, eliteSlot }: SlotRowProps): JSX.Element {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '4px 8px',
      borderRadius: 4,
      background: 'rgba(255,255,255,0.03)',
      marginBottom: 3,
    }}>
      <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {fieldLabel}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {eliteType}{eliteSlot ? ` / ${eliteSlot}` : ''}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ContentMappingPanel({ onEditInSettings, onSchemaChanged }: ContentMappingPanelProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('studio_mapping_panel_open') !== 'false' } catch { return true }
  })
  const [schema, setSchema] = useState<ContentSchemaConfig>(() => getActiveSchema())

  // Sync schema on mount + when schemas change externally
  useEffect(() => {
    const sync = (): void => setSchema(getActiveSchema())
    window.addEventListener('schemasChange', sync)
    return (): void => window.removeEventListener('schemasChange', sync)
  }, [])

  const handleToggleOpen = (): void => {
    setOpen(v => {
      const next = !v
      try { localStorage.setItem('studio_mapping_panel_open', String(next)) } catch {}
      return next
    })
  }

  const handleAllowCustomizationToggle = (): void => {
    const currentVal = schema.singlePost?.allowUserCustomization ?? true
    const updated: ContentSchemaConfig = {
      ...schema,
      singlePost: schema.singlePost
        ? { ...schema.singlePost, allowUserCustomization: !currentVal }
        : { templateId: '', slotMapping: [], allowUserCustomization: !currentVal, lockedElements: [] },
    }
    try {
      saveSchema(updated)
      setSchema(updated)
      onSchemaChanged?.(updated)
    } catch (err) {
      console.error('[ContentMappingPanel] Failed to save schema:', err)
    }
  }

  const mappings = schema.singlePost?.slotMapping ?? []
  const allowCustomization = schema.singlePost?.allowUserCustomization ?? true
  const lockedCount = schema.singlePost?.lockedElements.length ?? 0

  // Build a lookup of fieldId → label
  const fieldLabel = Object.fromEntries(schema.fields.map(f => [f.id, f.label]))

  return (
    <div style={{
      borderTop: '1px solid rgba(255,255,255,0.06)',
      background: 'var(--bg, #111)',
    }}>
      {/* Header */}
      <button
        onClick={handleToggleOpen}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Map icon */}
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.7 }}>
            <path d="M2 4l4-2 4 2 4-2v10l-4 2-4-2-4 2V4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none"/>
          </svg>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.8 }}>
            Content Mapping
          </span>
        </div>
        <svg
          width="10" height="10" viewBox="0 0 10 10"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 160ms', opacity: 0.5 }}
        >
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Body */}
      {open && (
        <div style={{ padding: '0 12px 12px' }}>
          {/* Schema name */}
          <div style={{
            fontSize: 11,
            color: 'var(--text-dim)',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span>Active:</span>
            <span style={{ color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {schema.name}
            </span>
          </div>

          {/* Slot mappings */}
          {mappings.length === 0 ? (
            <div style={{
              fontSize: 11,
              color: 'var(--text-dim)',
              textAlign: 'center',
              padding: '10px 0',
              opacity: 0.6,
            }}>
              No slot mappings.<br/>Right-click an element → Assign Slot.
            </div>
          ) : (
            <div style={{ marginBottom: 10 }}>
              {mappings.map((m, i) => (
                <SlotRow
                  key={`${m.fieldId}-${m.eliteType}-${i}`}
                  fieldLabel={fieldLabel[m.fieldId] ?? m.fieldId}
                  eliteType={m.eliteType}
                  eliteSlot={m.eliteSlot}
                />
              ))}
            </div>
          )}

          {/* Locked elements count */}
          {lockedCount > 0 && (
            <div style={{
              fontSize: 10,
              color: 'var(--text-dim)',
              marginBottom: 10,
              padding: '4px 8px',
              borderRadius: 4,
              background: 'rgba(255,200,0,0.06)',
              border: '1px solid rgba(255,200,0,0.15)',
            }}>
              {lockedCount} locked element{lockedCount !== 1 ? 's' : ''}
            </div>
          )}

          {/* Allow customization toggle */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Allow Customization</span>
            <button
              onClick={handleAllowCustomizationToggle}
              style={{
                width: 32,
                height: 18,
                borderRadius: 9,
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                background: allowCustomization ? 'var(--green, #0bda76)' : 'rgba(255,255,255,0.15)',
                transition: 'background 150ms',
                flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute',
                top: 2,
                left: allowCustomization ? 16 : 2,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 150ms',
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              }}/>
            </button>
          </div>

          {/* Edit in Schema Editor button */}
          <button
            onClick={onEditInSettings}
            style={{
              width: '100%',
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 500,
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--text)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 5,
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            Edit in Schema Editor →
          </button>
        </div>
      )}
    </div>
  )
}
