// templateStorage.ts — Template persistence via backend API
import { apiFetch, apiPost, apiDelete } from '@/api'
import type { Template } from '@/types/domain'

function notifyTemplatesChange(): void {
  window.dispatchEvent(new CustomEvent('templatesChange'))
}

export async function saveTemplate(data: Omit<Template, 'id' | 'created_at' | 'updated_at'>): Promise<Template> {
  const { data: tmpl, error } = await apiPost<Template>('/api/templates', {
    name:        data.name,
    canvas_json: data.canvas_json,
    thumbnail:   data.thumbnail ?? null,
    width:       data.width,
    height:      data.height,
    slot_schema: data.slot_schema ?? null,
  })
  if (error || !tmpl) throw new Error(error ?? 'Failed to save template')
  notifyTemplatesChange()
  return tmpl
}

export async function updateTemplate(
  id: string,
  patch: Partial<Omit<Template, 'id' | 'created_at'>>,
): Promise<Template | null> {
  const { data: tmpl, error } = await apiFetch<Template>(`/api/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
  if (error) return null
  notifyTemplatesChange()
  return tmpl
}

export async function getTemplates(): Promise<Template[]> {
  const { data, error } = await apiFetch<Template[]>('/api/templates')
  if (error || !data) return []
  return data
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiDelete(`/api/templates/${id}`)
  notifyTemplatesChange()
}

export function generateThumbnail(
  canvas: import('fabric').Canvas,
  maxWidth = 300,
): string {
  try {
    return canvas.toDataURL({
      format: 'png',
      quality: 0.7,
      multiplier: maxWidth / canvas.width,
    })
  } catch {
    return ''
  }
}
