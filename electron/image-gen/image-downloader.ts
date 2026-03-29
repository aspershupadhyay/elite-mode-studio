/**
 * image-downloader.ts
 *
 * Downloads a captured image URL to a local temp file.
 * Applies quality gate (size + dimensions + sharpness) before writing.
 * Only writes to disk when ALL checks pass.
 */

import fs   from 'fs'
import path from 'path'
import os   from 'os'
import https from 'https'
import http  from 'http'
import { session as electronSession } from 'electron'
import { verifyImageBuffer, type VerifyResult } from './image-verifier'

const TMP_DIR   = path.join(os.tmpdir(), 'elite_gen_images')
const PARTITION = 'persist:ai-browser'
const CLEAN_UA  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function ensureTmpDir(): void {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })
}

function extFromUrl(url: string): string {
  const clean = url.split('?')[0].toLowerCase()
  const match = clean.match(/\.(png|jpg|jpeg|webp|gif)$/)
  return match ? match[1] : 'png'
}

export interface DownloadResult {
  success:      boolean
  tmpPath:      string
  error?:       string
  /** true when quality gate failed — caller should retry with a different URL */
  qualityFail?: boolean
  reason?:      string
}

/**
 * Download an image URL and verify quality before writing to disk.
 * Returns qualityFail=true if the image fails size/dimensions/sharpness checks.
 */
export async function downloadImageToTmp(imageUrl: string, postId: string): Promise<DownloadResult> {
  ensureTmpDir()

  const ext     = extFromUrl(imageUrl)
  const tmpPath = path.join(TMP_DIR, `gen_${postId}_${Date.now()}.${ext}`)

  const fetched = await fetchBuffer(imageUrl)
  if (!fetched.ok) {
    return { success: false, tmpPath: '', error: fetched.error }
  }

  const verify: VerifyResult = verifyImageBuffer(fetched.data!)
  if (!verify.ok) {
    console.log(`[image-downloader] Quality gate FAILED: ${verify.reason}`)
    return { success: false, tmpPath: '', qualityFail: true, reason: verify.reason }
  }

  fs.writeFileSync(tmpPath, fetched.data!)
  console.log(`[image-downloader] Saved: ${path.basename(tmpPath)} [${verify.reason}]`)
  return { success: true, tmpPath }
}

// ── Fetch raw bytes via Node https (uses session cookies) ────────────────────

interface FetchResult { ok: boolean; data?: Buffer; error?: string }

function fetchBuffer(imageUrl: string): Promise<FetchResult> {
  return new Promise((resolve) => {
    const ses = electronSession.fromPartition(PARTITION)
    ses.cookies.get({ url: imageUrl })
      .then((cookies) => {
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
        const mod = imageUrl.startsWith('https') ? https : http
        const headers: Record<string, string> = {
          'User-Agent': CLEAN_UA,
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        }

        const req = (mod as typeof https).get(imageUrl, { headers }, (res) => {
          if (res.statusCode !== 200) {
            resolve({ ok: false, error: `HTTP ${res.statusCode}` })
            return
          }
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end',  () => resolve({ ok: true, data: Buffer.concat(chunks) }))
          res.on('error', (e) => resolve({ ok: false, error: e.message }))
        })
        req.on('error', (e) => resolve({ ok: false, error: e.message }))
      })
      .catch((e: Error) => resolve({ ok: false, error: e.message }))
  })
}

/** Clean up tmp files older than maxAgeMs (default 1 hour). */
export function cleanTmpImages(maxAgeMs = 60 * 60 * 1000): void {
  if (!fs.existsSync(TMP_DIR)) return
  const now = Date.now()
  for (const file of fs.readdirSync(TMP_DIR)) {
    const p = path.join(TMP_DIR, file)
    try {
      const stat = fs.statSync(p)
      if (now - stat.mtimeMs > maxAgeMs) fs.unlinkSync(p)
    } catch { /* ignore */ }
  }
}
