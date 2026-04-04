# Forge Timer Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating circular elapsed-time widget to the Forge page that counts up while generation streams and shows "Completed in Xs" afterward.

**Architecture:** A single new `ForgeTimer` component uses a `useEffect`/`setInterval` to track elapsed ms from `streamActive` rising edge. It renders a fixed-position circular SVG ring with centered time display. Forge.tsx imports and renders it — no other files touched.

**Tech Stack:** React 18, TypeScript, inline styles (matching existing Forge patterns), SVG for the ring

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/ForgeTimer.tsx` | **Create** | Self-contained timer component — all state, animation, and rendering |
| `src/pages/Forge.tsx` | **Modify** | Import and render `<ForgeTimer streamActive={streamActive} />` |

---

### Task 1: Create `ForgeTimer` component

**Files:**
- Create: `src/components/ForgeTimer.tsx`

- [ ] **Step 1: Create the file with full implementation**

```tsx
import { useEffect, useRef, useState } from 'react'

interface ForgeTimerProps {
  streamActive: boolean
}

export default function ForgeTimer({ streamActive }: ForgeTimerProps): React.ReactElement | null {
  const [elapsedMs,  setElapsedMs]  = useState(0)
  const [completed,  setCompleted]  = useState(false)
  const [visible,    setVisible]    = useState(false)
  const startTimeRef = useRef<number | null>(null)
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (streamActive) {
      // Rising edge — start fresh
      startTimeRef.current = Date.now()
      setElapsedMs(0)
      setCompleted(false)
      setVisible(true)
      if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); fadeTimerRef.current = null }

      intervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - (startTimeRef.current ?? Date.now()))
      }, 100)
    } else {
      // Falling edge — freeze and show completion
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      if (startTimeRef.current !== null) {
        setCompleted(true)
        // Fade out after 8s
        fadeTimerRef.current = setTimeout(() => {
          setVisible(false)
          setTimeout(() => {
            setElapsedMs(0)
            setCompleted(false)
            startTimeRef.current = null
          }, 1000) // wait for opacity transition
        }, 8000)
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [streamActive])

  // Cleanup on unmount
  useEffect(() => () => {
    if (intervalRef.current)  clearInterval(intervalRef.current)
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
  }, [])

  if (!visible && elapsedMs === 0) return null

  const totalSec = Math.floor(elapsedMs / 1000)
  const mins     = Math.floor(totalSec / 60)
  const secs     = totalSec % 60
  const timeStr  = `${mins}:${String(secs).padStart(2, '0')}`

  // SVG ring
  const SIZE   = 120
  const STROKE = 6
  const R      = (SIZE - STROKE) / 2
  const CIRC   = 2 * Math.PI * R

  const ringColor = completed ? 'var(--green)' : 'var(--accent)'
  const label     = completed ? 'completed' : 'generating...'
  const labelColor = completed ? 'var(--green)' : 'var(--text3)'

  return (
    <div style={{
      position: 'fixed',
      right: 24,
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 100,
      opacity: visible ? 1 : 0,
      transition: 'opacity 1s ease',
      pointerEvents: 'none',
    }}>
      <div style={{
        width: SIZE,
        height: SIZE,
        borderRadius: '50%',
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        {/* SVG ring */}
        <svg
          width={SIZE} height={SIZE}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {/* Track */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none"
            stroke="var(--border)"
            strokeWidth={STROKE}
          />
          {/* Active arc */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={completed ? 0 : CIRC * 0.25}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={completed ? {} : {
              animation: 'forge-timer-spin 2s linear infinite',
            }}
          />
        </svg>

        {/* Time */}
        <span style={{
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--text)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
          zIndex: 1,
        }}>
          {timeStr}
        </span>

        {/* Label */}
        <span style={{
          fontSize: 9,
          color: labelColor,
          marginTop: 4,
          letterSpacing: '0.04em',
          zIndex: 1,
        }}>
          {label}
        </span>
      </div>

      {/* Keyframe injected once */}
      <style>{`
        @keyframes forge-timer-spin {
          from { stroke-dashoffset: ${CIRC * 0.25}; }
          to   { stroke-dashoffset: ${CIRC * 0.25 - CIRC}; }
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles (no errors expected)**

```bash
cd /Users/sparsh/Desktop/nvidia_rag_app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing unrelated errors)

- [ ] **Step 3: Commit**

```bash
git add src/components/ForgeTimer.tsx
git commit -m "feat: add ForgeTimer floating widget component"
```

---

### Task 2: Integrate ForgeTimer into Forge page

**Files:**
- Modify: `src/pages/Forge.tsx`

- [ ] **Step 1: Add the import at the top of Forge.tsx**

Find the existing imports block (around line 12-26) and add:

```tsx
import ForgeTimer from '../components/ForgeTimer'
```

- [ ] **Step 2: Render the widget just before the closing `</PageShell>` tag**

Find this block near the end of Forge.tsx (around line 704-716):

```tsx
      {/* Edit modal */}
      {editingIndex !== null && streamPosts[editingIndex] && (
```

Insert `<ForgeTimer streamActive={streamActive} />` just before `</PageShell>`:

```tsx
      {/* Edit modal */}
      {editingIndex !== null && streamPosts[editingIndex] && (
        <PostEditorModal
          post={{ ...streamPosts[editingIndex], content: streamPosts[editingIndex].content as import('../components/PostEditorModal').EditableContent | undefined }}
          onSave={(updatedContent: import('../components/PostEditorModal').EditableContent) => {
            setStreamPosts(prev => prev.map(p =>
              p.index === editingIndex ? { ...p, content: updatedContent as Record<string, string> } : p
            ))
          }}
          onClose={() => setEditingIndex(null)}
        />
      )}

      <ForgeTimer streamActive={streamActive} />
    </PageShell>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/sparsh/Desktop/nvidia_rag_app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/Forge.tsx
git commit -m "feat: render ForgeTimer in Forge page"
```

---

## Self-Review

**Spec coverage:**
- ✅ Floating right-side panel — `position: fixed`, `right: 24px`, `top: 50%`
- ✅ Live timer while streaming — `setInterval(100ms)` on rising edge
- ✅ Circular SVG ring — `<circle>` with `stroke: var(--accent)` spinning during generation
- ✅ Ring stops + turns green on completion
- ✅ `M:SS` time format
- ✅ "generating..." / "completed" label
- ✅ Fades out 8s after completion
- ✅ No adjustment buttons

**Placeholder scan:** None found — all steps have full code.

**Type consistency:** `streamActive: boolean` used consistently in props and effect dependency. `elapsedMs`, `completed`, `visible` state names used uniformly throughout.
