import { useState } from 'react'
import PageShell from '../components/PageShell.jsx'
import { Card, GreenCard, Label, Btn, Input } from '../components/ui.jsx'
import { ExternalLink, Search } from 'lucide-react'
import { apiPost } from '../api.js'

export default function WebSearch() {
  const [q, setQ]           = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState('')

  async function search() {
    if (!q.trim() || loading) return
    setLoading(true); setError(''); setResult(null)
    const { data, error: err } = await apiPost('/api/web-search', { question: q })
    if (err) setError(err)
    else setResult(data)
    setLoading(false)
  }

  return (
    <PageShell title="Web Search RAG" subtitle="Search the live web — embed, rerank, answer">
      <div style={{ maxWidth: 760 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask anything..."
            onKeyDown={e => e.key === 'Enter' && search()} />
          <Btn onClick={search} loading={loading} disabled={!q.trim()}>
            <Search size={14} style={{ display: 'inline', marginRight: 6 }} />Search
          </Btn>
        </div>

        {error && (
          <div style={{ padding:'12px 14px', background:'rgba(255,77,77,0.08)',
            border:'1px solid rgba(255,77,77,0.25)', borderRadius:8,
            fontSize:13, color:'var(--red)', marginBottom:16 }}>{error}</div>
        )}

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['Searching web via Tavily...','Embedding chunks...','Reranking...','Generating answer...']
              .map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)',
                  animation: 'pulse 1.2s infinite', animationDelay: `${i*0.3}s` }} />
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{s}</span>
              </div>
            ))}
          </div>
        )}

        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <GreenCard>
              <Label>Answer</Label>
              <p style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                {result.answer}
              </p>
            </GreenCard>
            {result.sources?.length > 0 && (
              <Card>
                <Label>Sources</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {result.sources.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2 }}>{i+1}</span>
                      <div>
                        <p style={{ fontSize: 13, color: 'var(--text)', marginBottom: 1 }}>{s.title}</p>
                        <a href={s.url} target="_blank" rel="noreferrer"
                          style={{ fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {s.url?.slice(0, 60)}... <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
      {/* @keyframes pulse is defined globally in index.css */}
    </PageShell>
  )
}
