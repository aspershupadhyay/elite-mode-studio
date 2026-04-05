/**
 * Settings.tsx — Elite Mode Studio Settings
 * Tab shell — owns state, loads/saves all preferences, composes all 6 tabs.
 */

import { useState, useEffect } from 'react'
import { apiFetch, apiPost } from '../../api'
import { T, Icons, StatusPill } from './shared'
import ProfilesTab from './ProfilesTab'
import AIConfigTab from './AIConfigTab'
import SearchTab from './SearchTab'
import AppearanceTab from './AppearanceTab'
import StudioTab from './StudioTab'
import type { AppearanceConfig, StudioPrefs } from '@/types/domain'
import type { SearchConfig } from '@/types/api'

// ── Tab definitions ───────────────────────────────────────────────────────────

type TabId = 'general' | 'search' | 'models' | 'profiles' | 'appearance' | 'studio'

interface TabDef {
  id: TabId
  icon: React.FC<{ size?: number; color?: string }>
  label: string
}

const TABS: TabDef[] = [
  { id: 'general',    icon: Icons.activity, label: 'General'       },
  { id: 'search',     icon: Icons.search,   label: 'Search Engine' },
  { id: 'models',     icon: Icons.cpu,      label: 'AI Models'     },
  { id: 'profiles',   icon: Icons.sparkle,  label: 'AI Profiles'   },
  { id: 'appearance', icon: Icons.palette,  label: 'Appearance'    },
  { id: 'studio',     icon: Icons.pen,      label: 'Studio'        },
]

// ── Health / test result types ────────────────────────────────────────────────

interface HealthData {
  status: string
  missing_keys?: string[]
  models?: { llm?: string; embed?: string; rerank?: string }
}

interface TestComponent {
  ok: boolean
  error?: string
}

interface TestResult {
  _error?: string
  components?: Record<string, TestComponent>
}

// ── SearchCfg shape used in this component ────────────────────────────────────

interface SearchCfgState {
  tavily?: Record<string, unknown>
  nvidia?: Record<string, unknown>
}

// ── Sub-component: General tab ────────────────────────────────────────────────

