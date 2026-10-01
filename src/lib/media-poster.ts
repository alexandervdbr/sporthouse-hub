// Makes a thumbnail in the browser at upload time, so a file gets a usable
// preview without depending on Drive — which stops rendering previews
// entirely above a certain file size. For video that's a captured frame; for
// a large image it's a scaled-down copy.
//
// Doing it client-side is what makes this cheap: the file is already on the
// user's machine, so there's no download, no server time and no file-size
// ceiling. The browser streams from disk and reads only the frames it needs.
//
// The limit is codecs: whatever the browser can't play, this can't capture
// (ProRes, .mkv, .avi, .wmv). Every failure path returns null so the caller
// just uploads without a poster and Drive's own thumbnail stays the fallback.

// Drive caps its own renders at 1024px; matching that keeps the viewer
// consistent whichever source a given file ends up using.
const MAX_EDGE = 1024
const JPEG_QUALITY = 0.82
const METADATA_TIMEOUT_MS = 15000
const SEEK_TIMEOUT_MS = 10000

// The opening frame of a video is so often black, a logo card or a fade that
// taking it is close to useless. These three are sampled and the one with the
// most tonal variation wins — a flat frame scores near zero, a real scene
// scores high.
const SAMPLE_POINTS = [0.1, 0.3, 0.5]

function once<T extends Event>(el: EventTarget, event: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`timeout: ${event}`)) }, timeoutMs)
    const onEvent = (e: Event) => { cleanup(); resolve(e as T) }
    const onError = () => { cleanup(); reject(new Error(`fout bij ${event}`)) }
    function cleanup() {
      clearTimeout(timer)
      el.removeEventListener(event, onEvent)
      el.removeEventListener('error', onError)
    }
    el.addEventListener(event, onEvent, { once: true })
    el.addEventListener('error', onError, { once: true })
  })
}

// Standard deviation of luminance over a coarse sample of the frame — a cheap
// stand-in for "is there anything to see here".
function tonalSpread(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const { data } = ctx.getImageData(0, 0, w, h)
  let sum = 0, sumSq = 0, n = 0
  // Every 40th pixel is plenty to tell a black frame from a photograph.
  for (let i = 0; i < data.length; i += 4 * 40) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    sum += lum; sumSq += lum * lum; n++
  }
  if (n === 0) return 0
  const mean = sum / n
  return Math.sqrt(Math.max(0, sumSq / n - mean * mean))
}

export async function extractVideoPoster(file: File): Promise<Blob | null> {
  if (typeof document === 'undefined') return null

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  video.playsInline = true
  // Not strictly needed for an object URL (same origin, so the canvas never
  // gets tainted) but harmless and explicit about the intent.
  video.crossOrigin = 'anonymous'
  video.src = url

  try {
    await once(video, 'loadedmetadata', METADATA_TIMEOUT_MS)

    const { videoWidth: vw, videoHeight: vh, duration } = video
    if (!vw || !vh || !isFinite(duration) || duration <= 0) return null

    const scale = Math.min(1, MAX_EDGE / Math.max(vw, vh))
    const w = Math.max(1, Math.round(vw * scale))
    const h = Math.max(1, Math.round(vh * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null

    let best: { score: number; blob: Blob } | null = null

    for (const point of SAMPLE_POINTS) {
      // Never land exactly on the last frame; some containers won't seek there.
      video.currentTime = Math.min(duration * point, Math.max(0, duration - 0.1))
      try {
        await once(video, 'seeked', SEEK_TIMEOUT_MS)
      } catch {
        continue
      }

      ctx.drawImage(video, 0, 0, w, h)
      const score = tonalSpread(ctx, w, h)
      if (best && score <= best.score) continue

      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY))
      if (blob) best = { score, blob }
    }

    return best?.blob ?? null
  } catch {
    // Unsupported codec, a seek that never completed, a corrupt file — all of
    // it means "no poster", never "upload failed".
    return null
  } finally {
    URL.revokeObjectURL(url)
    video.removeAttribute('src')
    video.load()
  }
}

// Drive was measured refusing to render anything above somewhere between 37
// and 96 MB. Images below this are left to Drive: it handles them fine, and a
// poster would be work for nothing.
export const IMAGE_POSTER_MIN_BYTES = 25 * 1024 * 1024

// Scales a large image down to poster size. Unlike video this needs no
// seeking or frame-picking — there's one frame and it's the right one.
export async function extractImagePoster(file: File): Promise<Blob | null> {
  if (typeof document === 'undefined') return null

  let bitmap: ImageBitmap | null = null
  try {
    // Decoded off the main thread, which matters for a file this size.
    bitmap = await createImageBitmap(file)

    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(bitmap, 0, 0, w, h)
    return await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY))
  } catch {
    // A format this browser can't decode (some HEIC, exotic TIFF) — the file
    // still uploads, it just won't carry a poster.
    return null
  } finally {
    bitmap?.close()
  }
}
