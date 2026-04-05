import { T, Icons, SectionHeader, Card, CardRow, SelectChip, FieldInput, PrimaryBtn, StatusPill } from './shared'

// ── Model lists ───────────────────────────────────────────────────────────────

interface ModelDef {
  value: string
  label: string
  badge: string
}

const LLM_MODELS: ModelDef[] = [
  { value: 'meta/llama-3.3-70b-instruct',     label: 'Llama 3.3 70B',   badge: 'Recommended' },
  { value: 'meta/llama-3.1-405b-instruct',    label: 'Llama 3.1 405B',  badge: 'Powerful'    },
  { value: 'mistralai/mixtral-8x22b-instruct',label: 'Mixtral 8×22B',   badge: 'Fast'        },
  { value: 'nvidia/nemotron-4-340b-instruct',  label: 'Nemotron 340B',   badge: 'NVIDIA'      },
]

const EMBED_MODELS: ModelDef[] = [
  { value: 'nvidia/llama-3.2-nv-embedqa-1b-v2', label: 'NV EmbedQA 1B v2', badge: 'Default' },
  { value: 'nvidia/nv-embed-v2',                label: 'NV Embed v2',       badge: 'Larger'  },
]

const RERANK_MODELS: ModelDef[] = [
  { value: 'nvidia/llama-nemotron-rerank-1b-v2', label: 'Nemotron Rerank 1B', badge: 'Default' },
]

const TOKEN_OPTIONS = [
  { value: '1024', label: '1K' },
  { value: '2048', label: '2K' },
  { value: '4096', label: '4K' },
  { value: '8192', label: '8K' },
]

// ── SearchCfg sub-type we need ────────────────────────────────────────────────

interface NvidiaConfig {
  llm_model?: string
  embed_model?: string
  rerank_model?: string
  max_tokens?: number
}

interface SearchCfgSlice {
  nvidia?: NvidiaConfig
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AIConfigTabProps {
  nvKey: string
  setNvKey: (v: string) => void
  nvKeySet: boolean
  searchCfg: SearchCfgSlice
  setSearchCfg: (updater: (prev: SearchCfgSlice) => SearchCfgSlice) => void
  onSaveKeys: () => void
  savingKeys: boolean
  savedKeys: boolean
  onTest: () => void
}

// ── Sub-component ─────────────────────────────────────────────────────────────

function ModelCard({
  label,
  models,
  value,
  onChange,
}: {
  label: string
  models: ModelDef[]
  value: string
  onChange: (v: string) => void
}): React.ReactElement {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{
        fontSize: 11, color: T.text2, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '.06em', marginBottom: 10,
      }}>{label}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {models.map(m => (
          <div key={m.value} onClick={() => onChange(m.value)} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
            borderRadius: 10, cursor: 'pointer', transition: 'all .15s',
            border: `1px solid ${value === m.value ? T.violet : T.border}`,
            background: value === m.value ? T.violetBg : T.bg,
          }}>
            <div style={{
              width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
              border: `2px solid ${value === m.value ? T.violet : T.border2}`,
              background: value === m.value ? T.violet : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {value === m.value && (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, color: value === m.value ? T.violetL : T.text, margin: 0 }}>{m.label}</p>
              <p style={{ fontSize: 10, color: T.text3, fontFamily: 'monospace', marginTop: 2 }}>{m.value}</p>
            </div>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
              background: value === m.value ? T.violetBg : T.bg4,
              border: `1px solid ${value === m.value ? T.violetBd : T.border}`,
              color: value === m.value ? T.violetL : T.text3,
            }}>{m.badge}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tab ───────────────────────────────────────────────────────────────────────

export default function AIConfigTab({
  nvKey,
  setNvKey,
  nvKeySet,
  searchCfg,
  setSearchCfg,
  onSaveKeys,
  savingKeys,
  savedKeys,
  onTest,
}: AIConfigTabProps): React.ReactElement {
  const nv = searchCfg.nvidia || {}
  const setNv = (patch: Partial<NvidiaConfig>): void =>
    setSearchCfg(prev => ({ ...prev, nvidia: { ...prev.nvidia, ...patch } }))

  return (
    <div>
      <SectionHeader
        icon={Icons.cpu}
        title="AI Models"
        subtitle="NVIDIA NIM model configuration — choose the right balance of speed and quality"
      />

      <Card>
        <p style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 14 }}>API Credentials</p>
        <FieldInput
          label="NVIDIA API Key"
          value={nvKey}
          onChange={setNvKey}
          type="password"
          placeholder={nvKeySet ? 'Key saved - paste a new one to replace' : 'nvapi-xxxxxxxxxxxx'}
          hint="Get yours at build.nvidia.com - powers all three model roles below"
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <PrimaryBtn onClick={onSaveKeys} loading={savingKeys}>
            <Icons.check size={13} />
            {savedKeys ? 'Saved!' : 'Save API Key'}
          </PrimaryBtn>
          <PrimaryBtn onClick={onTest} small>
            <Icons.refresh size={12} />Test Connection
          </PrimaryBtn>
        </div>
      </Card>

      <Card>
        <ModelCard
          label="Language Model (content generation)"
          models={LLM_MODELS}
          value={nv.llm_model || LLM_MODELS[0].value}
          onChange={v => setNv({ llm_model: v })}
        />
        <ModelCard
          label="Embeddings Model (document search)"
          models={EMBED_MODELS}
          value={nv.embed_model || EMBED_MODELS[0].value}
          onChange={v => setNv({ embed_model: v })}
        />
        <ModelCard
          label="Reranking Model (result quality)"
          models={RERANK_MODELS}
          value={nv.rerank_model || RERANK_MODELS[0].value}
          onChange={v => setNv({ rerank_model: v })}
        />
      </Card>

      <Card>
        <CardRow label="Max Output Tokens" desc="Longer = richer output, slower response" noBorder>
          <SelectChip
            options={TOKEN_OPTIONS}
            value={String(nv.max_tokens || 4096)}
            onChange={v => setNv({ max_tokens: parseInt(v) })}
          />
        </CardRow>
      </Card>
    </div>
  )
}
