import { useState } from 'react'
import { T, Icons, SectionHeader, Card, CardRow, SelectChip, FieldInput, PrimaryBtn } from './shared'
import type { SearchConfig } from '@/types/api'

// ── Local interfaces ──────────────────────────────────────────────────────────

interface TavilyConfig {
  search_depth?: string
  max_results?: number
  chunks_per_source?: number
  include_answer?: string
  time_range?: string
  topic?: string
  include_images?: boolean
  include_raw_content?: string
  include_domains?: string[]
  exclude_domains?: string[]
}

interface SearchCfgSlice {
  tavily?: TavilyConfig
}

// ── Static options ────────────────────────────────────────────────────────────

const DEPTH_OPTIONS      = [{ value:'basic',    label:'Basic'    }, { value:'advanced', label:'Advanced' }]
const TRANGE_OPTIONS     = [{ value:'day',      label:'Day'      }, { value:'week',  label:'Week'   }, { value:'month', label:'Month' }, { value:'year', label:'Year' }, { value:'none', label:'None' }]
const ANSWER_OPTIONS     = [{ value:'basic',    label:'Basic'    }, { value:'advanced', label:'Advanced' }, { value:'false', label:'Off' }]
const CHUNK_OPTIONS      = [{ value:'1',        label:'1'        }, { value:'3',    label:'3'      }, { value:'5',     label:'5'     }, { value:'10',   label:'10'   }]
const RESULTS_OPTIONS    = [{ value:'5',        label:'5'        }, { value:'10',   label:'10'     }, { value:'15',    label:'15'    }, { value:'20',   label:'20'   }]
const TOPIC_OPTIONS      = [{ value:'news',     label:'News'     }, { value:'finance', label:'Finance' }, { value:'general', label:'General' }]
const RAW_CONTENT_OPTIONS= [{ value:'markdown', label:'Markdown' }, { value:'text', label:'Text'   }, { value:'false', label:'Off'  }]

