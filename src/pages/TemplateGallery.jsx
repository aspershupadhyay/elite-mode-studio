/**
 * TemplateGallery.jsx — Premium Template Browser
 * Figma/Canva-quality card grid with live refresh on save
 */
import { useState, useEffect, useCallback } from 'react'
import { getTemplates, deleteTemplate } from '../studio/data/templateStorage.js'

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function getRatio(w, h) {
  const gcd = (a, b) => b ? gcd(b, a % b) : a
  const g = gcd(w, h)
  return `${w/g}:${h/g}`
}

function getPlatformLabel(w, h) {
  if (w === 1080 && h === 1350) return 'IG Feed'
  if (w === 1080 && h === 1080) return 'IG Square'
  if (w === 1080 && h === 1920) return 'IG Story'
  if (w === 1280 && h === 720)  return 'YT Thumb'
  if (w === 1200 && h === 675)  return 'X Post'
  if (w === 1200 && h === 627)  return 'LinkedIn'
  return `${w}×${h}`
}

// ── SVG thumbnail designs ─────────────────────────────────────────────────────

// EM Classic — dark editorial
function ThumbEMClassic() {
  return (
    <svg viewBox="0 0 270 338" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%',display:'block'}}>
      <defs>
        <linearGradient id="g0" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1A1A1A"/><stop offset="100%" stopColor="#0D0D0D"/>
        </linearGradient>
        <linearGradient id="f0" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#111" stopOpacity="0"/><stop offset="100%" stopColor="#111" stopOpacity="1"/>
        </linearGradient>
      </defs>
      <rect width="270" height="338" fill="#111"/>
      <rect width="270" height="186" fill="url(#g0)"/>
      {Array.from({length:9},(_,i)=><line key={i} x1={i*30} y1="0" x2={i*30} y2="186" stroke="#fff" strokeOpacity="0.03" strokeWidth="1"/>)}
      <rect y="150" width="270" height="36" fill="url(#f0)"/>
      <circle cx="135" cy="186" r="22" fill="none" stroke="#0BDA76" strokeWidth="2.5"/>
      <circle cx="135" cy="186" r="18" fill="#111" stroke="#0BDA76" strokeOpacity="0.3" strokeWidth="1"/>
      <text x="135" y="191" textAnchor="middle" fill="#0BDA76" fontFamily="Inter,sans-serif" fontSize="11" fontWeight="700" letterSpacing="1">EM</text>
      <rect x="20" y="218" width="180" height="10" rx="2" fill="#2A2A2A"/>
      <rect x="20" y="218" width="110" height="10" rx="2" fill="#3A3A3A"/>
      <rect x="20" y="234" width="140" height="10" rx="2" fill="#2A2A2A"/>
      <rect x="20" y="258" width="120" height="7" rx="1.5" fill="#222"/>
      <rect x="20" y="270" width="90" height="7" rx="1.5" fill="#1E1E1E"/>
      <rect x="20" y="298" width="52" height="7" rx="1.5" fill="#0BDA7630"/>
      <rect x="0" y="332" width="270" height="6" fill="#0BDA76"/>
    </svg>
  )
}

// Minimal White — clean, bright, editorial
function ThumbMinimalWhite() {
  return (
    <svg viewBox="0 0 270 338" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%',display:'block'}}>
      <rect width="270" height="338" fill="#FAFAFA"/>
      <rect x="0" y="0" width="270" height="5" fill="#111"/>
      <rect x="20" y="28" width="60" height="7" rx="2" fill="#111" opacity="0.9"/>
      <rect x="20" y="50" width="200" height="16" rx="3" fill="#111"/>
      <rect x="20" y="72" width="160" height="16" rx="3" fill="#111"/>
      <rect x="20" y="104" width="230" height="120" rx="8" fill="#F0F0F0"/>
      <rect x="35" y="116" width="100" height="8" rx="2" fill="#CCC"/>
      <rect x="35" y="130" width="150" height="8" rx="2" fill="#DDD"/>
      <rect x="35" y="144" width="130" height="8" rx="2" fill="#DDD"/>
      <rect x="35" y="158" width="160" height="8" rx="2" fill="#CCC"/>
      <rect x="35" y="172" width="120" height="8" rx="2" fill="#DDD"/>
      <rect x="35" y="186" width="140" height="8" rx="2" fill="#E0E0E0"/>
      <rect x="20" y="242" width="170" height="8" rx="2" fill="#888"/>
      <rect x="20" y="256" width="130" height="8" rx="2" fill="#BBB"/>
      <rect x="20" y="285" width="50" height="22" rx="4" fill="#111"/>
      <rect x="78" y="285" width="50" height="22" rx="4" fill="#F0F0F0" stroke="#DDD"/>
      <rect x="20" y="320" width="100" height="5" rx="1" fill="#111" opacity="0.1"/>
    </svg>
  )
}

