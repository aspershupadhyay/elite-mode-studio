// model-types.ts — shared types for the AI Models settings UI

export interface ModelDef {
  id:        string
  name:      string
  provider:  string
  type:      'text' | 'image'
  tier:      'recommended' | 'fast' | 'powerful' | 'reasoning' | 'local' | 'image'
  open_src:  boolean
  context:   number | null
}

export interface SettingsField {
  key:     string
  label:   string
  type:    'slider' | 'number' | 'toggle'
  min?:    number
  max?:    number | null
  step?:   number
  default: number | boolean | null
  tip?:    string
}

export interface ProviderDef {
  name:            string
  env_key:         string | null
  base_url:        string | null
  client_type:     string
  settings_schema: SettingsField[]
  key_set:         boolean
}

export interface FeatureConfig {
  provider:     string
  model:        string
  temperature?: number
  max_tokens?:  number
  top_p?:       number
  [key: string]: unknown
}

export const TIER_META: Record<string, { label: string; color: string }> = {
  recommended: { label: 'Recommended', color: '#34d399' },
  fast:        { label: 'Fast',        color: '#60a5fa' },
  powerful:    { label: 'Powerful',    color: '#a78bfa' },
  reasoning:   { label: 'Reasoning',  color: '#f59e0b' },
  local:       { label: 'Local',       color: '#94a3b8' },
  image:       { label: 'Image',       color: '#f472b6' },
}

export const PROVIDER_COLORS: Record<string, string> = {
  openai:     '#10a37f',
  anthropic:  '#d97706',
  nvidia:     '#76b900',
  groq:       '#f55036',
  mistral:    '#ff7000',
  google:     '#4285f4',
  cohere:     '#39594d',
  together:   '#7c3aed',
  fireworks:  '#ef4444',
  deepseek:   '#1e6fff',
  xai:        '#e2e8f0',
  perplexity: '#20b2aa',
  stability:  '#7c3aed',
  replicate:  '#000000',
  ollama:     '#94a3b8',
}

export const FEATURE_LABELS: Record<string, string> = {
  forge:   'Forge (Content Gen)',
  doc_rag: 'Doc RAG (Q&A)',
}