const FRESHNESS_OPTIONS = [
  { value:'today', label:'Today' },
  { value:'2days', label:'2 Days' },
  { value:'7days', label:'7 Days' },
  { value:'any',   label:'Any'   },
]

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SearchTabProps {
  config: SearchCfgSlice
  onChange: (config: SearchCfgSlice) => void
  tvKey: string
  setTvKey: (v: string) => void
  tvKeySet: boolean
  onSaveKeys: () => void
  savingKeys: boolean
  savedKeys: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SearchTab({
  config,
  onChange,
  tvKey,
  setTvKey,
  tvKeySet,
  onSaveKeys,
  savingKeys,
  savedKeys,
}: SearchTabProps): React.ReactElement {
  const tv = config.tavily || {}
  const setTv = (patch: Partial<TavilyConfig>): void =>
    onChange({ ...config, tavily: { ...config.tavily, ...patch } })

  const [newDomain,  setNewDomain]  = useState<string>('')
  const [newExclude, setNewExclude] = useState<string>('')
  const [defaultFreshness, setDefaultFreshness] = useState<string>(
    () => localStorage.getItem('freshness') || '2days'
  )

  function addDomain(list: string[], key: 'include_domains' | 'exclude_domains', val: string): void {
    const d = val.trim().replace(/^https?:\/\//, '').replace(/\//, '')
    if (d && !list.includes(d)) setTv({ [key]: [...list, d] })
  }

  function remDomain(key: 'include_domains' | 'exclude_domains', idx: number): void {
    const list = tv[key] || []
    setTv({ [key]: list.filter((_, i) => i !== idx) })
  }

  function DomainList({
    label,
    listKey,
    newVal,
    setNewVal,
    color,
  }: {
    label: string
    listKey: 'include_domains' | 'exclude_domains'
    newVal: string
    setNewVal: (v: string) => void
    color: 'green' | 'red'
  }): React.ReactElement {
    const list = tv[listKey] || []
    return (
      <div style={{ marginBottom: 16 }}>
        <p style={{
          fontSize: 11, color: T.text2, fontWeight: 500, textTransform: 'uppercase',
          letterSpacing: '.06em', marginBottom: 8,
        }}>{label}</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            value={newVal}
            onChange={e => setNewVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { addDomain(list, listKey, newVal); setNewVal('') }
            }}
            placeholder="e.g. reuters.com"
            style={{
              flex: 1, padding: '8px 10px', background: T.bg, border: `1px solid ${T.border2}`,
              borderRadius: 7, color: T.text, fontSize: 12, outline: 'none',
              fontFamily: 'inherit', userSelect: 'text',
            }}
          />
          <button
            onClick={() => { addDomain(list, listKey, newVal); setNewVal('') }}
            style={{
              padding: '0 12px', background: T.violetBg, border: `1px solid ${T.violetBd}`,
              borderRadius: 7, color: T.violetL, cursor: 'pointer', fontSize: 12,
            }}>
            <Icons.plus size={14} />
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
          {list.map((d, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 10px 3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500,
              background: color === 'green' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${color === 'green' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
              color: color === 'green' ? T.emerald : T.red,
            }}>
              <Icons.globe size={10} />{d}
              <button
                onClick={() => remDomain(listKey, i)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'inherit', padding: 0, marginLeft: 3, lineHeight: 1,
                }}>×</button>
            </div>
          ))}
          {list.length === 0 && <span style={{ fontSize: 11, color: T.text3 }}>None added</span>}
        </div>
      </div>
    )
  }

  return (
    <div>
      <SectionHeader
        icon={Icons.search}
        title="Search Engine"
        subtitle="Tavily API configuration — controls how news is discovered and retrieved"
      />

      <Card>
        <p style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 14 }}>API Credentials</p>
        <FieldInput
          label="Tavily API Key"
          value={tvKey}
          onChange={setTvKey}
          type="password"
          placeholder={tvKeySet ? 'Key saved - paste a new one to replace' : 'tvly-xxxxxxxxxxxx'}
          hint="Get yours at tavily.com - free tier is sufficient for personal use"
        />
        <PrimaryBtn onClick={onSaveKeys} loading={savingKeys}>
          <Icons.check size={13} />
          {savedKeys ? 'Saved!' : 'Save API Key'}
        </PrimaryBtn>
      </Card>

      <Card>
        <p style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 4 }}>Search Parameters</p>
        <p style={{ fontSize: 11, color: T.text3, marginBottom: 16 }}>
          These settings control every Tavily query — more depth = slower but more accurate
        </p>
        <CardRow label="Search Topic" desc="'News' for breaking stories, 'Finance' for markets, 'General' for broad web">
          <SelectChip options={TOPIC_OPTIONS} value={tv.topic || 'news'}
            onChange={v => setTv({ topic: v })} />
        </CardRow>
        <CardRow label="Search Depth" desc="Advanced scans full page content, not just snippets">
          <SelectChip options={DEPTH_OPTIONS} value={tv.search_depth || 'advanced'}
            onChange={v => setTv({ search_depth: v })} />
        </CardRow>
        <CardRow label="Max Results" desc="Sources fetched per Tavily query (20 = Tavily's max)">
          <SelectChip options={RESULTS_OPTIONS} value={String(tv.max_results || 20)}
            onChange={v => setTv({ max_results: parseInt(v) })} />
        </CardRow>
        <CardRow label="Chunks per Source" desc="How many text chunks extracted per page">
          <SelectChip options={CHUNK_OPTIONS} value={String(tv.chunks_per_source || 5)}
            onChange={v => setTv({ chunks_per_source: parseInt(v) })} />
        </CardRow>
        <CardRow label="Answer Mode" desc="Tavily's own AI-verified answer prepended to context">
          <SelectChip options={ANSWER_OPTIONS} value={tv.include_answer || 'advanced'}
            onChange={v => setTv({ include_answer: v })} />
        </CardRow>
        <CardRow label="Raw Content" desc="Format of full page content returned per source">
          <SelectChip options={RAW_CONTENT_OPTIONS} value={tv.include_raw_content || 'markdown'}
            onChange={v => setTv({ include_raw_content: v })} />
        </CardRow>
        <CardRow label="Include Images" desc="Return image URLs from search results">
          <button
            onClick={() => setTv({ include_images: !(tv.include_images ?? false) })}
            style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', border: '1px solid',
              borderColor: tv.include_images ? 'var(--green)' : T.border2,
              background: tv.include_images ? 'rgba(11,218,118,0.1)' : 'transparent',
              color: tv.include_images ? 'var(--green)' : T.text3,
            }}>
            {tv.include_images ? 'On' : 'Off'}
          </button>
        </CardRow>
        <CardRow label="Time Range (fallback)" desc="Used when freshness doesn't set explicit dates" noBorder>
          <SelectChip options={TRANGE_OPTIONS} value={tv.time_range || 'day'}
            onChange={v => setTv({ time_range: v })} />
        </CardRow>
      </Card>

      <Card>
        <p style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 4 }}>Default Freshness</p>
        <p style={{ fontSize: 11, color: T.text3, marginBottom: 14 }}>
          How recent news must be — overrides per-query date ranges
        </p>
        <SelectChip
          options={FRESHNESS_OPTIONS}
          value={defaultFreshness}
          onChange={v => { setDefaultFreshness(v); localStorage.setItem('freshness', v) }}
        />
      </Card>

      <Card>
        <DomainList
          label="Include Domains (trusted sources only)"
          listKey="include_domains"
          newVal={newDomain}
          setNewVal={setNewDomain}
          color="green"
        />
        <DomainList
          label="Exclude Domains (block these)"
          listKey="exclude_domains"
          newVal={newExclude}
          setNewVal={setNewExclude}
          color="red"
        />
      </Card>
    </div>
  )
}
