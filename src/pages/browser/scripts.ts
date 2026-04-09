/**
 * JavaScript snippets injected into AI site webviews.
 * Each is a self-contained IIFE string.
 */

export function buildInjectorScript(prompt: string): string {
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
      try{ el.ownerDocument.execCommand('selectAll', false, null); }catch(e){}
      await sleep(40);
      try{ el.ownerDocument.execCommand('delete', false, null); }catch(e){}
      await sleep(60);
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
      if(c==='.'||c===','||c===':'||c===';') delay += 80 + Math.random()*120;
      else if(i>0 && i%20===0) delay += 180 + Math.random()*250;

      if(ce){
        try{
          var inserted = el.ownerDocument.execCommand('insertText', false, c);
          if(!inserted) throw new Error('execCommand returned false');
        }catch(ex){
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

export const IMAGE_WATCHER_JS = `(function(){if(window.__ew)return;window.__ew=!0;window.__ei=[];const seen=new Set(),M=200;function ok(img){if(!img.src||seen.has(img.src))return!1;if(img.src.startsWith('data:')&&img.src.length<1000)return!1;if(img.src.includes('.svg'))return!1;const l=img.src.toLowerCase();if(l.includes('avatar')||l.includes('logo')||l.includes('icon')||l.includes('badge')||l.includes('favicon'))return!1;return(img.naturalWidth||img.width||0)>=M&&(img.naturalHeight||img.height||0)>=M}function cap(img){if(!ok(img))return;seen.add(img.src);window.__ei.push({src:img.src,width:img.naturalWidth||img.width,height:img.naturalHeight||img.height})}new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes){if(n.nodeName==='IMG')n.complete?cap(n):n.addEventListener('load',()=>cap(n),{once:!0});if(n.querySelectorAll)n.querySelectorAll('img').forEach(i=>i.complete?cap(i):i.addEventListener('load',()=>cap(i),{once:!0}))}}).observe(document.body,{childList:!0,subtree:!0})})()` as const

export const POLL_JS = `(function(){const i=window.__ei||[];window.__ei=[];return JSON.stringify(i)})()` as const

// Run this BEFORE submitting each new prompt.
// Snapshots current oaiusercontent image URLs into window.__eliteSeenUrls
// so the status script can exclude them and only return NEW images.
export const SNAPSHOT_EXISTING_IMAGES_JS = `(function(){
  var imgs = Array.from(document.querySelectorAll('img'))
    .filter(function(img){
      if(!img.src||!img.src.includes('oaiusercontent')) return false
      var w=img.naturalWidth||img.width, h=img.naturalHeight||img.height
      return w>=300 && h>=300
    })
  window.__eliteSeenUrls = new Set(imgs.map(function(img){ return img.src }))
  return JSON.stringify({snapshotCount: window.__eliteSeenUrls.size})
})()` as const

// ChatGPT-specific quality check script
// Returns: { done, imageUrl, blurry, hasChoice, generating, found, debugUrls }
// Only considers images that were NOT present when SNAPSHOT_EXISTING_IMAGES_JS ran.
export const CHATGPT_STATUS_JS = `(function(){
  const stopBtn = document.querySelector('button[aria-label="Stop generating"],button[data-testid="stop-button"],button[aria-label="Stop streaming"]')
  const sendBtn = (
    document.querySelector('button[data-testid="send-button"]') ||
    document.querySelector('button[aria-label="Send prompt"]') ||
    document.querySelector('button[aria-label="Send message"]') ||
    document.querySelector('button[aria-label*="send" i]:not([disabled])') ||
    Array.from(document.querySelectorAll('form button[type="button"]')).find(b => !b.disabled)
  )
  const isGenerating = !!stopBtn
  const isIdle = !isGenerating && !!sendBtn

  const modal = document.querySelector('[data-testid="modal-personality-onboarding"]')
  if(modal){
    try{
      const closeBtn = modal.querySelector('button[aria-label="Close"],button[data-testid="close-button"]')
      if(closeBtn){ closeBtn.click() }
      else { modal.remove() }
    }catch(e){}
  }

  // Exclude images that existed before this job's prompt was submitted
  const seenUrls = window.__eliteSeenUrls || new Set()

  const allImgs = Array.from(document.querySelectorAll('img'))
  const oaiImgs = allImgs
    .filter(img => img.src && img.src.includes('oaiusercontent') && !seenUrls.has(img.src))
    .filter(img => {
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      return w >= 600 && h >= 600
    })

  const estuaryImgs = allImgs
    .filter(img => {
      if (!img.src || !img.src.includes('estuary') || seenUrls.has(img.src)) return false
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      return w >= 600 && h >= 600
    })

  const choiceImgs = Array.from(document.querySelectorAll('.grid img,[data-testid*="choice"] img,[class*="grid"] img'))
    .filter(img => img.src && img.src.includes('oaiusercontent') && !seenUrls.has(img.src) && (img.naturalWidth||img.width) >= 256)
  const hasChoice = choiceImgs.length >= 2

  const mainCandidates = hasChoice ? choiceImgs : oaiImgs
  const allCandidates = mainCandidates.length > 0 ? mainCandidates : estuaryImgs
  const best = allCandidates.sort((a,b) => {
    const wa = a.naturalWidth||a.width, ha = a.naturalHeight||a.height
    const wb = b.naturalWidth||b.width, hb = b.naturalHeight||b.height
    return (wb*hb) - (wa*ha)
  })[0]

  let blurry = true
  let imageUrl = null
  if(best){
    const w = best.naturalWidth||best.width
    const h = best.naturalHeight||best.height
    const minDim = Math.min(w, h)
    blurry = minDim < 800
    imageUrl = best.src || null
  }

  const debugUrls = allCandidates.map(i => i.src)

  return JSON.stringify({ done: isIdle, generating: isGenerating, imageUrl, blurry, hasChoice, found: allCandidates.length, debugUrls })
})()` as const

export function buildMouseMoveScript(targetSel: string): string {
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