// Bold Gradient — vibrant, high-energy
function ThumbBoldGradient() {
  return (
    <svg viewBox="0 0 270 338" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%',display:'block'}}>
      <defs>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0F0522"/><stop offset="100%" stopColor="#1A0A3E"/>
        </linearGradient>
        <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7C3AED"/><stop offset="100%" stopColor="#EC4899"/>
        </linearGradient>
        <radialGradient id="glowGrad" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.3"/><stop offset="100%" stopColor="#0F0522" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width="270" height="338" fill="url(#bgGrad)"/>
      <rect width="270" height="338" fill="url(#glowGrad)"/>
      <rect x="0" y="0" width="4" height="338" fill="url(#accentGrad)"/>
      <rect x="20" y="30" width="50" height="50" rx="10" fill="url(#accentGrad)" opacity="0.15"/>
      <rect x="22" y="32" width="46" height="46" rx="8" fill="url(#accentGrad)" opacity="0.2"/>
      <rect x="20" y="100" width="230" height="14" rx="3" fill="#fff" opacity="0.9"/>
      <rect x="20" y="120" width="190" height="14" rx="3" fill="#fff" opacity="0.7"/>
      <rect x="20" y="155" width="230" height="1" fill="url(#accentGrad)" opacity="0.4"/>
      <rect x="20" y="170" width="220" height="7" rx="2" fill="#fff" opacity="0.25"/>
      <rect x="20" y="183" width="200" height="7" rx="2" fill="#fff" opacity="0.2"/>
      <rect x="20" y="196" width="180" height="7" rx="2" fill="#fff" opacity="0.15"/>
      <rect x="20" y="209" width="210" height="7" rx="2" fill="#fff" opacity="0.2"/>
      <rect x="20" y="255" width="80" height="28" rx="6" fill="url(#accentGrad)"/>
      <rect x="110" y="258" width="60" height="22" rx="5" fill="transparent" stroke="url(#accentGrad)" strokeWidth="1"/>
      <rect x="20" y="300" width="230" height="1" fill="#fff" opacity="0.1"/>
      <rect x="20" y="310" width="100" height="6" rx="1.5" fill="#fff" opacity="0.15"/>
    </svg>
  )
}

// Dark Minimal — ultra-clean, sans-serif
function ThumbDarkMinimal() {
  return (
    <svg viewBox="0 0 270 338" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%',display:'block'}}>
      <rect width="270" height="338" fill="#0A0A0A"/>
      <rect x="20" y="30" width="3" height="40" rx="1.5" fill="#fff" opacity="0.15"/>
      <rect x="32" y="30" width="130" height="12" rx="2" fill="#fff" opacity="0.85"/>
      <rect x="32" y="48" width="100" height="12" rx="2" fill="#fff" opacity="0.5"/>
      <rect x="20" y="95" width="230" height="130" rx="4" fill="#141414"/>
      <rect x="32" y="108" width="206" height="90" rx="3" fill="#1A1A1A"/>
      <rect x="42" y="118" width="120" height="8" rx="2" fill="#2A2A2A"/>
      <rect x="42" y="132" width="160" height="8" rx="2" fill="#222"/>
      <rect x="42" y="146" width="140" height="8" rx="2" fill="#222"/>
      <rect x="42" y="160" width="100" height="8" rx="2" fill="#2A2A2A"/>
      <rect x="20" y="248" width="160" height="10" rx="2" fill="#fff" opacity="0.5"/>
      <rect x="20" y="264" width="120" height="10" rx="2" fill="#fff" opacity="0.3"/>
      <rect x="20" y="295" width="44" height="20" rx="4" fill="#fff" opacity="0.08" stroke="#fff" strokeOpacity="0.12"/>
      <rect x="72" y="295" width="44" height="20" rx="4" fill="#fff" opacity="0.08" stroke="#fff" strokeOpacity="0.12"/>
      <rect x="0" y="330" width="270" height="8" fill="#fff" opacity="0.05"/>
    </svg>
  )
}

