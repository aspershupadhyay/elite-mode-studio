import { useState, useEffect } from 'react'
import PageShell from '../components/PageShell.jsx'
import { Card, GreenCard, Label, Btn } from '../components/ui.jsx'
import { Trash2, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { apiFetch, apiDelete } from '../api.js'

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={()=>{navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),1500)}}
      style={{display:'flex',alignItems:'center',gap:4,padding:'3px 8px',borderRadius:5,
        border:'1px solid var(--border)',background:'transparent',color:'var(--text2)',
        fontSize:11,cursor:'pointer'}}>
      {copied?<><Check size={10}/>Copied</>:<><Copy size={10}/>Copy</>}
    </button>
  )
}

function PostCard({ post, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const c = post.content || {}
  const date = new Date(post.created_at).toLocaleDateString('en-IN', {
    day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'
  })
  const confidenceColor = { HIGH:'var(--green)', MEDIUM:'var(--amber)', LOW:'var(--red)' }

  return (
    <Card style={{marginBottom:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
            <span style={{fontSize:11,color:'var(--text3)'}}>{date}</span>
            <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,
              background:'rgba(225,48,108,0.1)',color:'#E1306C',fontWeight:600}}>IG</span>
            {c.confidence && (
              <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,fontWeight:600,
                color:confidenceColor[c.confidence]||'var(--text2)',background:'rgba(0,0,0,0.15)'}}>
                {c.confidence}
              </span>
            )}
            <span style={{fontSize:11,color:'var(--text3)'}}>#{post.id}</span>
          </div>
          <p style={{fontSize:14,fontWeight:600,lineHeight:1.4,color:'var(--text)',
            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:expanded?'normal':'nowrap'}}>
            {c.title || post.topic}
          </p>
          {c.category && <p style={{fontSize:11,color:'var(--green)',marginTop:3}}>{c.category}</p>}
        </div>
        <div style={{display:'flex',gap:6,flexShrink:0}}>
          <button onClick={()=>setExpanded(!expanded)} style={{
            padding:'5px 8px',borderRadius:6,border:'1px solid var(--border)',
            background:'transparent',color:'var(--text2)',cursor:'pointer'}}>
            {expanded?<ChevronUp size={13}/>:<ChevronDown size={13}/>}
          </button>
          <button onClick={()=>onDelete(post.id)} style={{
            padding:'5px 8px',borderRadius:6,border:'1px solid rgba(255,77,77,0.3)',
            background:'transparent',color:'var(--red)',cursor:'pointer'}}>
            <Trash2 size={13}/>
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{marginTop:16,borderTop:'1px solid var(--border)',paddingTop:16}}>
          {c.hook_text && (
            <div style={{marginBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                <Label>Hook Text</Label><CopyBtn text={c.hook_text}/>
              </div>
              <p style={{fontSize:13,color:'var(--green)',fontWeight:600}}>{c.hook_text}</p>
            </div>
          )}
          {c.caption && (
            <div style={{marginBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                <Label>Caption</Label><CopyBtn text={c.caption}/>
              </div>
              <p style={{fontSize:13,lineHeight:1.8,whiteSpace:'pre-wrap',color:'var(--text2)'}}>{c.caption}</p>
            </div>
          )}
          {c.image_prompt_16x9 && (
            <div>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                <Label>Image Prompt 16x9</Label><CopyBtn text={c.image_prompt_16x9}/>
              </div>
              <p style={{fontSize:12,fontFamily:'monospace',whiteSpace:'pre-wrap',
                color:'var(--text2)',lineHeight:1.6}}>{c.image_prompt_16x9}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export default function PostHistory() {
  const [posts, setPosts]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [clearing, setClearing] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error: err } = await apiFetch('/api/posts')
    if (err) setError(err)
    else setPosts(data.posts || [])
    setLoading(false)
  }

  async function deletePost(id) {
    const { error: err } = await apiDelete(`/api/posts/${id}`)
    if (!err) setPosts(p => p.filter(x => x.id !== id))
  }

  async function clearAll() {
    if (!window.confirm('Delete all saved posts? This cannot be undone.')) return
    setClearing(true)
    await apiDelete('/api/posts')
    setPosts([])
    setClearing(false)
  }

  useEffect(() => { load() }, [])

  return (
    <PageShell title="Post History" subtitle={`${posts.length} posts saved`}>
      <div style={{maxWidth:760}}>
        {error && (
          <div style={{padding:'12px 14px',background:'rgba(255,77,77,0.08)',
            border:'1px solid rgba(255,77,77,0.25)',borderRadius:8,
            fontSize:13,color:'var(--red)',marginBottom:16}}>{error}</div>
        )}
        {posts.length > 0 && (
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}>
            <Btn onClick={clearAll} loading={clearing} variant="secondary"
              style={{fontSize:12,padding:'6px 12px'}}>
              <Trash2 size={11} style={{display:'inline',marginRight:5}}/>Clear All
            </Btn>
          </div>
        )}
        {loading && <p style={{color:'var(--text2)',fontSize:13}}>Loading...</p>}
        {!loading && !error && posts.length === 0 && (
          <div style={{textAlign:'center',padding:'60px 0'}}>
            <p style={{color:'var(--text3)',fontSize:14}}>No posts yet.</p>
            <p style={{color:'var(--text3)',fontSize:12,marginTop:4}}>
              Forge your first post in Content Generator.
            </p>
          </div>
        )}
        {posts.map(p => <PostCard key={p.id} post={p} onDelete={deletePost}/>)}
      </div>
    </PageShell>
  )
}
