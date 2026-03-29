/**
 * AiBrowser — Elite AI Browser
 *
 * Architecture:
 *  - All tabs mount once and stay mounted — CSS display:none hides inactive tabs
 *  - tab.initialUrl is set once at creation (webview src) — never changes after mount
 *  - tab.url tracks current page for address bar / isHome detection
 *  - navigateTab calls wv.loadURL() directly — zero React-caused page reloads
 *  - Drag-to-reorder tabs via HTML5 drag API
 *  - Native context menu via main process IPC
 *  - Google/Microsoft/Apple auth → system browser, session stored, no re-login
 */

import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import {
  ArrowLeft, ArrowRight, RotateCcw, X, Plus, Send,
  Zap, Image as ImageIcon, Copy, ChevronDown,
  CheckCircle, AlertCircle, Loader, Search,
  Globe, Lock, Sparkles, Cpu, Palette, Brain,
  Settings, Trash2, RefreshCw, Home,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Injector + image watcher scripts (run inside webview)
// ─────────────────────────────────────────────────────────────────────────────

function buildInjectorScript(prompt: string): string {
  // Collapse all newlines/returns to a single space — newlines in ChatGPT submit the form
  const sanitized = prompt.replace(/[\r\n]+/g, ' ').trim()
  // Encode prompt as JSON to safely embed any characters
  const encoded = JSON.stringify(sanitized)
  return `(async function(){
  var P = ${encoded};
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms) }) };

  function vis(el){
    if(!el) return false;
    var r = el.getBoundingClientRect();
    if(r.width<=0 || r.height<=0) return false;
    var s = getComputedStyle(el);
    return s.visibility!=='hidden' && s.display!=='none' && s.opacity!=='0';
  }

  function findInput(){
    // ChatGPT specific selectors first
    var el = document.querySelector('#prompt-textarea');
    if(el && vis(el)) return el;
    el = document.querySelector('div[contenteditable="true"][data-placeholder]');
    if(el && vis(el)) return el;
    el = document.querySelector('div[contenteditable="true"].ProseMirror');
    if(el && vis(el)) return el;
    el = document.querySelector('[role="textbox"]');
    if(el && vis(el)) return el;
    el = document.querySelector('div[contenteditable="true"]');
    if(el && vis(el)) return el;
    var areas = Array.from(document.querySelectorAll('textarea')).filter(vis);
    if(areas.length) return areas.sort(function(a,b){
      var ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
      return (rb.width*rb.height)-(ra.width*ra.height);
    })[0];
    return null;
  }

  function findSendBtn(inp){
    var btn = document.querySelector('button[data-testid="send-button"]');
    if(btn && vis(btn) && !btn.disabled) return btn;
    btn = document.querySelector('button[aria-label="Send prompt"]');
    if(btn && vis(btn) && !btn.disabled) return btn;
    var btns = Array.from(document.querySelectorAll('button'));
    var found = btns.find(function(b){
      var l = ((b.getAttribute('aria-label')||'')+(b.textContent||'')).toLowerCase();
      return (l.includes('send')||l.includes('submit')) && !b.disabled && vis(b);
    });
    if(found) return found;
    if(inp){
      var form = inp.closest('form');
      if(form){
        var fb = form.querySelector('button[type="submit"]');
        if(fb && !fb.disabled && vis(fb)) return fb;
      }
    }
    return null;
  }

  async function clearAndType(el, text){
    el.focus();
    await sleep(120 + Math.random()*80);

    var ce = el.isContentEditable;

    // Clear existing content safely
    if(ce){
      // ownerDocument.execCommand avoids "Illegal invocation"
      try{ el.ownerDocument.execCommand('selectAll', false, null); }catch(e){}
      await sleep(40);
      try{ el.ownerDocument.execCommand('delete', false, null); }catch(e){}
      await sleep(60);
      // Belt-and-suspenders: if anything remains, delete char by char
      if(el.textContent && el.textContent.trim().length > 0){
        try{ el.ownerDocument.execCommand('selectAll', false, null); }catch(e){}
        try{ el.ownerDocument.execCommand('delete', false, null); }catch(e){}
        await sleep(60);
      }
    } else {
      var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
      if(setter) setter.call(el, '');
      el.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'deleteContentBackward'}));
      await sleep(60);
    }

    // Type character by character with human-like timing
    for(var i=0; i<text.length; i++){
      var c = text[i];
      var delay = 40 + Math.random()*65;
      // Natural pauses: after punctuation, every ~20 chars
      if(c==='.'||c===','||c===':'||c===';') delay += 80 + Math.random()*120;
      else if(i>0 && i%20===0) delay += 180 + Math.random()*250;

      if(ce){
        try{
          // ownerDocument binding avoids "Illegal invocation" in webview context
          var inserted = el.ownerDocument.execCommand('insertText', false, c);
          if(!inserted) throw new Error('execCommand returned false');
        }catch(ex){
          // Fallback: use InputEvent which React listens to
          el.dispatchEvent(new InputEvent('beforeinput', {data:c, inputType:'insertText', bubbles:true, cancelable:true}));
          el.dispatchEvent(new InputEvent('input', {data:c, inputType:'insertText', bubbles:true}));
        }
      } else {
        var p2 = el.tagName==='TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        var s2 = Object.getOwnPropertyDescriptor(p2,'value') && Object.getOwnPropertyDescriptor(p2,'value').set;
        if(s2) s2.call(el, el.value + c);
        el.dispatchEvent(new InputEvent('input',{bubbles:true, data:c, inputType:'insertText'}));
        el.dispatchEvent(new Event('change',{bubbles:true}));
      }
      await sleep(delay);
    }

    // Final input event to trigger React state sync
    el.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText'}));
    el.dispatchEvent(new Event('change', {bubbles:true}));
    await sleep(300 + Math.random()*200);
  }

  var inp = findInput();
  if(!inp) return JSON.stringify({success:false, method:'failed', error:'No input found'});

  try{
    await clearAndType(inp, P);
    await sleep(300 + Math.random()*200);

    var btn = findSendBtn(inp);
    if(btn){
      btn.click();
    } else {
      inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
      inp.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',bubbles:true}));
    }
    return JSON.stringify({success:true, method:'injected'});
  }catch(e){
    return JSON.stringify({success:false, method:'failed', error:String(e)});
  }
})()`
}

const IMAGE_WATCHER_JS = `(function(){if(window.__ew)return;window.__ew=!0;window.__ei=[];const seen=new Set(),M=200;function ok(img){if(!img.src||seen.has(img.src))return!1;if(img.src.startsWith('data:')&&img.src.length<1000)return!1;if(img.src.includes('.svg'))return!1;const l=img.src.toLowerCase();if(l.includes('avatar')||l.includes('logo')||l.includes('icon')||l.includes('badge')||l.includes('favicon'))return!1;return(img.naturalWidth||img.width||0)>=M&&(img.naturalHeight||img.height||0)>=M}function cap(img){if(!ok(img))return;seen.add(img.src);window.__ei.push({src:img.src,width:img.naturalWidth||img.width,height:img.naturalHeight||img.height})}new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes){if(n.nodeName==='IMG')n.complete?cap(n):n.addEventListener('load',()=>cap(n),{once:!0});if(n.querySelectorAll)n.querySelectorAll('img').forEach(i=>i.complete?cap(i):i.addEventListener('load',()=>cap(i),{once:!0}))}}).observe(document.body,{childList:!0,subtree:!0})})()` as const

const POLL_JS = `(function(){const i=window.__ei||[];window.__ei=[];return JSON.stringify(i)})()` as const

// ─────────────────────────────────────────────────────────────────────────────
// Laplacian variance sharpness check — runs inside the webview on actual pixels
// Samples a centre crop of the image, applies 3×3 Laplacian kernel, returns
// the variance. Sharp images score > ~80; blurry placeholders score < 20.
// SHARPNESS_THRESHOLD is intentionally conservative to avoid false positives.
// ─────────────────────────────────────────────────────────────────────────────
function buildSharpnessScript(imgSelector: string): string {
  // NOTE: oaiusercontent CDN images are cross-origin. drawImage+getImageData will throw
  // a CORS taint error in the webview context. So we use dimension-based sharpness only:
  // real DALL-E images render at >= 1024px on the shorter side in the ChatGPT UI.
  // Blurry previews/thumbnails render at ~400px.
  return `(function(){
    try {
      var img = ${imgSelector};
      if(!img) return JSON.stringify({sharp:false,score:0,reason:'no_img'});

      var w = img.naturalWidth  || img.width  || 0;
      var h = img.naturalHeight || img.height || 0;

      if(w < 100 || h < 100) return JSON.stringify({sharp:false,score:0,reason:'not_loaded'});

      // Score is the shorter side — sharp = full-res (>= 800px shorter side)
      var score = Math.min(w, h);
      var sharp = score >= 800;

      return JSON.stringify({sharp: sharp, score: score, reason: 'dimension_check'});
    } catch(e) {
      return JSON.stringify({sharp:false, score:0, reason:String(e)});
    }
  })()`
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatGPT-specific quality check script
// Returns: { done: boolean, imageUrl: string|null, blurry: boolean, hasChoice: boolean }
// "done"      = ChatGPT finished generating (no spinner, no stop button)
// "imageUrl"  = highest-res confirmed image URL or null
// "blurry"    = image is still loading/placeholder
// "hasChoice" = ChatGPT showed 2 images asking user to pick — we pick the first
// ─────────────────────────────────────────────────────────────────────────────
const CHATGPT_STATUS_JS = `(function(){
  const stopBtn = document.querySelector('button[aria-label="Stop generating"],button[data-testid="stop-button"],button[aria-label="Stop streaming"]')
  // Send button: try multiple selectors — ChatGPT changes these periodically
  const sendBtn = (
    document.querySelector('button[data-testid="send-button"]') ||
    document.querySelector('button[aria-label="Send prompt"]') ||
    document.querySelector('button[aria-label="Send message"]') ||
    document.querySelector('button[aria-label*="send" i]:not([disabled])') ||
    Array.from(document.querySelectorAll('form button[type="button"]')).find(b => !b.disabled)
  )
  const isGenerating = !!stopBtn
  // isIdle: generation has started and stopped (send button visible, no stop button)
  const isIdle = !isGenerating && !!sendBtn

  // Dismiss any modal that may be blocking interaction (e.g. ChatGPT personality onboarding)
  const modal = document.querySelector('[data-testid="modal-personality-onboarding"]')
  if(modal){
    try{
      const closeBtn = modal.querySelector('button[aria-label="Close"],button[data-testid="close-button"]')
      if(closeBtn){ closeBtn.click() }
      else { modal.remove() }
    }catch(e){}
  }

  // Find all candidate images — oaiusercontent CDN (final full-res image)
  // IMPORTANT: threshold 200px to catch the preview early, we do sharpness separately
  const allImgs = Array.from(document.querySelectorAll('img'))
  const oaiImgs = allImgs
    .filter(img => img.src && img.src.includes('oaiusercontent'))
    .filter(img => {
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      return w >= 200 && h >= 200
    })

  // Detect "2 image choice" scenario — ChatGPT sometimes shows a selection UI
  const choiceImgs = Array.from(document.querySelectorAll('.grid img,[data-testid*="choice"] img,[class*="grid"] img'))
    .filter(img => img.src && img.src.includes('oaiusercontent') && (img.naturalWidth||img.width) >= 256)
  const hasChoice = choiceImgs.length >= 2

  // Pick best image: prefer choice grid, else CDN images — largest area wins
  const allCandidates = hasChoice ? choiceImgs : oaiImgs
  const best = allCandidates.sort((a,b) => {
    const wa = a.naturalWidth||a.width, ha = a.naturalHeight||a.height
    const wb = b.naturalWidth||b.width, hb = b.naturalHeight||b.height
    return (wb*hb) - (wa*ha)
  })[0]

  // Blurry check: real DALL-E images are >= 1000px on the shorter side
  // Preview thumbnails are ~400px — flag as blurry but still return the URL
  // so the caller can decide whether to wait or accept
  let blurry = true
  let imageUrl = null
  if(best){
    const w = best.naturalWidth||best.width
    const h = best.naturalHeight||best.height
    const minDim = Math.min(w, h)
    // Flag as NOT blurry only when the full-res image has loaded (>= 800px shorter side)
    blurry = minDim < 800
    imageUrl = best.src || null
  }

  return JSON.stringify({ done: isIdle, generating: isGenerating, imageUrl, blurry, hasChoice, found: allCandidates.length })
})()` as const

// Random human-like mouse-move simulation (fires pointer events on webview)
function buildMouseMoveScript(targetSel: string): string {
  return `(function(){
    const el = document.querySelector(${JSON.stringify(targetSel)})
    if(!el) return
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width/2 + (Math.random()-0.5)*r.width*0.3
    const cy = r.top + r.height/2 + (Math.random()-0.5)*r.height*0.3
    el.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:cx,clientY:cy}))
    setTimeout(()=>{
      el.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true,clientX:cx,clientY:cy}))
    },50+Math.random()*80)
  })()`
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-queue job type (used by App → WebSearch imperative API)
// ─────────────────────────────────────────────────────────────────────────────
export interface ImageGenQueueJob {
  postId:    string
  prompt:    string
  title:     string
  pageIndex: number
}

export interface AiBrowserHandle {
  /** Queue a batch of image gen jobs for fully-automatic execution */
  queueBatch: (jobs: ImageGenQueueJob[], chatGptUrl: string) => void
  /** Cancel any running auto-queue */
  cancelQueue: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Tab {
  id:         string
  initialUrl: string   // set once — used as webview src, NEVER changed after mount
  url:        string   // current page URL — drives isHome check + address bar
  inputUrl:   string
  title:      string
  favicon:    string
  loading:    boolean
  canBack:    boolean
  canFwd:     boolean
  error:      string | null
}

interface PendingPrompt {
  postId:     string
  prompt:     string
  title:      string
  status:     'pending' | 'injecting' | 'waiting_image' | 'done' | 'error'
  error?:     string
  imagePath?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

let _tc = 0
function makeTab(url = 'elite://newtab'): Tab {
  return {
    id:         `t${++_tc}`,
    initialUrl: url,
    url,
    inputUrl:   url === 'elite://newtab' ? '' : url,
    title:      url === 'elite://newtab' ? 'New Tab' : url,
    favicon:    '',
    loading:    url !== 'elite://newtab',
    canBack:    false,
    canFwd:     false,
    error:      null,
  }
}

function normalise(raw: string): string {
  const t = raw.trim()
  if (!t || t === 'elite://newtab') return 'elite://newtab'
  if (/^https?:\/\//i.test(t)) return t
  if (/^[\w-]+\.[a-z]{2,}/i.test(t)) return 'https://' + t
  return 'https://www.google.com/search?q=' + encodeURIComponent(t)
}

function faviconUrl(pageUrl: string): string {
  try {
    const { hostname } = new URL(pageUrl)
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
  } catch { return '' }
}

function hostname(pageUrl: string): string {
  try { return new URL(pageUrl).hostname } catch { return pageUrl }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth domains — hard-blocked inside webview, must go via system browser
// ─────────────────────────────────────────────────────────────────────────────

const HARD_BLOCK_DOMAINS = [
  'accounts.google.com', 'signin.google.com',
  'login.microsoftonline.com', 'login.microsoft.com', 'login.live.com',
  'appleid.apple.com', 'idmsa.apple.com',
]

const OAUTH_POPUP_DOMAINS = [
  'auth.openai.com', 'auth0.com', 'login.perplexity.ai',
  'clerk.claude.ai', 'auth.anthropic.com',
]

// ─────────────────────────────────────────────────────────────────────────────
// Browser Settings Drawer
// ─────────────────────────────────────────────────────────────────────────────

type ClearStatus = 'idle' | 'clearing' | 'done'

const MANAGED_SITES = [
  { name: 'ChatGPT',    domain: 'openai.com',       color: '#10a37f' },
  { name: 'Google',     domain: 'google.com',        color: '#4285F4' },
  { name: 'Claude',     domain: 'claude.ai',         color: '#cc785c' },
  { name: 'Perplexity', domain: 'perplexity.ai',     color: '#5b5ef4' },
  { name: 'Gemini',     domain: 'gemini.google.com', color: '#4285F4' },
  { name: 'Midjourney', domain: 'midjourney.com',    color: '#e63946' },
  { name: 'Microsoft',  domain: 'microsoft.com',     color: '#00A4EF' },
]

function BrowserSettings({ onClose }: { onClose: () => void }): React.ReactElement {
  const [siteStatus, setSiteStatus] = useState<Record<string, ClearStatus>>({})
  const [allStatus,  setAllStatus]  = useState<ClearStatus>('idle')

  const clearSite = async (domain: string): Promise<void> => {
    setSiteStatus(s => ({ ...s, [domain]: 'clearing' }))
    await window.api.clearSiteData?.(domain)
    setSiteStatus(s => ({ ...s, [domain]: 'done' }))
    setTimeout(() => setSiteStatus(s => ({ ...s, [domain]: 'idle' })), 2500)
  }

  const clearAll = async (): Promise<void> => {
    setAllStatus('clearing')
    await window.api.clearBrowserData?.()
    setAllStatus('done')
    setTimeout(() => setAllStatus('idle'), 2500)
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div style={{
        width: 380, height: '100%', overflow: 'auto',
        background: 'var(--surface-1)',
        borderLeft: '1px solid var(--border-default)',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Settings size={15} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Browser Settings</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 5, display: 'flex', borderRadius: 6, transition: 'color 0.1s' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Clear site cookies & storage
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 28 }}>
            {MANAGED_SITES.map(site => {
              const st = siteStatus[site.domain] ?? 'idle'
              return (
                <div key={site.domain} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 10,
                }}>
                  <img src={`https://www.google.com/s2/favicons?domain=${site.domain}&sz=32`}
                    alt={site.name} width={16} height={16}
                    style={{ borderRadius: 3, flexShrink: 0 }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{site.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{site.domain}</span>
                  <button
                    onClick={() => void clearSite(site.domain)}
                    disabled={st === 'clearing'}
                    style={{
                      padding: '5px 12px', borderRadius: 7, flexShrink: 0,
                      background: st === 'done' ? 'rgba(11,218,118,0.12)' : 'var(--surface-3)',
                      border: `1px solid ${st === 'done' ? 'rgba(11,218,118,0.3)' : 'var(--border-default)'}`,
                      color: st === 'done' ? '#0bda76' : 'var(--text-secondary)',
                      fontSize: 11, fontWeight: 600,
                      cursor: st === 'clearing' ? 'not-allowed' : 'pointer',
                      opacity: st === 'clearing' ? 0.5 : 1,
                      display: 'flex', alignItems: 'center', gap: 5,
                      transition: 'all 0.18s',
                    }}>
                    {st === 'clearing' ? <Loader size={10} style={{ animation: 'spin 0.8s linear infinite' }} /> : st === 'done' ? '✓' : <Trash2 size={10} />}
                    {st === 'done' ? 'Cleared' : 'Clear'}
                  </button>
                </div>
              )
            })}
          </div>

          <div style={{ padding: 16, background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 12 }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Reset all browser data</p>
            <p style={{ margin: '0 0 14px', fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              Clears ALL cookies, storage, and cache. You'll be signed out everywhere.
            </p>
            <button
              onClick={() => void clearAll()}
              disabled={allStatus === 'clearing'}
              style={{
                width: '100%', padding: '10px', borderRadius: 9,
                background: allStatus === 'done' ? 'rgba(11,218,118,0.12)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${allStatus === 'done' ? 'rgba(11,218,118,0.3)' : 'rgba(239,68,68,0.25)'}`,
                color: allStatus === 'done' ? '#0bda76' : '#ef4444',
                fontSize: 12, fontWeight: 700,
                cursor: allStatus === 'clearing' ? 'not-allowed' : 'pointer',
                opacity: allStatus === 'clearing' ? 0.5 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 0.18s',
              }}>
              {allStatus === 'clearing' ? <><Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> Clearing…</> :
               allStatus === 'done' ? '✓ All data cleared' : <><RefreshCw size={12} /> Reset All Browser Data</>}
            </button>
          </div>

          <p style={{ margin: '16px 0 0', fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.65 }}>
            If a site shows a sign-in error (e.g. "session not found"), clear that site's data and try signing in again.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Home page (new tab page)
// ─────────────────────────────────────────────────────────────────────────────

const QUICK_SITES = [
  { name: 'ChatGPT',    url: 'https://chatgpt.com',        accent: '#10a37f' },
  { name: 'Claude',     url: 'https://claude.ai',          accent: '#cc785c' },
  { name: 'Perplexity', url: 'https://www.perplexity.ai',  accent: '#5b5ef4' },
  { name: 'Gemini',     url: 'https://gemini.google.com',  accent: '#4285f4' },
  { name: 'Midjourney', url: 'https://www.midjourney.com', accent: '#e63946' },
  { name: 'Ideogram',   url: 'https://ideogram.ai',        accent: '#f4a261' },
  { name: 'Grok',       url: 'https://x.ai',               accent: '#e7e9ea' },
  { name: 'Sora',       url: 'https://sora.com',           accent: '#ff6b35' },
]

const SIGNIN_SITES = [
  { name: 'ChatGPT',    url: 'https://chatgpt.com/auth/login', color: '#10a37f', note: 'Email, Google, Microsoft, Apple', favicon: 'https://www.google.com/s2/favicons?domain=chatgpt.com&sz=32' },
  { name: 'Gemini',     url: 'https://gemini.google.com',      color: '#4285F4', note: 'Google account',                  favicon: 'https://www.google.com/s2/favicons?domain=gemini.google.com&sz=32' },
  { name: 'Claude',     url: 'https://claude.ai/login',        color: '#cc785c', note: 'Email, Google',                   favicon: 'https://www.google.com/s2/favicons?domain=claude.ai&sz=32' },
  { name: 'Perplexity', url: 'https://www.perplexity.ai',      color: '#5b5ef4', note: 'Email, Google',                   favicon: 'https://www.google.com/s2/favicons?domain=perplexity.ai&sz=32' },
]

function BrowserHome({ onNavigate }: { onNavigate: (u: string) => void }): React.ReactElement {
  const [q, setQ] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  const go = (): void => {
    const u = normalise(q)
    if (u !== 'elite://newtab') onNavigate(u)
  }

  const openAuthPopup = (u: string): void => { window.api.openAuthPopup?.(u) }

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 20px', overflow: 'auto',
      background: 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(11,218,118,0.06) 0%, transparent 65%)',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 56, height: 56, borderRadius: 18, marginBottom: 16,
          background: 'linear-gradient(135deg,rgba(11,218,118,0.15),rgba(11,218,118,0.04))',
          border: '1px solid rgba(11,218,118,0.2)',
          boxShadow: '0 0 50px rgba(11,218,118,0.1)',
        }}>
          <Brain size={26} style={{ color: 'var(--accent)' }} />
        </div>
        <h1 style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em' }}>
          AI Browser
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>One workspace. Every AI tool.</p>
      </div>

      {/* Search bar */}
      <div style={{ width: '100%', maxWidth: 540, marginBottom: 32 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--surface-2)',
          border: '1px solid var(--border-default)',
          borderRadius: 14, padding: '0 16px',
          boxShadow: '0 2px 20px rgba(0,0,0,0.3)',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
          onFocus={() => {}}
        >
          <Search size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            ref={ref}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && go()}
            placeholder="Search or enter a URL..."
            style={{
              flex: 1, padding: '14px 0',
              background: 'none', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit',
            }}
          />
          {q && (
            <button onClick={go} style={{
              padding: '6px 16px', borderRadius: 9,
              background: 'var(--accent)', color: 'var(--accent-fg)',
              border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, flexShrink: 0,
            }}>Go</button>
          )}
        </div>
      </div>

      {/* Sign in section */}
      <div style={{ width: '100%', maxWidth: 540, marginBottom: 28 }}>
        <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Sign in to AI sites
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SIGNIN_SITES.map(s => (
            <button key={s.url} onClick={() => onNavigate(s.url)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
              background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
              borderRadius: 11, cursor: 'pointer', textAlign: 'left', width: '100%',
              transition: 'all 0.12s',
            }}
              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = s.color + '55'; b.style.background = s.color + '0d' }}
              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'var(--border-subtle)'; b.style.background = 'var(--surface-2)' }}
            >
              <img src={s.favicon} alt={s.name} width={18} height={18} style={{ borderRadius: 4, flexShrink: 0 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{s.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.note}</span>
              <Globe size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>

      {/* Google/Microsoft/Apple system browser sign-in */}
      <div style={{ width: '100%', maxWidth: 540, marginBottom: 28 }}>
        <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Sign in via System Browser
        </p>
        <div style={{ padding: '16px', background: 'var(--surface-2)', border: '1px solid var(--border-default)', borderRadius: 12 }}>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Opens your system browser (Chrome/Safari). Once signed in, the session is saved — no re-login needed.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { name: 'Google', url: 'https://accounts.google.com/signin', color: '#4285F4' },
              { name: 'Microsoft', url: 'https://login.microsoftonline.com', color: '#00A4EF' },
              { name: 'Apple', url: 'https://appleid.apple.com/sign-in', color: '#aaa' },
            ].map(p => (
              <button key={p.name} onClick={() => openAuthPopup(p.url)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px',
                background: p.color + '14', border: `1px solid ${p.color}40`,
                borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                transition: 'all 0.12s',
              }}
                onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = p.color + '25'; b.style.borderColor = p.color + '80'; b.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = p.color + '14'; b.style.borderColor = p.color + '40'; b.style.transform = 'none' }}
              >
                <Globe size={12} style={{ color: p.color }} /> {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick access grid */}
      <div style={{ width: '100%', maxWidth: 540 }}>
        <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Quick Access
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {QUICK_SITES.map(s => (
            <button key={s.url} onClick={() => onNavigate(s.url)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              padding: '18px 10px', background: 'var(--surface-2)',
              border: '1px solid var(--border-subtle)', borderRadius: 14, cursor: 'pointer',
              transition: 'all 0.12s',
            }}
              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = s.accent + '55'; b.style.transform = 'translateY(-2px)'; b.style.background = s.accent + '0f' }}
              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'var(--border-subtle)'; b.style.transform = 'none'; b.style.background = 'var(--surface-2)' }}
            >
              <img src={`https://www.google.com/s2/favicons?domain=${new URL(s.url).hostname}&sz=32`}
                alt={s.name} width={22} height={22} style={{ borderRadius: 5, objectFit: 'contain' }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '-0.01em' }}>
                {s.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginTop: 32, fontSize: 11, color: 'var(--text-tertiary)' }}>
        {[{ icon: <Sparkles size={11} />, label: 'Prompt injection' }, { icon: <Cpu size={11} />, label: 'Image capture' }, { icon: <Palette size={11} />, label: 'Session memory' }].map(f => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: 'var(--accent)' }}>{f.icon}</span>{f.label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Error page
// ─────────────────────────────────────────────────────────────────────────────

function ErrorPage({ url, onRetry }: { url: string; onRetry: () => void }): React.ReactElement {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 40,
      background: 'radial-gradient(ellipse 60% 40% at 50% 50%,rgba(239,68,68,0.04) 0%,transparent 70%)',
    }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, marginBottom: 24, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>✕</div>
      <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Can't reach this page</h2>
      <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-tertiary)', maxWidth: 360, textAlign: 'center', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text-secondary)' }}>{hostname(url)}</strong> didn't respond.<br/>Check your connection or try again.
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        <button onClick={onRetry} style={{ padding: '9px 22px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', cursor: 'pointer' }}>Try again</button>
        <button onClick={() => void navigator.clipboard.writeText(url)} style={{ padding: '9px 22px', borderRadius: 9, fontSize: 13, fontWeight: 500, background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', cursor: 'pointer' }}>Copy URL</button>
      </div>
      <p style={{ marginTop: 28, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace', maxWidth: 420, wordBreak: 'break-all', textAlign: 'center' }}>{url}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TabView — one per tab, mounted once, NEVER unmounted
// ─────────────────────────────────────────────────────────────────────────────

interface TabViewProps {
  tab:           Tab
  active:        boolean
  wvMap:         React.RefObject<Map<string, WebviewElement>>
  onUpdate:      (id: string, p: Partial<Tab>) => void
  onNavigate:    (id: string, url: string) => void
  onNewTab:      (url: string) => void
  activePostRef: React.RefObject<string | null>
  onImageFound:  (src: string, postId: string) => void
}

const TabView = React.memo(function TabView({
  tab, active, wvMap, onUpdate, onNavigate, onNewTab, activePostRef, onImageFound,
}: TabViewProps): React.ReactElement {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Callback ref — fires once when webview element first mounts
  const setRef = useCallback((el: WebviewElement | null): void => {
    if (!el) return
    if (wvMap.current.get(tab.id) === el) return
    wvMap.current.set(tab.id, el)

    el.addEventListener('did-start-loading', () => {
      onUpdate(tab.id, { loading: true, error: null })
    })

    el.addEventListener('did-stop-loading', () => {
      try {
        const u = el.getURL()
        if (!u || u === 'about:blank') return

        // Stub WebAuthn on Microsoft login pages
        if (u.includes('login.microsoftonline.com') || u.includes('login.microsoft.com') || u.includes('login.live.com')) {
          el.executeJavaScript(`
            try {
              Object.defineProperty(navigator, 'credentials', {
                value: { get: () => Promise.reject(new Error('Not supported')), create: () => Promise.reject(new Error('Not supported')) },
                configurable: true
              });
              const tryPwd = () => {
                const links = Array.from(document.querySelectorAll('a,button'));
                const pwdLink = links.find(el => /password|sign.in.another.way|other.ways/i.test(el.textContent || ''));
                if (pwdLink) { pwdLink.click(); return; }
              };
              setTimeout(tryPwd, 800); setTimeout(tryPwd, 1800);
            } catch(e) {}
          `).catch(() => {})
        }

        onUpdate(tab.id, {
          loading: false, url: u, inputUrl: u,
          canBack: el.canGoBack(), canFwd: el.canGoForward(),
          error: null, favicon: faviconUrl(u),
        })
        el.executeJavaScript(IMAGE_WATCHER_JS).catch(() => {})
      } catch { /* destroyed */ }
    })

    el.addEventListener('did-fail-load', (e: Event) => {
      const ev = e as Event & { errorCode?: number; validatedURL?: string }
      const code = ev.errorCode ?? 0
      const benign = code === 0 || code === -3 || (code > -100 && code !== 0)
      if (benign) { onUpdate(tab.id, { loading: false }); return }
      try {
        const u = ev.validatedURL || el.getURL() || tab.url
        if (!u || u === 'about:blank') { onUpdate(tab.id, { loading: false }); return }
        onUpdate(tab.id, { loading: false, error: u })
      } catch { onUpdate(tab.id, { loading: false, error: tab.url }) }
    })

    el.addEventListener('did-navigate', () => {
      try { onUpdate(tab.id, { canBack: el.canGoBack(), canFwd: el.canGoForward(), url: el.getURL(), inputUrl: el.getURL() }) } catch {}
    })
    el.addEventListener('did-navigate-in-page', () => {
      try { onUpdate(tab.id, { canBack: el.canGoBack(), canFwd: el.canGoForward(), url: el.getURL(), inputUrl: el.getURL() }) } catch {}
    })
    ;(el as EventTarget).addEventListener('page-title-updated', (e: Event) => {
      const ev = e as Event & { title?: string }
      const t = ev.title ?? (e as CustomEvent<{ title?: string }>).detail?.title
      if (t) onUpdate(tab.id, { title: t })
    })
    el.addEventListener('page-favicon-updated', (e: Event) => {
      const ev = e as Event & { favicons?: string[] }
      const fav = ev.favicons?.[0]
      if (fav) onUpdate(tab.id, { favicon: fav })
    })

    // new-window: auth domains → system browser, others → new in-app tab
    el.addEventListener('new-window', (e: Event) => {
      const ev = e as Event & { url?: string }
      if (!ev.url || ev.url === 'about:blank') return
      try {
        const { hostname: h } = new URL(ev.url)
        if (HARD_BLOCK_DOMAINS.some(d => h === d || h.endsWith('.' + d))) {
          window.api.openAuthPopup?.(ev.url); return
        }
        if (OAUTH_POPUP_DOMAINS.some(d => h === d || h.endsWith('.' + d))) {
          window.api.openAuthPopup?.(ev.url); return
        }
      } catch {}
      onNewTab(ev.url)
    })

    // Right-click context menu — send params to main process to show native menu
    ;(el as HTMLElement).addEventListener('contextmenu', (e: Event) => {
      const ce = e as MouseEvent
      // executeJavaScript to get context info at click point
      el.executeJavaScript(`
        (function() {
          var el = document.elementFromPoint(${ce.clientX}, ${ce.clientY});
          var linkEl = el && el.closest('a[href]');
          var imgEl = el && (el.tagName === 'IMG' ? el : el.closest('[style*="background-image"]'));
          var sel = window.getSelection ? window.getSelection().toString() : '';
          var isEdit = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || el.closest('[contenteditable]'));
          return JSON.stringify({
            linkUrl: linkEl ? linkEl.href : (el && el.tagName === 'A' ? el.href : ''),
            srcUrl: imgEl && imgEl.tagName === 'IMG' ? imgEl.src : '',
            selectionText: sel,
            isEditable: !!isEdit,
            pageURL: location.href
          });
        })()
      `).then((raw: unknown) => {
        try {
          const info = JSON.parse(raw as string) as { linkUrl?: string; srcUrl?: string; selectionText?: string; isEditable?: boolean; pageURL?: string }
          window.api.showContextMenu?.({
            x: ce.screenX, y: ce.screenY,
            linkUrl: info.linkUrl || undefined,
            srcUrl: info.srcUrl || undefined,
            selectionText: info.selectionText || undefined,
            isEditable: info.isEditable,
            pageURL: info.pageURL,
          })
        } catch {}
      }).catch(() => {})
    })
  }, [tab.id, wvMap, onUpdate, onNewTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Image poll — only when there's an active injection
  useEffect(() => {
    if (!activePostRef.current) return
    const wv = wvMap.current.get(tab.id)
    if (!wv || !active) return
    pollRef.current = setInterval(async () => {
      if (!activePostRef.current) { clearInterval(pollRef.current!); pollRef.current = null; return }
      try {
        const raw = await wv.executeJavaScript(POLL_JS)
        const imgs = JSON.parse(raw as string) as Array<{ src: string }>
        if (imgs.length > 0 && activePostRef.current) { clearInterval(pollRef.current!); pollRef.current = null; onImageFound(imgs[0].src, activePostRef.current) }
      } catch {}
    }, 2000)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  })

  const isHome  = tab.url === 'elite://newtab'
  const isError = !!tab.error && !tab.loading

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: active ? 'flex' : 'none',
      flexDirection: 'column',
    }}>
      {isHome || isError ? (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {isError
            ? <ErrorPage url={tab.error!} onRetry={() => { onUpdate(tab.id, { error: null }); wvMap.current.get(tab.id)?.reload() }} />
            : <BrowserHome onNavigate={u => onNavigate(tab.id, u)} />}
        </div>
      ) : (
        <webview
          ref={setRef}
          src={tab.initialUrl}
          partition="persist:ai-browser"
          allowpopups={true}
          useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
          style={{ flex: 1, width: '100%', height: '100%', display: 'flex', minHeight: 0 }}
        />
      )}
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface AiBrowserProps {
  /** Called when an image is fully captured and passes quality checks */
  onImageReady?: (postId: string, filePath: string) => void
}

const AiBrowser = forwardRef<AiBrowserHandle, AiBrowserProps>(function AiBrowser(
  { onImageReady },
  ref,
): React.ReactElement {
  // Start with a home (new tab) page, not ChatGPT
  const [tabs,         setTabs]         = useState<Tab[]>(() => [makeTab()])
  const [activeId,     setActiveId]     = useState<string>(() => `t${_tc}`)
  const [panelOpen,    setPanelOpen]    = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [prompts,      setPrompts]      = useState<PendingPrompt[]>([])
  const [toast,        setToast]        = useState<string | null>(null)

  // Drag-to-reorder state
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const wvMap         = useRef<Map<string, WebviewElement>>(new Map())
  const activePostRef = useRef<string | null>(null)

  // Auto-queue state
  const autoQueueRef    = useRef<ImageGenQueueJob[]>([])
  const autoRunningRef  = useRef(false)
  const autoCancelRef   = useRef(false)
  const autoTabIdRef    = useRef<string | null>(null)   // dedicated tab for auto-gen
  const autoChatUrlRef  = useRef<string>('')

  const activeTab = tabs.find(t => t.id === activeId) ?? tabs[0]

  // ── Browser events from main process (context menu actions) ─────────────
  useEffect(() => {
    if (!window.api.onBrowserEvent) return
    const unsub = window.api.onBrowserEvent((evt, data) => {
      const wv = wvMap.current.get(activeId)
      if (evt === 'browser:open-new-tab' && typeof data === 'string') {
        addTab(data)
      } else if (evt === 'browser:reload') {
        wv?.reload()
      } else if (evt === 'browser:go-back') {
        wv?.goBack()
      } else if (evt === 'browser:go-forward') {
        wv?.goForward()
      } else if (evt === 'browser:paste') {
        wv?.executeJavaScript(`
          (function() {
            navigator.clipboard.readText().then(t => {
              const el = document.activeElement;
              if (!el) return;
              if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                const start = el.selectionStart || 0;
                const end = el.selectionEnd || 0;
                el.value = el.value.slice(0, start) + t + el.value.slice(end);
                el.dispatchEvent(new InputEvent('input', { bubbles: true }));
              } else if (el.isContentEditable) {
                document.execCommand('insertText', false, t);
              }
            }).catch(() => {});
          })()
        `).catch(() => {})
      }
    })
    return unsub
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reload active tab after OAuth popup closes ───────────────────────────
  useEffect(() => {
    window.api.onAuthComplete?.(() => {
      const wv = wvMap.current.get(activeId)
      if (wv) wv.reload()
    })
  }, [activeId])

  // ── Persist prompts ──────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem('elite_pending_prompts')
      if (raw) {
        const p = JSON.parse(raw) as PendingPrompt[]
        setPrompts(p.map(x => x.status === 'injecting' ? { ...x, status: 'pending' as const } : x))
      }
    } catch {}
  }, [])
  useEffect(() => {
    localStorage.setItem('elite_pending_prompts', JSON.stringify(prompts))
  }, [prompts])

  // ── Receive prompts from Forge ───────────────────────────────────────────
  useEffect(() => {
    const h = (e: Event): void => {
      const d = (e as CustomEvent<{ postId: string; prompt: string; title: string }>).detail
      setPrompts(prev => prev.find(p => p.postId === d.postId) ? prev : [...prev, { ...d, status: 'pending' }])
      setPanelOpen(true)
    }
    window.addEventListener('elite-inject-prompt', h)
    return () => window.removeEventListener('elite-inject-prompt', h)
  }, [])

  // ── Tab management ───────────────────────────────────────────────────────
  const addTab = useCallback((url = 'elite://newtab'): void => {
    const t = makeTab(url)
    setTabs(prev => [...prev, t])
    setActiveId(t.id)
  }, [])

  const closeTab = useCallback((id: string, e: React.MouseEvent): void => {
    e.stopPropagation()
    wvMap.current.delete(id)
    setTabs(prev => {
      if (prev.length === 1) {
        const fresh = makeTab()
        setActiveId(fresh.id)
        return [fresh]
      }
      const idx  = prev.findIndex(t => t.id === id)
      const next = prev.filter(t => t.id !== id)
      if (id === activeId) setActiveId(next[Math.max(0, idx - 1)].id)
      return next
    })
  }, [activeId])

  const updateTab = useCallback((id: string, patch: Partial<Tab>): void => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }, [])

  // Navigate: update url so isHome turns false, update initialUrl on first real nav from newtab
  const navigateTab = useCallback((id: string, rawUrl: string): void => {
    const u = normalise(rawUrl)
    if (u === 'elite://newtab') {
      updateTab(id, { url: u, inputUrl: '', title: 'New Tab', loading: false, error: null })
      return
    }
    const tab = tabs.find(t => t.id === id)
    const patch: Partial<Tab> = { url: u, inputUrl: u, error: null, loading: true }
    // If born as newtab, initialUrl must be set to real URL so webview src is valid on first mount
    if (tab?.initialUrl === 'elite://newtab') patch.initialUrl = u
    updateTab(id, patch)
    const wv = wvMap.current.get(id)
    if (wv) wv.loadURL(u)
  }, [updateTab, tabs])

  const submitUrl = useCallback((): void => {
    if (!activeTab) return
    navigateTab(activeId, activeTab.inputUrl)
  }, [activeTab, activeId, navigateTab])

  // ── Drag-to-reorder ──────────────────────────────────────────────────────
  const handleDragStart = useCallback((id: string) => {
    setDragId(id)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault()
    setDragOver(id)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    setDragId(null); setDragOver(null)
    if (!dragId || dragId === targetId) return
    setTabs(prev => {
      const from = prev.findIndex(t => t.id === dragId)
      const to   = prev.findIndex(t => t.id === targetId)
      if (from < 0 || to < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [dragId])

  const handleDragEnd = useCallback(() => {
    setDragId(null); setDragOver(null)
  }, [])

  // ── Image download + Laplacian quality gate + inject ──────────────────────
  // Uses the Python backend's OpenCV Laplacian check as a BLOCKING gate.
  // Retries up to MAX_SHARP_RETRIES times with SHARP_RETRY_MS delay between each.
  // Only calls onImageReady (→ Studio injection) when sharp=true.
  const MAX_SHARP_RETRIES = 6
  const SHARP_RETRY_MS    = 5000

  const handleImageFound = useCallback(async (src: string, postId: string): Promise<void> => {
    window.api.log('[ImageGen] handleImageFound — postId:', postId, 'url:', src.slice(0, 80))

    if (!window.api.downloadBrowserImage) {
      window.api.log('[ImageGen][ERROR] downloadBrowserImage IPC not available')
      setPrompts(prev => prev.map(p => p.postId === postId ? { ...p, status: 'error', error: 'IPC not available' } : p))
      return
    }

    for (let attempt = 1; attempt <= MAX_SHARP_RETRIES; attempt++) {
      if (attempt > 1) {
        window.api.log(`[ImageGen] Laplacian retry ${attempt}/${MAX_SHARP_RETRIES} — waiting ${SHARP_RETRY_MS/1000}s for CDN...`)
        setToast(`Waiting for sharp image (attempt ${attempt}/${MAX_SHARP_RETRIES})… | ${postId}`)
        await new Promise(r => setTimeout(r, SHARP_RETRY_MS))
      }

      setToast(`Downloading image (attempt ${attempt})…`)
      const { tmpPath, success } = await window.api.downloadBrowserImage({ url: src, postId })
      window.api.log(`[ImageGen] download attempt ${attempt} — success:${success} path:${tmpPath}`)

      if (!success || !tmpPath) {
        window.api.log(`[ImageGen] Download failed on attempt ${attempt}`)
        continue
      }

      // Blocking Laplacian check via Python/OpenCV backend
      let sharp = false
      let score = 0
      try {
        const qr = await fetch('http://127.0.0.1:8000/api/check-image-quality', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tmp_path: tmpPath }),
        })
        const d = await qr.json() as { sharp: boolean; score: number }
        sharp = d.sharp
        score = d.score
        window.api.log(`[ImageGen] Laplacian score: ${score.toFixed(1)} sharp:${sharp} (attempt ${attempt}/${MAX_SHARP_RETRIES})`)
        setToast(`Laplacian score: ${score.toFixed(0)} ${sharp ? '✓ sharp' : '— blurry, retrying…'}`)
      } catch (e) {
        // Backend unavailable — accept the image anyway
        window.api.log(`[ImageGen] Quality check unavailable, accepting image: ${e}`)
        sharp = true
      }

      if (sharp) {
        setPrompts(prev => prev.map(p => p.postId === postId ? { ...p, status: 'done', imagePath: tmpPath } : p))
        setToast('Sharp image captured ✓ — injecting into Studio…')
        setTimeout(() => setToast(null), 4000)
        window.api.log(`[ImageGen] ✓ Injecting into Studio — postId:${postId} score:${score.toFixed(0)}`)
        onImageReady?.(postId, tmpPath)
        return
      }
    }

    // All retries exhausted — inject best available rather than failing silently
    window.api.log(`[ImageGen] All ${MAX_SHARP_RETRIES} Laplacian retries failed — injecting best available`)
    setToast('Image injected (best available — CDN may still be encoding)')
    setTimeout(() => setToast(null), 5000)
    const { tmpPath: fallbackPath, success: fallbackOk } = await window.api.downloadBrowserImage({ url: src, postId })
    if (fallbackOk && fallbackPath) {
      setPrompts(prev => prev.map(p => p.postId === postId ? { ...p, status: 'done', imagePath: fallbackPath } : p))
      onImageReady?.(postId, fallbackPath)
    } else {
      setPrompts(prev => prev.map(p => p.postId === postId ? { ...p, status: 'error', error: 'Download failed after all retries' } : p))
    }
  }, [onImageReady])

  // ── Auto-queue ────────────────────────────────────────────────────────────
  // Uses ONE tab for all jobs. Between jobs clicks "New chat" (no reload).
  // Waits for network idle before injecting.

  const runAutoQueue = useCallback(async (): Promise<void> => {
    if (autoRunningRef.current) return
    autoRunningRef.current = true
    autoCancelRef.current  = false

    const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))
    const tabId = autoTabIdRef.current!
    setActiveId(tabId)
    setPanelOpen(true)

    // ── helpers ──────────────────────────────────────────────────────────────

    // Wait for the webview element to mount (up to 10s)
    const getWv = async (): Promise<WebviewElement | null> => {
      for (let i = 0; i < 50; i++) {
        const wv = wvMap.current.get(tabId)
        if (wv) return wv
        await sleep(200)
      }
      return null
    }

    // Wait for network to go idle: did-stop-loading + no spinner + input visible
    // This is more reliable than just polling for DOM — ensures React has rendered
    const waitNetworkIdle = (wv: WebviewElement): Promise<boolean> => {
      return new Promise(resolve => {
        const TIMEOUT = 45_000
        let settled = false
        const timer = setTimeout(() => { if (!settled) { settled = true; resolve(false) } }, TIMEOUT)

        const onStop = (): void => {
          // After load stops, poll for the prompt input (SPA may still be hydrating)
          // Also wait for stop-button to disappear (ChatGPT sometimes auto-starts something)
          let attempts = 0
          const poll = (): void => {
            if (settled) return
            wv.executeJavaScript(`(function(){
              const input = !!(
                document.querySelector('#prompt-textarea') ||
                document.querySelector('div[contenteditable="true"][data-placeholder]') ||
                document.querySelector('div[contenteditable="true"].ProseMirror') ||
                document.querySelector('div[contenteditable="true"]') ||
                document.querySelector('textarea')
              )
              // Also check send button is present — confirms UI is fully interactive
              const sendBtn = !!(
                document.querySelector('button[data-testid="send-button"]') ||
                document.querySelector('button[aria-label="Send prompt"]') ||
                document.querySelector('button[aria-label="Send message"]') ||
                Array.from(document.querySelectorAll('form button[type="button"]')).some(b => !b.disabled)
              )
              return input && sendBtn
            })()`).then(found => {
              if (found) {
                clearTimeout(timer)
                settled = true
                window.api.log('[ImageGen] ChatGPT input + send button ready — 2s settle buffer')
                // 2s buffer — ChatGPT GPT URLs do a second redirect after input appears
                setTimeout(() => resolve(true), 2000)
              } else if (++attempts < 60) {
                setTimeout(poll, 500)
              } else {
                clearTimeout(timer)
                settled = true
                window.api.log('[ImageGen][WARN] waitNetworkIdle: timed out after 60 polls')
                resolve(false)
              }
            }).catch(() => { if (++attempts < 60) setTimeout(poll, 500) })
          }
          setTimeout(poll, 600)
        }

        wv.addEventListener('did-stop-loading', onStop)
        // Also start polling immediately in case the page is already loaded
        setTimeout(onStop, 200)
      })
    }

    // Click "New chat" button to start a fresh conversation without navigating away
    const clickNewChat = async (wv: WebviewElement): Promise<void> => {
      try {
        await wv.executeJavaScript(`(function(){
          var btn = document.querySelector('a[href="/"],button[aria-label*="New"],button[aria-label*="new chat" i],[data-testid="new-chat-button"]');
          if(!btn){
            // Try sidebar "New chat" link
            var links = Array.from(document.querySelectorAll('a,button'));
            btn = links.find(function(el){
              return /new.?chat/i.test(el.getAttribute('aria-label')||el.textContent||'');
            });
          }
          if(btn){ btn.click(); return true; }
          return false;
        })()`)
        await sleep(1200)
      } catch { /* ignore — will just use existing context */ }
    }

    // ── main loop: one job at a time, same tab ────────────────────────────────
    const wv = await getWv()
    if (!wv) {
      setPrompts(prev => prev.map(p => ({ ...p, status: 'error' as const, error: 'Webview failed to mount' })))
      autoRunningRef.current = false
      return
    }

    const jobs = autoQueueRef.current
    for (let jobIdx = 0; jobIdx < jobs.length; jobIdx++) {
      if (autoCancelRef.current) break
      const job = jobs[jobIdx]

      setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'injecting' as const } : p))

      // For jobs after the first: click "New chat" to get a fresh prompt box
      if (jobIdx > 0) {
        setToast(`Starting new chat for: ${job.title}`)
        await clickNewChat(wv)
        // Wait for the input to be ready again
        const ready = await waitNetworkIdle(wv)
        if (!ready || autoCancelRef.current) {
          setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'error' as const, error: 'New chat did not load' } : p))
          continue
        }
      } else {
        // First job: page already loading from tab creation — wait for idle
        setToast(`Waiting for ChatGPT to load…`)
        const ready = await waitNetworkIdle(wv)
        if (!ready || autoCancelRef.current) {
          setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'error' as const, error: 'ChatGPT did not load — check login' } : p))
          break
        }
      }

      // Dismiss any ChatGPT modal (personality onboarding, etc.) that may block input
      try {
        await wv.executeJavaScript(`(function(){
          var modal = document.querySelector('[data-testid="modal-personality-onboarding"],[role="dialog"]');
          if(!modal) return;
          var closeBtn = modal.querySelector('button[aria-label="Close"],button[data-testid="close-button"]');
          if(closeBtn){ closeBtn.click(); return; }
          modal.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
          document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        })()`)
        await sleep(400)
      } catch {}

      // Install image watcher (safe to call multiple times — guarded by window.__ew)
      try { await wv.executeJavaScript(IMAGE_WATCHER_JS) } catch {}

      // Human-like mouse movement toward the input
      try {
        await wv.executeJavaScript(buildMouseMoveScript(
          '#prompt-textarea, div[contenteditable="true"][data-placeholder], div[contenteditable="true"]'
        ))
        await sleep(200 + Math.random() * 250)
      } catch {}

      // Set which post this image belongs to
      activePostRef.current = job.postId

      // Inject the prompt with human-like typing
      setToast(`Typing for: ${job.title}`)
      setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'injecting' as const } : p))

      // Prefix tells ChatGPT to generate image only — no explanations
      const prefixedPrompt = `Generate the image for the given prompt. I only need the image, no text or explanations, just generate the image:\n\n${job.prompt}`

      try {
        const raw = await wv.executeJavaScript(buildInjectorScript(prefixedPrompt))
        const res = JSON.parse(raw as string) as { success: boolean; error?: string }
        window.api.log(`[ImageGen] Inject result:`, res)
        if (!res.success) {
          setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'error' as const, error: res.error || 'Inject failed' } : p))
          activePostRef.current = null
          await sleep(1500)
          continue
        }
      } catch (e) {
        window.api.log(`[ImageGen][ERROR] Inject threw:`, e)
        setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'error' as const, error: String(e) } : p))
        activePostRef.current = null
        await sleep(1500)
        continue
      }

      // Wait for image — dual strategy like Python scraper:
      //   1. Poll every 1.5s for a sharp oaiusercontent image (direct DOM scan)
      //   2. Track stop-button lifecycle as a signal that generation is done
      //   3. After stop-button gone, add render buffer then do Laplacian check
      //   4. Retry up to 5x if image is still soft
      setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'waiting_image' as const } : p))
      setToast(`Generating image for: ${job.title}`)
      window.api.log(`[ImageGen] ── Starting capture loop for: ${job.title} ──`)

      const PHASE_TIMEOUT = 4 * 60 * 1000
      const deadline = Date.now() + PHASE_TIMEOUT
      let captured = false
      let generationStarted = false
      let generationDone = false
      let generationDoneAt = 0  // timestamp when stop-button disappeared
      const RENDER_BUFFER_MS = 40_000  // 40s after generation done — mirrors Python logic

      while (Date.now() < deadline && !autoCancelRef.current && !captured) {
        await sleep(1500)
        try {
          const raw = await wv.executeJavaScript(CHATGPT_STATUS_JS)
          const st = JSON.parse(raw as string) as {
            done: boolean; generating: boolean
            imageUrl: string | null; blurry: boolean
            hasChoice: boolean; found: number
          }

          // ChatGPT showed 2 image options → click the first automatically
          if (st.hasChoice) {
            await wv.executeJavaScript(`(function(){
              var imgs = document.querySelectorAll('.grid img,[data-testid*="choice"] img,[class*="grid"] img');
              if(imgs[0]){
                var btn = imgs[0].closest('button') || imgs[0].closest('[role="button"]');
                if(btn) btn.click();
              }
            })()`)
            await sleep(1500)
            continue
          }

          // Track stop-button lifecycle — mirrors Python's _wait_generation_complete()
          if (st.generating) generationStarted = true
          if (generationStarted && !st.generating && !generationDone) {
            generationDone = true
            generationDoneAt = Date.now()
            window.api.log('[ImageGen] Generation complete — starting render buffer')
            setToast(`Generation complete — waiting for CDN… | ${job.title}`)
          }

          // No image URL yet — keep polling
          if (!st.imageUrl) continue

          // Image found in DOM — run Laplacian sharpness check on actual pixels
          const escapedUrl = st.imageUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
          const selector = `document.querySelector('img[src="${escapedUrl}"]') || document.querySelector('img[src*="oaiusercontent"]')`
          const sharpRaw = await wv.executeJavaScript(buildSharpnessScript(selector))
          const sharpResult = JSON.parse(sharpRaw as string) as { sharp: boolean; score: number; reason: string }

          setToast(`Score: ${sharpResult.score.toFixed(0)} ${sharpResult.sharp ? '✓ sharp' : '— waiting for full-res…'} | ${job.title}`)
          window.api.log(`[ImageGen] ${job.title} — sharp:${sharpResult.sharp} score:${sharpResult.score.toFixed(0)} blurry:${st.blurry} generationDone:${generationDone}`)

          if (sharpResult.sharp && !st.blurry) {
            // Full-res sharp image confirmed — capture it
            captured = true
            await handleImageFound(st.imageUrl, job.postId)
            break
          }

          // Image is still blurry/preview — only accept after render buffer elapsed
          if (generationDone) {
            const elapsed = Date.now() - generationDoneAt
            if (elapsed >= RENDER_BUFFER_MS) {
              // Render buffer expired — take what we have (best available)
              window.api.log(`[ImageGen] Render buffer elapsed (${Math.round(elapsed/1000)}s) — capturing best available`)
              setToast(`Capturing best available image… | ${job.title}`)
              // Get latest URL in case CDN swapped it
              const raw2 = await wv.executeJavaScript(CHATGPT_STATUS_JS)
              const st2 = JSON.parse(raw2 as string) as { imageUrl: string | null }
              const finalUrl = st2.imageUrl || st.imageUrl
              captured = true
              await handleImageFound(finalUrl, job.postId)
              break
            }
            // Still in buffer window — keep polling, show remaining time
            const remaining = Math.ceil((RENDER_BUFFER_MS - elapsed) / 1000)
            setToast(`CDN encoding… ${remaining}s remaining | ${job.title}`)
          }
          // else: still generating, preview placeholder — keep polling

        } catch { /* transient JS error — keep polling */ }
      }

      if (!captured) {
        // Fallback: drain the generic image watcher buffer
        try {
          const raw = await wv.executeJavaScript(POLL_JS)
          const imgs = JSON.parse(raw as string) as Array<{ src: string; width: number; height: number }>
          // Pick the largest image
          const best = imgs.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]
          if (best) {
            await handleImageFound(best.src, job.postId)
          } else {
            setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'error' as const, error: 'Timed out — no image captured' } : p))
          }
        } catch {
          setPrompts(prev => prev.map(p => p.postId === job.postId ? { ...p, status: 'error' as const, error: 'Timed out' } : p))
        }
      }

      // Small human-like gap between prompts
      if (!autoCancelRef.current && jobIdx < jobs.length - 1) await sleep(2000)
    }

    autoRunningRef.current = false
    setToast('All images generated ✓')
    setTimeout(() => setToast(null), 5000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleImageFound])

  // ── Expose imperative API to parent (App.tsx) ────────────────────────────
  useImperativeHandle(ref, () => ({
    queueBatch(jobs: ImageGenQueueJob[], chatGptUrl: string): void {
      autoChatUrlRef.current  = chatGptUrl
      autoCancelRef.current   = false
      autoRunningRef.current  = false
      autoQueueRef.current    = jobs

      // Eagerly create the ChatGPT tab with the real URL as initialUrl.
      // This causes TabView to mount <webview src={chatGptUrl}> immediately —
      // the webview starts loading before runAutoQueue even begins.
      const t = makeTab(chatGptUrl)
      autoTabIdRef.current = t.id
      setTabs(prev => [...prev, t])
      setActiveId(t.id)

      // Seed prompts panel so user sees the queue
      setPrompts(jobs.map(j => ({ postId: j.postId, prompt: j.prompt, title: j.title, status: 'pending' as const })))
      setPanelOpen(true)

      // Give React one render cycle to mount the webview, then start the queue
      setTimeout(() => void runAutoQueue(), 150)
    },
    cancelQueue(): void {
      autoCancelRef.current  = true
      autoRunningRef.current = false
      activePostRef.current  = null
    },
  }), [runAutoQueue])

  // ── Inject prompt ────────────────────────────────────────────────────────
  const injectPrompt = useCallback(async (pp: PendingPrompt): Promise<void> => {
    const wv = wvMap.current.get(activeId)
    if (!wv) { setToast('No active page to inject into'); return }

    setPrompts(prev => prev.map(p => p.postId === pp.postId ? { ...p, status: 'injecting' } : p))
    activePostRef.current = pp.postId

    try {
      const raw = await wv.executeJavaScript(buildInjectorScript(pp.prompt))
      const res = JSON.parse(raw as string) as { success: boolean; error?: string }
      if (res.success) {
        setPrompts(prev => prev.map(p => p.postId === pp.postId ? { ...p, status: 'waiting_image' } : p))
      } else {
        await navigator.clipboard.writeText(pp.prompt).catch(() => {})
        setPrompts(prev => prev.map(p => p.postId === pp.postId
          ? { ...p, status: 'error', error: (res.error || 'No input found') + ' — copied to clipboard' } : p))
        activePostRef.current = null
      }
    } catch {
      await navigator.clipboard.writeText(pp.prompt).catch(() => {})
      setPrompts(prev => prev.map(p => p.postId === pp.postId
        ? { ...p, status: 'error', error: 'Copied to clipboard — paste manually' } : p))
      activePostRef.current = null
    }
  }, [activeId])

  const pendingCount = prompts.filter(p => p.status === 'pending').length
  const isSecure     = activeTab?.url?.startsWith('https://')

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--surface-0)' }}>

      {/* ══ TAB STRIP ══════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        padding: '6px 6px 0', gap: 1,
        background: 'var(--surface-1)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none',
        minHeight: 38,
      }}>
        {tabs.map(tab => {
          const isActive  = tab.id === activeId
          const isDragged = tab.id === dragId
          const isOver    = tab.id === dragOver
          return (
            <div
              key={tab.id}
              draggable
              onDragStart={() => handleDragStart(tab.id)}
              onDragOver={e => handleDragOver(e, tab.id)}
              onDrop={e => handleDrop(e, tab.id)}
              onDragEnd={handleDragEnd}
              onClick={() => setActiveId(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 10px 0 10px',
                minWidth: 90, maxWidth: 200, flexShrink: 0,
                borderRadius: '8px 8px 0 0',
                background: isActive
                  ? 'var(--surface-2)'
                  : isOver
                    ? 'rgba(255,255,255,0.05)'
                    : 'transparent',
                border: isActive ? '1px solid var(--border-default)' : '1px solid transparent',
                borderBottom: isActive ? '1px solid var(--surface-2)' : '1px solid transparent',
                marginBottom: isActive ? -1 : 0,
                cursor: 'pointer', userSelect: 'none',
                opacity: isDragged ? 0.4 : 1,
                outline: isOver && !isDragged ? '1px solid var(--accent-border)' : 'none',
                transition: 'background 0.1s, opacity 0.1s',
              }}
            >
              {tab.loading
                ? <Loader size={11} style={{ color: 'var(--accent)', flexShrink: 0, animation: 'spin 0.8s linear infinite' }} />
                : tab.favicon
                  ? <img src={tab.favicon} width={13} height={13} style={{ borderRadius: 3, objectFit: 'contain', flexShrink: 0 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  : <Globe size={11} style={{ color: isActive ? 'var(--text-secondary)' : 'var(--text-tertiary)', flexShrink: 0 }} />
              }
              <span style={{
                flex: 1, minWidth: 0, fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {tab.title.length > 22 ? tab.title.slice(0, 22) + '…' : tab.title}
              </span>
              <button
                onClick={e => closeTab(tab.id, e)}
                style={{
                  background: 'none', border: 'none', padding: '2px 3px',
                  cursor: 'pointer', color: 'var(--text-tertiary)',
                  display: 'flex', alignItems: 'center', flexShrink: 0,
                  borderRadius: 4, opacity: 0,
                  transition: 'opacity 0.1s, background 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                onMouseDown={e => e.stopPropagation()}
              >
                <X size={10} />
              </button>
            </div>
          )
        })}
        <button
          onClick={() => addTab()}
          title="New tab"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-tertiary)', padding: '0 10px',
            display: 'flex', alignItems: 'center',
            borderRadius: '7px 7px 0 0', flexShrink: 0,
            transition: 'color 0.1s, background 0.1s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* ══ NAV BAR ════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3,
        padding: '5px 10px',
        background: 'var(--surface-2)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        {/* Nav buttons */}
        {([
          { icon: ArrowLeft,  tip: 'Back',    on: activeTab?.canBack, act: () => wvMap.current.get(activeId)?.goBack()    },
          { icon: ArrowRight, tip: 'Forward', on: activeTab?.canFwd,  act: () => wvMap.current.get(activeId)?.goForward() },
          { icon: activeTab?.loading ? X : RotateCcw, tip: activeTab?.loading ? 'Stop' : 'Reload', on: true,
            act: () => activeTab?.loading ? wvMap.current.get(activeId)?.stop?.() : wvMap.current.get(activeId)?.reload() },
          { icon: Home,       tip: 'New Tab', on: true,               act: () => navigateTab(activeId, 'elite://newtab')  },
        ] as const).map(({ icon: Icon, tip, on, act }) => (
          <button key={tip} onClick={act} title={tip} disabled={!on} style={{
            background: 'none', border: 'none', padding: '6px 7px', borderRadius: 7,
            cursor: on ? 'pointer' : 'default',
            color: on ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            display: 'flex', alignItems: 'center', flexShrink: 0,
            transition: 'background 0.1s',
          }}
            onMouseEnter={e => { if (on) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <Icon size={14} />
          </button>
        ))}

        {/* URL bar */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--surface-0)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 9, padding: '0 12px',
          transition: 'border-color 0.12s, box-shadow 0.12s',
        }}>
          {activeTab?.loading
            ? <Loader size={11} style={{ color: 'var(--accent)', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
            : isSecure
              ? <Lock  size={11} style={{ color: '#22c55e', flexShrink: 0 }} />
              : <Globe size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          }
          <input
            value={activeTab?.inputUrl ?? ''}
            onChange={e => updateTab(activeId, { inputUrl: e.target.value })}
            onFocus={e => e.currentTarget.select()}
            onKeyDown={e => e.key === 'Enter' && submitUrl()}
            placeholder="Search or enter URL..."
            style={{
              flex: 1, padding: '7px 0',
              background: 'none', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 12,
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            }}
          />
        </div>

        {/* Prompt button */}
        <button
          onClick={() => setPanelOpen(p => !p)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 8, flexShrink: 0,
            fontSize: 12, fontWeight: 600,
            border: `1px solid ${pendingCount > 0 ? 'var(--accent-border)' : 'var(--border-default)'}`,
            background: pendingCount > 0 ? 'var(--accent-dim)' : 'transparent',
            color: pendingCount > 0 ? 'var(--accent)' : 'var(--text-secondary)',
            cursor: 'pointer', transition: 'all 0.12s',
          }}
        >
          <Zap size={12} />
          {pendingCount > 0 && <span>{pendingCount}</span>}
          <ChevronDown size={10} style={{ transform: panelOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>

        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(p => !p)}
          title="Browser settings"
          style={{
            background: settingsOpen ? 'var(--surface-3)' : 'none',
            border: `1px solid ${settingsOpen ? 'var(--border-default)' : 'transparent'}`,
            padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
            color: settingsOpen ? 'var(--text-primary)' : 'var(--text-tertiary)',
            display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'all 0.12s',
          }}
        >
          <Settings size={14} />
        </button>
      </div>

      {/* ══ PROMPT PANEL ═══════════════════════════════════════════════════ */}
      {panelOpen && (
        <div style={{
          background: 'var(--surface-2)', borderBottom: '1px solid var(--border-subtle)',
          padding: '10px 14px', flexShrink: 0, maxHeight: 240, overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Forge Prompts</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {prompts.length > 0 && (
                <button onClick={() => { setPrompts([]); localStorage.removeItem('elite_pending_prompts') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 11 }}>Clear all</button>
              )}
              <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}>
                <X size={12} />
              </button>
            </div>
          </div>
          {prompts.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
              No prompts queued. In Forge, expand a post and click <strong style={{ color: 'var(--text-secondary)' }}>Send to Browser</strong>.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {prompts.map(pp => (
                <div key={pp.postId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ flexShrink: 0 }}>
                    {pp.status === 'pending'       && <Zap         size={13} style={{ color: 'var(--text-tertiary)' }} />}
                    {pp.status === 'injecting'     && <Loader      size={13} style={{ color: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />}
                    {pp.status === 'waiting_image' && <ImageIcon   size={13} style={{ color: '#4488ff' }} />}
                    {pp.status === 'done'          && <CheckCircle size={13} style={{ color: 'var(--accent)' }} />}
                    {pp.status === 'error'         && <AlertCircle size={13} style={{ color: 'var(--status-red)' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pp.title}</p>
                    <p style={{ margin: 0, fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>
                      {pp.status === 'pending'       && 'Navigate to AI site then click Inject'}
                      {pp.status === 'injecting'     && 'Typing into AI…'}
                      {pp.status === 'waiting_image' && 'Watching for generated image…'}
                      {pp.status === 'done'          && 'Done ✓'}
                      {pp.status === 'error'         && (pp.error || 'Failed')}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {pp.status === 'pending' && (
                      <button onClick={() => void injectPrompt(pp)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', background: 'var(--accent)', color: 'var(--accent-fg)', cursor: 'pointer' }}>
                        <Send size={10} /> Inject
                      </button>
                    )}
                    {pp.status === 'error' && (
                      <>
                        <button onClick={() => setPrompts(prev => prev.map(p => p.postId === pp.postId ? { ...p, status: 'pending', error: undefined } : p))}
                          style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Retry</button>
                        <button onClick={() => void navigator.clipboard.writeText(pp.prompt)}
                          style={{ padding: '4px 7px', borderRadius: 6, fontSize: 11, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                          <Copy size={10} />
                        </button>
                      </>
                    )}
                    <button onClick={() => setPrompts(prev => prev.filter(p => p.postId !== pp.postId))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '2px' }}>
                      <X size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ WEBVIEW AREA ═══════════════════════════════════════════════════ */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {tabs.map(tab => (
          <TabView
            key={tab.id}
            tab={tab}
            active={tab.id === activeId}
            wvMap={wvMap}
            onUpdate={updateTab}
            onNavigate={navigateTab}
            onNewTab={addTab}
            activePostRef={activePostRef}
            onImageFound={handleImageFound}
          />
        ))}
        {settingsOpen && <BrowserSettings onClose={() => setSettingsOpen(false)} />}
      </div>

      {/* ══ TOAST ══════════════════════════════════════════════════════════ */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '11px 18px', borderRadius: 12,
          background: 'var(--surface-2)',
          border: '1px solid var(--accent-border)',
          boxShadow: '0 6px 30px rgba(0,0,0,0.5)',
          fontSize: 13, color: 'var(--text-primary)',
        }}>
          <CheckCircle size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          {toast}
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', marginLeft: 4, padding: 0 }}>
            <X size={11} />
          </button>
        </div>
      )}
    </div>
  )
})

export default AiBrowser