// Neon Dark — cyberpunk, high contrast
function ThumbNeonDark() {
  return (
    <svg viewBox="0 0 270 338" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%',display:'block'}}>
      <defs>
        <linearGradient id="neonBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#030712"/><stop offset="100%" stopColor="#050F1A"/>
        </linearGradient>
      </defs>
      <rect width="270" height="338" fill="url(#neonBg)"/>
      {/* Grid lines */}
      {Array.from({length:7},(_,i)=><line key={`v${i}`} x1={i*45} y1="0" x2={i*45} y2="338" stroke="#06B6D4" strokeOpacity="0.04" strokeWidth="1"/>)}
      {Array.from({length:8},(_,i)=><line key={`h${i}`} x1="0" y1={i*45} x2="270" y2={i*45} stroke="#06B6D4" strokeOpacity="0.04" strokeWidth="1"/>)}
      <rect x="20" y="28" width="8" height="8" fill="#06B6D4"/>
      <rect x="20" y="44" width="200" height="13" rx="2" fill="#E2F8FF" opacity="0.9"/>
      <rect x="20" y="63" width="150" height="13" rx="2" fill="#E2F8FF" opacity="0.6"/>
      <rect x="20" y="95" width="230" height="1" fill="#06B6D4" opacity="0.4"/>
      <rect x="20" y="112" width="80" height="22" rx="4" fill="#06B6D4" opacity="0.15" stroke="#06B6D4" strokeOpacity="0.4" strokeWidth="1"/>
      <rect x="110" y="112" width="60" height="22" rx="4" fill="#0D9488" opacity="0.15" stroke="#0D9488" strokeOpacity="0.4" strokeWidth="1"/>
      <rect x="20" y="152" width="230" height="7" rx="2" fill="#E2F8FF" opacity="0.15"/>
      <rect x="20" y="165" width="210" height="7" rx="2" fill="#E2F8FF" opacity="0.12"/>
      <rect x="20" y="178" width="190" height="7" rx="2" fill="#E2F8FF" opacity="0.1"/>
      <rect x="20" y="220" width="230" height="60" rx="6" fill="#06B6D4" opacity="0.06" stroke="#06B6D4" strokeOpacity="0.15" strokeWidth="1"/>
      <rect x="32" y="232" width="140" height="8" rx="2" fill="#06B6D4" opacity="0.3"/>
      <rect x="32" y="246" width="100" height="8" rx="2" fill="#06B6D4" opacity="0.2"/>
      <rect x="32" y="260" width="120" height="8" rx="2" fill="#06B6D4" opacity="0.15"/>
      <rect x="20" y="307" width="230" height="1" fill="#06B6D4" opacity="0.2"/>
      <rect x="20" y="316" width="80" height="6" rx="1" fill="#06B6D4" opacity="0.2"/>
    </svg>
  )
}

// Story Format — 9:16 vertical
function ThumbStory() {
  return (
    <svg viewBox="0 0 270 480" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%',display:'block'}}>
      <defs>
        <linearGradient id="storyBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0F172A"/><stop offset="60%" stopColor="#1E1B4B"/><stop offset="100%" stopColor="#0F172A"/>
        </linearGradient>
        <linearGradient id="storyAccent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#818CF8"/><stop offset="100%" stopColor="#C084FC"/>
        </linearGradient>
      </defs>
      <rect width="270" height="480" fill="url(#storyBg)"/>
      <circle cx="135" cy="160" r="80" fill="url(#storyAccent)" opacity="0.08"/>
      <circle cx="135" cy="160" r="55" fill="url(#storyAccent)" opacity="0.1"/>
      <rect x="30" y="280" width="210" height="18" rx="4" fill="#fff" opacity="0.85"/>
      <rect x="50" y="306" width="170" height="12" rx="3" fill="#fff" opacity="0.5"/>
      <rect x="50" y="330" width="150" height="12" rx="3" fill="#fff" opacity="0.35"/>
      <rect x="30" y="368" width="210" height="1" fill="#fff" opacity="0.1"/>
      <rect x="95" y="384" width="80" height="32" rx="16" fill="url(#storyAccent)"/>
      <rect x="30" y="440" width="210" height="6" rx="1.5" fill="#fff" opacity="0.07"/>
    </svg>
  )
}

