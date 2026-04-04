import { useEffect, useRef, useState } from 'react'

interface ForgeTimerProps {
  streamActive: boolean
}

export default function ForgeTimer({ streamActive }: ForgeTimerProps): React.ReactElement | null {
  const [elapsedMs,  setElapsedMs]  = useState(0)
  const [completed,  setCompleted]  = useState(false)
  const [visible,    setVisible]    = useState(false)
  const startTimeRef  = useRef<number | null>(null)
  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const fadeTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (streamActive) {
      // Rising edge — cancel any in-flight fade/reset, start fresh
      if (fadeTimerRef.current)  { clearTimeout(fadeTimerRef.current);  fadeTimerRef.current  = null }
      if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null }

      startTimeRef.current = Date.now()
      setElapsedMs(0)
      setCompleted(false)
      setVisible(true)

      intervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - (startTimeRef.current ?? Date.now()))
      }, 100)
    } else {
      // Falling edge — freeze and show completion
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      if (startTimeRef.current !== null) {
        setCompleted(true)
        // Fade out after 8s, then reset internal state after the 1s opacity transition
        fadeTimerRef.current = setTimeout(() => {
          setVisible(false)
          resetTimerRef.current = setTimeout(() => {
            setElapsedMs(0)
            setCompleted(false)
            startTimeRef.current = null
            resetTimerRef.current = null
          }, 1000)
          fadeTimerRef.current = null
        }, 8000)
      }
    }
    return () => {
      if (intervalRef.current)   clearInterval(intervalRef.current)
      if (fadeTimerRef.current)  { clearTimeout(fadeTimerRef.current);  fadeTimerRef.current  = null }
      if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null }
    }
  }, [streamActive])

  // Cleanup on unmount
  useEffect(() => () => {
    if (intervalRef.current)   clearInterval(intervalRef.current)
    if (fadeTimerRef.current)  clearTimeout(fadeTimerRef.current)
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
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

  const ringColor  = completed ? 'var(--green)' : 'var(--accent)'
  const label      = completed ? 'completed' : 'generating...'
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
