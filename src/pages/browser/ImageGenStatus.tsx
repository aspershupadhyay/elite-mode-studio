/**
 * ImageGenStatus.tsx
 *
 * Floating status panel shown in Design Studio while images are being
 * generated via the ChatGPT browser pipeline.
 *
 * Shows one row per job with a status badge + progress indicator.
 * Disappears automatically when all jobs are done or cancelled.
 */

import type { JobProgressState } from '@/pages/browser/imageGenBridge'
import type { ImageGenStatus } from '@/types/ipc'

interface Props {
  jobs:     JobProgressState[]
  onCancel: () => void
}

const STATUS_LABEL: Record<ImageGenStatus, string> = {
  queued:           'Queued',
  opening_browser:  'Opening ChatGPT…',
  injecting_prompt: 'Sending prompt…',
  waiting_for_image:'Generating image…',
  downloading:      'Downloading…',
  done:             'Done',
  error:            'Error',
}

const STATUS_COLOR: Record<ImageGenStatus, string> = {
  queued:           'var(--text-dim, #555)',
  opening_browser:  'var(--accent, #0bda76)',
  injecting_prompt: 'var(--accent, #0bda76)',
  waiting_for_image:'var(--accent, #0bda76)',
  downloading:      'var(--accent, #0bda76)',
  done:             '#10b981',
  error:            '#ef4444',
}

export default function ImageGenStatus({ jobs, onCancel }: Props): React.ReactElement | null {
  if (!jobs.length) return null

  const total    = jobs.length
  const done     = jobs.filter(j => j.status === 'done').length
  const errored  = jobs.filter(j => j.status === 'error').length
  const allDone  = done + errored === total

  return (
    <div style={{
      position:      'absolute',
      bottom:        90,
      right:         16,
      zIndex:        200,
      width:         300,
      background:    'var(--bg2, #111)',
      border:        '1px solid var(--border, #1e1e1e)',
      borderRadius:  10,
      padding:       '12px 14px',
      boxShadow:     '0 8px 32px rgba(0,0,0,0.6)',
      fontSize:      12,
      fontFamily:    'inherit',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, color: 'var(--text, #fff)', fontSize: 12 }}>
          Image Generation &nbsp;
          <span style={{ color: 'var(--text-dim, #888)', fontWeight: 400 }}>
            {done}/{total}
          </span>
        </span>
        {!allDone && (
          <button
            onClick={onCancel}
            style={{
              background: 'none', border: '1px solid #333', borderRadius: 4,
              color: '#888', fontSize: 10, padding: '2px 8px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: '#222', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width:  `${(done / total) * 100}%`,
          background: errored > 0 ? '#ef4444' : 'var(--accent, #0bda76)',
          transition: 'width 0.4s ease',
          borderRadius: 2,
        }} />
      </div>

      {/* Job rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
        {jobs.map((job, i) => (
          <JobRow key={job.postId} job={job} index={i} />
        ))}
      </div>

      {allDone && (
        <div style={{ marginTop: 10, color: '#10b981', fontSize: 11, textAlign: 'center', fontWeight: 600 }}>
          {errored > 0
            ? `${done} images injected · ${errored} failed`
            : `All ${done} images injected into canvas`}
        </div>
      )}
    </div>
  )
}

function JobRow({ job, index }: { job: JobProgressState; index: number }): React.ReactElement {
  const isActive  = !['done', 'error', 'queued'].includes(job.status)
  const color     = STATUS_COLOR[job.status]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* Spinner / dot */}
      <div style={{
        width: 7, height: 7, borderRadius: '50%',
        background: color,
        flexShrink: 0,
        animation: isActive ? 'elite-pulse 1.2s ease-in-out infinite' : 'none',
      }} />

      <span style={{ color: 'var(--text-dim, #888)', minWidth: 60 }}>
        Post {index + 1}
      </span>

      <span style={{ color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {job.status === 'error' && job.error
          ? `Error: ${job.error}`
          : STATUS_LABEL[job.status]}
      </span>
    </div>
  )
}