// LinkedIn Banner — wide format
function ThumbLinkedIn() {
  return (
    <svg viewBox="0 0 270 142" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%',display:'block'}}>
      <defs>
        <linearGradient id="liBg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0F172A"/><stop offset="100%" stopColor="#1E293B"/>
        </linearGradient>
      </defs>
      <rect width="270" height="142" fill="url(#liBg)"/>
      <rect x="0" y="0" width="5" height="142" fill="#0A66C2"/>
      <rect x="20" y="25" width="160" height="14" rx="3" fill="#fff" opacity="0.9"/>
      <rect x="20" y="45" width="120" height="10" rx="2" fill="#fff" opacity="0.5"/>
      <rect x="20" y="72" width="200" height="7" rx="2" fill="#fff" opacity="0.2"/>
      <rect x="20" y="85" width="180" height="7" rx="2" fill="#fff" opacity="0.15"/>
      <rect x="20" y="108" width="60" height="22" rx="4" fill="#0A66C2"/>
      <rect x="200" y="20" width="50" height="50" rx="8" fill="#0A66C2" opacity="0.2"/>
    </svg>
  )
}

// Carousel Slide — multi-panel
function ThumbCarousel() {
  return (
    <svg viewBox="0 0 270 338" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%',display:'block'}}>
      <rect width="270" height="338" fill="#0C0C0C"/>
      {/* Slide nav dots */}
      <circle cx="95" cy="18" r="4" fill="#fff" opacity="0.6"/>
      <circle cx="107" cy="18" r="4" fill="#0BDA76"/>
      <circle cx="119" cy="18" r="4" fill="#fff" opacity="0.3"/>
      <circle cx="131" cy="18" r="4" fill="#fff" opacity="0.3"/>
      <circle cx="143" cy="18" r="4" fill="#fff" opacity="0.3"/>
      <circle cx="155" cy="18" r="4" fill="#fff" opacity="0.3"/>
      <circle cx="167" cy="18" r="4" fill="#fff" opacity="0.3"/>
      {/* Main slide */}
      <rect x="15" y="35" width="240" height="200" rx="10" fill="#141414"/>
      {/* Slide content */}
      <rect x="28" y="50" width="30" height="30" rx="6" fill="#0BDA76" opacity="0.15" stroke="#0BDA76" strokeOpacity="0.3" strokeWidth="1"/>
      <rect x="28" y="93" width="180" height="12" rx="3" fill="#fff" opacity="0.7"/>
      <rect x="28" y="111" width="140" height="12" rx="3" fill="#fff" opacity="0.45"/>
      <rect x="28" y="138" width="200" height="7" rx="2" fill="#fff" opacity="0.18"/>
      <rect x="28" y="151" width="180" height="7" rx="2" fill="#fff" opacity="0.14"/>
      <rect x="28" y="164" width="160" height="7" rx="2" fill="#fff" opacity="0.12"/>
      <rect x="28" y="195" width="60" height="22" rx="5" fill="#0BDA76"/>
      {/* Slide stack peek */}
      <rect x="20" y="240" width="230" height="42" rx="8" fill="#1A1A1A" opacity="0.8"/>
      <rect x="25" y="248" width="60" height="7" rx="2" fill="#fff" opacity="0.3"/>
      <rect x="25" y="261" width="40" height="7" rx="2" fill="#fff" opacity="0.2"/>
      <rect x="100" y="248" width="80" height="7" rx="2" fill="#fff" opacity="0.3"/>
      <rect x="100" y="261" width="60" height="7" rx="2" fill="#fff" opacity="0.2"/>
      <rect x="25" y="295" width="220" height="30" rx="6" fill="#222" opacity="0.6"/>
      <rect x="35" y="304" width="100" height="6" rx="1.5" fill="#fff" opacity="0.2"/>
      <rect x="35" y="314" width="70" height="6" rx="1.5" fill="#fff" opacity="0.15"/>
    </svg>
  )
}

