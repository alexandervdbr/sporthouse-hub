import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

// Guards against fetching a pathologically large file — reels are short, so
// anything past this is unexpected and not worth the time/memory to handle.
const MAX_VIDEO_BYTES = 20 * 1024 * 1024

const FRAME_INTERVAL_S = 3.5
const MIN_FRAMES = 4
const MAX_FRAMES = 8

// Scales with clip length but never exceeds MAX_FRAMES — bounds Claude
// image-token cost per video regardless of how long the source clip is.
export function computeFrameCount(durationS: number): number {
  const scaled = Math.ceil(durationS / FRAME_INTERVAL_S)
  return Math.min(MAX_FRAMES, Math.max(MIN_FRAMES, scaled))
}

// Interior sampling (never exactly 0 or durationS) to dodge the occasional
// black/transition frame right at a clip's edges.
function frameTimestamps(durationS: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => (durationS * (i + 1)) / (count + 1))
}

export interface VideoFrame {
  mediaType: 'image/jpeg'
  data: string
}

// Fetches a (short-lived, signed) Instagram video URL, extracts a handful
// of frames via ffmpeg, and returns them as base64 JPEGs — nothing is ever
// persisted to Drive/Supabase, all of it lives only in this process's /tmp
// for the duration of one classification call and is removed again in the
// `finally` block below (including on any failure), since Vercel's Fluid
// Compute can reuse the same container — and therefore /tmp — across
// concurrent invocations.
export async function extractVideoFrames(videoUrl: string, durationS: number): Promise<VideoFrame[] | null> {
  if (!ffmpegPath) return null

  let dir: string | null = null
  try {
    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null

    const contentLength = Number(res.headers.get('content-length') ?? 0)
    if (contentLength > MAX_VIDEO_BYTES) return null

    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.byteLength > MAX_VIDEO_BYTES) return null

    dir = await mkdtemp(join(tmpdir(), 'reel-'))
    const sourcePath = join(dir, 'source.mp4')
    await writeFile(sourcePath, buffer)

    const count = computeFrameCount(durationS)
    const timestamps = frameTimestamps(durationS, count)

    const frames: VideoFrame[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const framePath = join(dir, `frame_${i}.jpg`)
      await execFileAsync(ffmpegPath, [
        '-ss', timestamps[i].toFixed(2),
        '-i', sourcePath,
        '-frames:v', '1',
        '-q:v', '4',
        framePath,
      ])
      const data = await readFile(framePath)
      frames.push({ mediaType: 'image/jpeg', data: data.toString('base64') })
    }

    return frames.length > 0 ? frames : null
  } catch (err) {
    console.error('Video frame-extractie mislukt:', err instanceof Error ? err.message : err)
    return null
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
