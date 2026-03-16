import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import PageShell from '../components/PageShell.jsx'
import { Card, GreenCard, Label, Btn, Input } from '../components/ui.jsx'
import { Upload, FileText, MessageSquare } from 'lucide-react'
import { apiFetch, apiPost } from '../api.js'

export default function DocRAG() {
  const [docInfo, setDocInfo]   = useState(null)
  const [uploading, setUploading] = useState(false)
  const [q, setQ]               = useState('')
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState('')

  const onDrop = useCallback(async (files) => {
    const file = files[0]; if (!file) return
    setUploading(true); setError(''); setDocInfo(null); setResult(null)
    // File uploads use raw fetch because FormData is not supported by apiPost
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch('http://127.0.0.1:8000/api/doc/upload', { method: 'POST', body: fd })
      if (!r.ok) throw new Error((await r.json()).detail)
      setDocInfo(await r.json())
    } catch (e) { setError(e.message) }
    setUploading(false)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'], 'text/plain': ['.txt'] }, maxFiles: 1
  })

  async function ask() {
    if (!q.trim() || loading) return
    setLoading(true); setError(''); setResult(null)
    const { data, error: err } = await apiPost('/api/doc/ask', { question: q })
    if (err) setError(err)
    else setResult(data)
    setLoading(false)
  }

  return (
    <PageShell title="Doc RAG" subtitle="Upload a PDF or TXT — ask anything about it">
      <div style={{ maxWidth: 760 }}>
        <div {...getRootProps()} style={{
          border: `2px dashed ${isDragActive ? 'var(--green)' : 'var(--border)'}`,
          borderRadius: 12, padding: '32px 24px', textAlign: 'center',
          cursor: 'pointer', marginBottom: 20, transition: 'border .15s',
          background: isDragActive ? 'var(--green-dim)' : 'transparent'
        }}>
          <input {...getInputProps()} />
          <Upload size={24} style={{ color: 'var(--text3)', marginBottom: 8 }} />
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>
            {uploading ? 'Processing...' : 'Drop PDF or TXT here, or click to select'}
          </p>
        </div>

        {docInfo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
            padding: '10px 14px', background: 'var(--green-dim)',
            border: '1px solid var(--green-border)', borderRadius: 8 }}>
            <FileText size={14} style={{ color: 'var(--green)' }} />
            <span style={{ fontSize: 13, color: 'var(--green)' }}>
              {docInfo.filename} — {docInfo.chunks} chunks loaded
            </span>
          </div>
        )}

        {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        {docInfo && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask about the document..."
              onKeyDown={e => e.key === 'Enter' && ask()} />
            <Btn onClick={ask} loading={loading} disabled={!q.trim()}>
              <MessageSquare size={14} style={{ display: 'inline', marginRight: 6 }} />Ask
            </Btn>
          </div>
        )}

        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <GreenCard>
              <Label>Answer</Label>
              <p style={{ fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{result.answer}</p>
            </GreenCard>
            {result.sources?.length > 0 && (
              <Card>
                <Label>Retrieved Chunks</Label>
                {result.sources.map((s, i) => (
                  <p key={i} style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6,
                    padding: '6px 10px', background: 'var(--bg3)', borderRadius: 6 }}>{s}</p>
                ))}
              </Card>
            )}
          </div>
        )}
      </div>
    </PageShell>
  )
}