// Default thumb fallback
function DefaultThumb() {
  return <ThumbEMClassic/>
}

// ── Built-in pre-designed template library ────────────────────────────────────
const BUILTIN_TEMPLATES = [
  {
    id: '__default_em_classic',
    name: 'EM Classic',
    canvasJSON: '__default__',
    width: 1080, height: 1350,
    thumbnail: null, createdAt: 0,
    ThumbComponent: ThumbEMClassic,
    badge: 'Built-in',
    style: 'Dark Editorial',
    platform: 'IG Feed',
  },
  {
    id: '__builtin_dark_minimal',
    name: 'Dark Minimal',
    canvasJSON: '__default__',
    width: 1080, height: 1350,
    thumbnail: null, createdAt: 0,
    ThumbComponent: ThumbDarkMinimal,
    badge: 'Built-in',
    style: 'Dark Editorial',
    platform: 'IG Feed',
  },
  {
    id: '__builtin_bold_gradient',
    name: 'Bold Gradient',
    canvasJSON: '__default__',
    width: 1080, height: 1350,
    thumbnail: null, createdAt: 0,
    ThumbComponent: ThumbBoldGradient,
    badge: 'Built-in',
    style: 'Gradient',
    platform: 'IG Feed',
  },
  {
    id: '__builtin_neon_dark',
    name: 'Neon Dark',
    canvasJSON: '__default__',
    width: 1080, height: 1350,
    thumbnail: null, createdAt: 0,
    ThumbComponent: ThumbNeonDark,
    badge: 'Built-in',
    style: 'Neon',
    platform: 'IG Feed',
  },
  {
    id: '__builtin_minimal_white',
    name: 'Minimal White',
    canvasJSON: '__default__',
    width: 1080, height: 1350,
    thumbnail: null, createdAt: 0,
    ThumbComponent: ThumbMinimalWhite,
    badge: 'Built-in',
    style: 'Light',
    platform: 'IG Feed',
  },
  {
    id: '__builtin_story',
    name: 'Story / Reel',
    canvasJSON: '__default__',
    width: 1080, height: 1920,
    thumbnail: null, createdAt: 0,
    ThumbComponent: ThumbStory,
    badge: 'Built-in',
    style: 'Story',
    platform: 'IG Story',
  },
  {
    id: '__builtin_carousel',
    name: 'Carousel Pack',
    canvasJSON: '__default__',
    width: 1080, height: 1350,
    thumbnail: null, createdAt: 0,
    ThumbComponent: ThumbCarousel,
    badge: 'Built-in',
    style: 'Carousel',
    platform: 'IG Feed',
  },
  {
    id: '__builtin_linkedin',
    name: 'LinkedIn Banner',
    canvasJSON: '__default__',
    width: 1200, height: 627,
    thumbnail: null, createdAt: 0,
    ThumbComponent: ThumbLinkedIn,
    badge: 'Built-in',
    style: 'LinkedIn',
    platform: 'LinkedIn',
  },
]

