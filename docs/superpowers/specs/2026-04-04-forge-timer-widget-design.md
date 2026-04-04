# Forge Timer Widget — Design Spec
_Date: 2026-04-04_

## Overview
A floating circular timer widget on the Forge page that shows elapsed generation time while the API is streaming, then shows "Completed in Xs" when done. Fades out automatically after 8 seconds post-completion.

## Component

**File:** `src/components/ForgeTimer.tsx`

### Props
```ts
interface ForgeTimerProps {
  streamActive: boolean
}
```

### Behaviour
- Renders only when `streamActive === true` OR `elapsedMs > 0` (persists to show completion)
- On `streamActive` rising edge: record `startTime = Date.now()`, start `setInterval(100ms)` to update `elapsedMs`
- On `streamActive` falling edge: clear interval, freeze final time, enter "completed" state
- 8 seconds after completion: opacity transitions to 0, then component unmounts (via a `setTimeout` that resets `elapsedMs` to 0)

### Visual
- **Position:** `position: fixed`, `right: 24px`, `top: 50%`, `transform: translateY(-50%)`
- **Container:** 120×120px, circular, `background: var(--bg2)`, `border: 1px solid var(--border)`, `borderRadius: 50%`, subtle `box-shadow`
- **SVG ring:** single `<circle>` stroke using `stroke: var(--accent)` while streaming; shifts to `stroke: var(--green)` on completion. Ring has a slow CSS `spin` animation (`strokeDashoffset`) while streaming; stops on completion.
- **Time display:** centre of circle, `M:SS` format (e.g. `0:23`, `1:04`), `font-size: 22px`, `font-weight: 700`, `color: var(--text)`
- **State label:** small text below time — `"generating..."` while streaming (colour `var(--text3)`), `"completed"` on done (colour `var(--green)`)
- **Fade-out:** `opacity` CSS transition (1s ease) triggered 8s after completion

## Integration

**File:** `src/pages/Forge.tsx`

- Import `ForgeTimer` and render it just before `</PageShell>` closing tag
- Pass `streamActive` prop — already tracked in Forge state
- No other Forge state changes required

## Non-goals
- No adjustment buttons (-0:30 / +0:30)
- No per-post breakdown timer
- No persistence across sessions