function TabGeneral({
  health, onTest, testing, testResult,
}: {
  health: HealthData | null
  onTest: () => void
  testing: boolean
  testResult: TestResult | null
}): React.ReactElement {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: T.violetBg, border: `1px solid ${T.violetBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icons.activity size={15} color={T.violetL} />
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: T.text, margin: 0 }}>System Status</h2>
        </div>
        <p style={{ fontSize: 12, color: T.text3, marginLeft: 42, lineHeight: 1.6 }}>
          Live health check of all connected services
        </p>
      </div>

      {health && (
        <div style={{ background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: health.status === 'ok' ? T.emerald : T.amber }} />
            <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>
              Backend {health.status === 'ok' ? 'running normally' : 'running with warnings'}
            </span>
            <div style={{ marginLeft: 'auto' }}>
              <StatusPill ok={health.status === 'ok'} label={health.status === 'ok' ? 'Healthy' : 'Degraded'} />
            </div>
          </div>
          {health.missing_keys && health.missing_keys.length > 0 && (
            <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 12, color: T.amber }}>
              Missing: {health.missing_keys.join(', ')} — add keys in Search Engine & AI Models tabs
            </div>
          )}
          {health.models && (
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {([['LLM', health.models.llm], ['Embed', health.models.embed], ['Rerank', health.models.rerank]] as Array<[string, string | undefined]>).map(([role, name]) => (
                <div key={role} style={{ padding: '10px 12px', background: T.bg, borderRadius: 8, border: `1px solid ${T.border}` }}>
                  <p style={{ fontSize: 10, color: T.text3, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{role}</p>
                  <p style={{ fontSize: 11, color: T.violetL, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0 }}>Connection Diagnostics</p>
            <p style={{ fontSize: 11, color: T.text3, marginTop: 3 }}>Test all services individually</p>
          </div>
          <button onClick={onTest} disabled={testing} style={{
            padding: '6px 14px', borderRadius: 8, border: 'none',
            background: testing ? T.bg4 : T.violet, color: testing ? T.text3 : '#fff',
            fontSize: 11, fontWeight: 600, cursor: testing ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            {testing && <Icons.refresh size={12} style={{ animation: 'spin 1s linear infinite' }} />}
            <Icons.refresh size={12} />Run Tests
          </button>
        </div>
        {testResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {testResult._error && <p style={{ fontSize: 12, color: T.red }}>{testResult._error}</p>}
            {testResult.components && Object.entries(testResult.components).map(([name, val]) => (
              <div key={name} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', background: T.bg, borderRadius: 8, border: `1px solid ${T.border}`,
              }}>
                <div>
                  <p style={{ fontSize: 13, color: T.text, margin: 0 }}>
                    {name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </p>
                  {!val.ok && val.error && (
                    <p style={{ fontSize: 11, color: T.red, marginTop: 2 }}>{val.error}</p>
                  )}
                </div>
                <StatusPill ok={val.ok} label={val.ok ? 'Connected' : 'Failed'} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Root component ────────────────────────────────────────────────────────────

export default function Settings(): React.ReactElement {
  const [tab,         setTab]        = useState<TabId>('general')
  const [nvKey,       setNvKey]      = useState<string>('')
  const [tvKey,       setTvKey]      = useState<string>('')
  const [savingKeys,  setSavingKeys] = useState<boolean>(false)
  const [savedKeys,   setSavedKeys]  = useState<boolean>(false)
  const [health,      setHealth]     = useState<HealthData | null>(null)
  const [testing,     setTesting]    = useState<boolean>(false)
  const [testResult,  setTestResult] = useState<TestResult | null>(null)
  const [searchCfg,   setSearchCfg]  = useState<SearchCfgState>({ tavily: {}, nvidia: {} })
  const [savingCfg,   setSavingCfg]  = useState<boolean>(false)
  const [studioPrefs, setStudioPrefs] = useState<StudioPrefs>(() => {
    try { return JSON.parse(localStorage.getItem('elite_studio_prefs') || '{}') as StudioPrefs }
    catch { return { bgHighlight: { enabled: false, color: '#FFD93D' } } }
  })
  const [initialLoading, setInitialLoading] = useState<boolean>(true)

  // Listen for external navigation to profiles tab
  useEffect(() => {
    const handler = (): void => setTab('profiles')
    window.addEventListener('navigateToSchemas', handler)
    window.addEventListener('navigateToProfiles', handler)
    return (): void => {
      window.removeEventListener('navigateToSchemas', handler)
      window.removeEventListener('navigateToProfiles', handler)
    }
  }, [])

  useEffect(() => {
    let done = 0
    const finish = (): void => { done++; if (done === 3) setInitialLoading(false) }
    apiFetch('/api/settings').then(({ data }) => {
      if (data) {
        setNvKey((data as Record<string, string>).nvidia_api_key || '')
        setTvKey((data as Record<string, string>).tavily_api_key || '')
      }
      finish()
    })
    apiFetch('/api/health').then(({ data }) => { if (data) setHealth(data as HealthData); finish() })
    apiFetch('/api/search-config').then(({ data }) => { if (data) setSearchCfg(data as SearchCfgState); finish() })
  }, [])

  // Auto-save search config whenever it changes (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!searchCfg.tavily || Object.keys(searchCfg.tavily).length === 0) return
      setSavingCfg(true)
      await apiPost('/api/search-config', searchCfg)
      setSavingCfg(false)
    }, 800)
    return (): void => { clearTimeout(t) }
  }, [searchCfg])

  function saveStudioPrefs(patch: Partial<StudioPrefs>): void {
    const next = { ...studioPrefs, ...patch }
    setStudioPrefs(next)
    localStorage.setItem('elite_studio_prefs', JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('studioPrefsChange', { detail: next }))
  }

  async function saveKeys(): Promise<void> {
    setSavingKeys(true)
    await apiPost('/api/settings', { nvidia_api_key: nvKey, tavily_api_key: tvKey })
    setSavingKeys(false); setSavedKeys(true)
    setTimeout(() => setSavedKeys(false), 2500)
    window.dispatchEvent(new CustomEvent('storageChange'))
  }

  async function runTest(): Promise<void> {
    setTesting(true); setTestResult(null)
    const { data, error } = await apiFetch('/api/test')
    setTestResult(error ? { _error: error } : (data as TestResult))
    setTesting(false)
  }

  if (initialLoading) {
    return (
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: T.bg, gap: 8,
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: T.violet, animation: 'pulse 1.2s infinite',
            animationDelay: `${i * .2}s`,
          }} />
        ))}
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.2}}`}</style>
      </div>
    )
  }

  // Dummy default values for tabs that manage their own state internally
  const dummyAppearanceConfig: AppearanceConfig = {}

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', overflow: 'hidden',
      background: T.bg, fontFamily: 'inherit',
    }}>
      {/* Left sidebar */}
      <nav style={{
        width: 200, background: T.bg2, borderRight: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column', padding: '20px 10px',
        flexShrink: 0, overflow: 'hidden',
      }}>
        <p style={{
          fontSize: 10, fontWeight: 700, color: T.text3, textTransform: 'uppercase',
          letterSpacing: '.1em', padding: '0 8px', marginBottom: 10,
        }}>Settings</p>

        {TABS.map(({ id, icon: Icon, label }) => {
          const active = tab === id
          return (
            <button key={id} onClick={() => setTab(id)} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', borderRadius: 9, border: 'none', width: '100%',
              cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400,
              background: active ? T.violetBg : 'transparent',
              color: active ? T.violetL : T.text2,
              transition: 'all .15s', marginBottom: 2, textAlign: 'left',
            }}>
              <Icon size={15} color={active ? T.violetL : T.text3} />
              {label}
            </button>
          )
        })}

        <div style={{ flex: 1 }} />

        {health && (
          <div style={{ padding: '10px 10px 0', borderTop: `1px solid ${T.border}`, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: health.status === 'ok' ? T.emerald : T.amber,
              }} />
              <span style={{ fontSize: 10, color: T.text3 }}>
                {health.status === 'ok' ? 'All systems OK' : 'Check keys'}
              </span>
            </div>
          </div>
        )}
        {savingCfg && (
          <p style={{ fontSize: 10, color: T.text3, padding: '6px 10px 0', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icons.refresh size={9} style={{ animation: 'spin 1s linear infinite' }} />
            Saving…
          </p>
        )}
      </nav>

      {/* Content area — profiles tab gets full height (owns its own layout) */}
      <div style={{
        flex: 1,
        overflowY: tab === 'profiles' ? 'hidden' : 'auto',
        overflowX: 'hidden',
        padding: tab === 'profiles' ? 0 : '28px 32px',
        position: 'relative',
      }}>
        {tab === 'profiles'   && <ProfilesTab />}
        {tab === 'general'    && (
          <TabGeneral health={health} onTest={runTest} testing={testing} testResult={testResult} />
        )}
        {tab === 'search' && (
          <SearchTab
            config={searchCfg as Parameters<typeof SearchTab>[0]['config']}
            onChange={setSearchCfg as Parameters<typeof SearchTab>[0]['onChange']}
            tvKey={tvKey}
            setTvKey={setTvKey}
            onSaveKeys={saveKeys}
            savingKeys={savingKeys}
            savedKeys={savedKeys}
          />
        )}
        {tab === 'models' && (
          <AIConfigTab
            nvKey={nvKey}
            setNvKey={setNvKey}
            searchCfg={searchCfg as Parameters<typeof AIConfigTab>[0]['searchCfg']}
            setSearchCfg={setSearchCfg as Parameters<typeof AIConfigTab>[0]['setSearchCfg']}
            onSaveKeys={saveKeys}
            savingKeys={savingKeys}
            savedKeys={savedKeys}
            onTest={runTest}
          />
        )}
        {tab === 'appearance' && (
          <AppearanceTab
            config={dummyAppearanceConfig}
            onChange={(_: AppearanceConfig) => {/* self-managed */}}
          />
        )}
        {tab === 'studio' && (
          <StudioTab prefs={studioPrefs} onChange={saveStudioPrefs} />
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