// ── "Add new" placeholder card ────────────────────────────────────────────────
function NewTemplateCard({ onGoToStudio }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onGoToStudio}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        cursor: 'pointer',
        borderRadius: 16,
        border: `1.5px dashed ${hov ? 'var(--green)' : '#2A2A2A'}`,
        background: hov ? 'var(--green-dim)' : 'transparent',
        transition: 'all .2s',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        aspectRatio: '4/5', gap: 12,
      }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: hov ? 'var(--green)' : '#1A1A1A',
        border: `1px solid ${hov ? 'var(--green)' : '#333'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .2s',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
             stroke={hov ? '#000' : 'var(--green)'} strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </div>
      <div style={{ textAlign: 'center', padding: '0 16px' }}>
        <p style={{ fontSize: 13, fontWeight: 600,
          color: hov ? 'var(--green)' : '#555', margin: 0, marginBottom: 4 }}>
          New Template
        </p>
        <p style={{ fontSize: 11, color: '#444', margin: 0, lineHeight: 1.5 }}>
          Open Design Studio to create and save templates
        </p>
      </div>
    </div>
  )
}

// ── Premium template card ─────────────────────────────────────────────────────
function TemplateCard({ tmpl, isBuiltin, onUse, onDelete }) {
  const [hov, setHov] = useState(false)
  const [delConfirm, setDelConfirm] = useState(false)
  const ratio    = getRatio(tmpl.width, tmpl.height)
  const platform = tmpl.platform || getPlatformLabel(tmpl.width, tmpl.height)
  const Thumb    = tmpl.ThumbComponent || DefaultThumb

  const confirmDelete = (e) => {
    e.stopPropagation()
    if (delConfirm) { onDelete(tmpl.id, tmpl.name) }
    else { setDelConfirm(true); setTimeout(() => setDelConfirm(false), 2500) }
  }

  // Aspect ratio for the thumb box — 4:5 for feed, 9:16 for story, 16:9 for banner
  const thumbAspect = tmpl.height > tmpl.width * 1.4 ? '9/16' :
                      tmpl.width  > tmpl.height * 1.4 ? '16/9' : '4/5'

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setDelConfirm(false) }}
      style={{
        borderRadius: 16, overflow: 'hidden',
        background: hov ? '#161616' : '#111111',
        border: `1px solid ${hov ? 'var(--green-border)' : '#1E1E1E'}`,
        boxShadow: hov ? '0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px var(--green-border)' : '0 2px 12px rgba(0,0,0,0.4)',
        transform: hov ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'all .22s cubic-bezier(.4,0,.2,1)',
        cursor: 'pointer',
        position: 'relative',
      }}
      onClick={() => onUse(tmpl)}>

      {/* ── Thumbnail area ── */}
      <div style={{ position: 'relative', aspectRatio: thumbAspect, overflow: 'hidden',
                    background: '#0A0A0A' }}>
        {tmpl.thumbnail ? (
          <img src={tmpl.thumbnail} alt={tmpl.name}
               style={{ width:'100%', height:'100%', objectFit:'contain',
                        display:'block', transition:'transform .3s',
                        transform: hov ? 'scale(1.04)' : 'scale(1)' }}/>
        ) : (
          <div style={{ width:'100%', height:'100%', transition:'transform .3s',
            transform: hov ? 'scale(1.04)' : 'scale(1)' }}>
            <Thumb/>
          </div>
        )}

        {/* Ratio badge — top left */}
        <div style={{
          position:'absolute', top:10, left:10,
          padding:'3px 8px', borderRadius:20,
          background:'rgba(0,0,0,0.75)', backdropFilter:'blur(8px)',
          border:'1px solid rgba(255,255,255,0.08)',
          fontSize:10, fontWeight:700, color:'#EAEAEA', fontFamily:'monospace',
          letterSpacing:'.04em', zIndex:2,
        }}>{ratio}</div>

        {/* Platform badge — top right */}
        <div style={{
          position:'absolute', top:10, right:10,
          padding:'3px 8px', borderRadius:20,
          background:'rgba(0,0,0,0.75)', backdropFilter:'blur(8px)',
          border:'1px solid rgba(255,255,255,0.08)',
          fontSize:10, fontWeight:500, color:'#888', zIndex:2,
        }}>{platform}</div>

        {/* Style badge */}
        {tmpl.style && (
          <div style={{
            position:'absolute', bottom:10, left:10,
            padding:'3px 9px', borderRadius:20,
            background: isBuiltin ? 'var(--green-dim)' : 'rgba(0,0,0,0.7)',
            border: `1px solid ${isBuiltin ? 'var(--green-border)' : 'rgba(255,255,255,0.12)'}`,
            fontSize:9, fontWeight:700,
            color: isBuiltin ? 'var(--green)' : '#888',
            letterSpacing:'.08em', textTransform:'uppercase', zIndex:2,
          }}>{tmpl.style}</div>
        )}

        {/* Hover overlay with actions */}
        <div style={{
          position:'absolute', inset:0,
          background:'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.15) 50%, transparent 100%)',
          opacity: hov ? 1 : 0, transition:'opacity .2s',
          display:'flex', flexDirection:'column',
          justifyContent:'flex-end', padding:14, gap:8, zIndex:3,
        }}>
          <button
            onClick={e=>{ e.stopPropagation(); onUse(tmpl) }}
            style={{
              padding:'9px 0', borderRadius:10, border:'none',
              background:'var(--green)', color:'#000',
              fontSize:12, fontWeight:700, cursor:'pointer',
              width:'100%', transition:'opacity .15s',
            }}
            onMouseEnter={e=>e.currentTarget.style.opacity='.85'}
            onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            Open in Studio
          </button>
          {!isBuiltin && (
            <button
              onClick={confirmDelete}
              style={{
                padding:'7px 0', borderRadius:10,
                border:`1px solid ${delConfirm ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.12)'}`,
                background: delConfirm ? 'rgba(239,68,68,0.15)' : 'rgba(0,0,0,0.4)',
                color: delConfirm ? '#EF4444' : '#888',
                fontSize:11, fontWeight:600, cursor:'pointer',
                width:'100%', transition:'all .15s',
              }}>
              {delConfirm ? 'Click again to confirm' : 'Delete'}
            </button>
          )}
        </div>
      </div>

      {/* ── Info strip ── */}
      <div style={{ padding:'12px 14px 14px', borderTop:'1px solid #1A1A1A' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
          <div style={{ width:6, height:6, borderRadius:'50%',
            background: hov ? 'var(--green)' : '#333', flexShrink:0,
            transition:'background .2s' }}/>
          <p style={{ fontSize:13, fontWeight:600, color:'#EAEAEA',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            margin:0, flex:1 }}>{tmpl.name}</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          paddingLeft:14 }}>
          <span style={{ fontSize:10, color:'#444', fontFamily:'monospace' }}>
            {tmpl.width}×{tmpl.height}
          </span>
          <span style={{ fontSize:10, color:'#444' }}>
            {isBuiltin ? 'System' : timeAgo(tmpl.createdAt)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TemplateGallery({ onLoadTemplate, refreshKey = 0 }) {
  const [templates, setTemplates] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    const saved = await getTemplates()
    setTemplates(saved)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const handleDelete = async (id) => {
    await deleteTemplate(id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const handleUse = (tmpl) => {
    onLoadTemplate?.({
      id:         tmpl.id,
      canvasJSON: tmpl.canvasJSON || '__default__',
      width:      tmpl.width  || 1080,
      height:     tmpl.height || 1350,
      name:       tmpl.name,
    })
  }

  const goToStudio = () => onLoadTemplate?.({
    id: '__default_em_classic', canvasJSON: '__default__',
    width: 1080, height: 1350, name: 'EM Classic',
  })

  const FILTER_OPTS = [
    { id:'all',       label:'All' },
    { id:'feed',      label:'IG Feed' },
    { id:'story',     label:'IG Story' },
    { id:'linkedin',  label:'LinkedIn' },
    { id:'saved',     label:'My Saves' },
  ]

  const filterFn = (t) => {
    if (filter === 'all')      return true
    if (filter === 'feed')     return t.width === 1080 && (t.height === 1350 || t.height === 1080)
    if (filter === 'story')    return t.height === 1920
    if (filter === 'linkedin') return t.width === 1200
    if (filter === 'saved')    return !t.id?.startsWith('__builtin') && t.id !== '__default_em_classic'
    return true
  }

  const builtinFiltered = BUILTIN_TEMPLATES.filter(filterFn)
  const savedFiltered   = templates.filter(filterFn)
  const totalCount      = BUILTIN_TEMPLATES.length + templates.length

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', overflow: 'hidden',
    }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ padding: '22px 28px 0', flexShrink: 0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
              <h1 style={{ fontSize:18, fontWeight:700, color:'var(--text)', margin:0 }}>
                Template Gallery
              </h1>
              <div style={{
                padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:600,
                background:'var(--green-dim)', border:'1px solid var(--green-border)',
                color:'var(--green)',
              }}>{totalCount}</div>
            </div>
            <p style={{ fontSize:12, color:'var(--text2)', margin:0 }}>
              {BUILTIN_TEMPLATES.length} built-in designs
              {templates.length > 0 ? ` · ${templates.length} saved` : ' · save your own from Design Studio'}
            </p>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
            {FILTER_OPTS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                padding:'5px 13px', borderRadius:20, border:'none', cursor:'pointer',
                fontSize:11, fontWeight:500, transition:'all .15s',
                background: filter===f.id ? 'var(--green)' : 'var(--bg3)',
                color:       filter===f.id ? '#000' : 'var(--text2)',
              }}>{f.label}</button>
            ))}
          </div>
        </div>
        <div style={{ height:1, background:'var(--border)', marginBottom:24 }}/>
      </div>

      {/* ── Grid ────────────────────────────────────────────────────── */}
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'0 28px 28px' }}>
        {loading ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', height:280, gap:12 }}>
            <div style={{ display:'flex', gap:6 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:8, height:8, borderRadius:'50%',
                  background:'var(--green)', animation:'pulse 1.2s infinite',
                  animationDelay:`${i*.2}s` }}/>
              ))}
            </div>
            <p style={{ fontSize:12, color:'var(--text3)', margin:0 }}>Loading templates…</p>
          </div>
        ) : (
          <>
            {/* Built-in section */}
            {builtinFiltered.length > 0 && (
              <>
                {filter === 'all' && (
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                    <p style={{ fontSize:11, fontWeight:700, color:'var(--text3)',
                      textTransform:'uppercase', letterSpacing:'.08em', margin:0 }}>
                      Built-in Designs
                    </p>
                    <div style={{ flex:1, height:1, background:'var(--border)' }}/>
                    <span style={{ fontSize:10, color:'var(--text3)' }}>{builtinFiltered.length} templates</span>
                  </div>
                )}
                <div style={{
                  display:'grid',
                  gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',
                  gap:16, marginBottom: savedFiltered.length > 0 ? 32 : 0,
                }}>
                  {builtinFiltered.map(tmpl => (
                    <TemplateCard
                      key={tmpl.id}
                      tmpl={tmpl}
                      isBuiltin
                      onUse={handleUse}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Saved templates section */}
            {savedFiltered.length > 0 && (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <p style={{ fontSize:11, fontWeight:700, color:'var(--text3)',
                    textTransform:'uppercase', letterSpacing:'.08em', margin:0 }}>
                    My Saved Templates
                  </p>
                  <div style={{ flex:1, height:1, background:'var(--border)' }}/>
                  <span style={{ fontSize:10, color:'var(--text3)' }}>{savedFiltered.length} saved</span>
                </div>
                <div style={{
                  display:'grid',
                  gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',
                  gap:16,
                }}>
                  {savedFiltered.map(tmpl => (
                    <TemplateCard
                      key={tmpl.id}
                      tmpl={tmpl}
                      isBuiltin={false}
                      onUse={handleUse}
                      onDelete={handleDelete}
                    />
                  ))}
                  <NewTemplateCard onGoToStudio={goToStudio}/>
                </div>
              </>
            )}

            {/* Empty state for saved filter */}
            {filter === 'saved' && savedFiltered.length === 0 && (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
                justifyContent:'center', height:280, gap:12, textAlign:'center' }}>
                <p style={{ fontSize:14, color:'var(--text2)', margin:0 }}>No saved templates yet</p>
                <p style={{ fontSize:12, color:'var(--text3)', margin:0 }}>
                  Open a built-in design, customise it, and save it as your own
                </p>
                <NewTemplateCard onGoToStudio={goToStudio}/>
              </div>
            )}

            {/* "Add new" at bottom when showing all */}
            {filter === 'all' && savedFiltered.length === 0 && (
              <div style={{ marginTop:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <p style={{ fontSize:11, fontWeight:700, color:'var(--text3)',
                    textTransform:'uppercase', letterSpacing:'.08em', margin:0 }}>
                    My Saved Templates
                  </p>
                  <div style={{ flex:1, height:1, background:'var(--border)' }}/>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:16 }}>
                  <NewTemplateCard onGoToStudio={goToStudio}/>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
