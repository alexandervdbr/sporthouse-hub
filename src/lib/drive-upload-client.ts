// Sending a file to Drive from the browser, in chunks, straight to Google.
//
// Lived in FileManager.tsx until Pré-assist needed the same thing: it still
// posted whole files to a function of ours, which Vercel refuses above 4.5 MB
// — so a video never arrived at all. Moved here unchanged rather than copied,
// because what makes this work is not the loop but the hard-won detail in the
// comments below, and two copies of that drift apart.
//
// Browser-only: XMLHttpRequest, and File.slice(). The server side of the same
// exchange lives in lib/drive-storage (createResumableUploadSession, and
// getResumableUploadResult for the answer this code cannot read itself).

// Drive's resumable upload requires chunk sizes to be a multiple of 256 KiB
// (except the final chunk).
//
// 16 MiB now that the bytes go straight to Google: they used to pass through
// a function of ours, where Vercel rejects any request body over 4.5 MB — and
// where every byte counted against a transfer budget that one large video was
// enough to exhaust. Nothing caps this any more, so the number is chosen on
// its own merits: large enough that a 1 GB file is tens of requests rather
// than hundreds, small enough that a dropped connection costs little.
const UPLOAD_CHUNK_SIZE = 16 * 1024 * 1024

const DRIVE_UPLOAD_PREFIX = 'https://www.googleapis.com/upload/drive/v3/files?'

// Sends one Content-Range chunk straight to Drive's session URL.
//
// Cross-origin, and Google's answer differs by outcome in a way that matters:
// while the upload is still running it replies 308 with full CORS headers and
// Range exposed, so the browser can read exactly how far it got. The response
// to the *final* chunk carries no CORS headers at all — the bytes arrive, but
// the browser is not allowed to read what came back. That asymmetry is why
// the last chunk's result is deliberately ignored here and the outcome is
// established by asking our own server afterwards.
//
// (This is also why an earlier attempt concluded Drive "doesn't do CORS" and
// routed everything through a relay instead: tested with a single chunk, the
// only response you ever see is the opaque one.)
function putChunk(
  uploadUrl: string, file: File, start: number, end: number,
  onChunkProgress?: (loaded: number) => void
): Promise<{ receivedBytes: number | null }> {
  return new Promise((resolve, reject) => {
    const isFinalChunk = end >= file.size
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${file.size}`)

    // Without this, progress only ever updates at chunk boundaries — for a
    // file smaller than one chunk that means 0% until it suddenly finishes.
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onChunkProgress?.(e.loaded)
    }

    xhr.onload = () => {
      if (xhr.status === 308) {
        // "bytes=0-1048575", absent when nothing has been stored yet.
        const range = xhr.getResponseHeader('Range')
        const received = range ? Number(range.split('-')[1]) + 1 : 0
        resolve({ receivedBytes: Number.isFinite(received) ? received : 0 })
        return
      }
      if (xhr.status === 200 || xhr.status === 201) {
        // Readable only because this wasn't the finishing chunk after all.
        resolve({ receivedBytes: file.size })
        return
      }
      reject(new Error(`Upload naar Drive mislukt (${xhr.status}).`))
    }

    xhr.onerror = () => {
      // The finishing chunk always lands here: the bytes went out, and the
      // browser blocked the response for lacking CORS headers. Treated as
      // "sent", with the server having the last word on whether it arrived.
      if (isFinalChunk) resolve({ receivedBytes: null })
      else reject(new Error('NETWORK_ERROR'))
    }

    xhr.send(file.slice(start, end))
  })
}

// Asks Drive how much of this session it actually holds, rather than assuming
// a dropped connection means the chunk was lost.
//
// A failure here is always treated as a failure, never as "it must be
// finished". Both look identical from the browser — status 0 — because a
// completed upload answers without CORS headers and so does an unreachable
// network. Reading that as completion is what made pulling the wifi end an
// upload instantly: the loop exited, and the finalize call that followed hit
// the same dead network and surfaced as "Failed to fetch".
//
// Whether the upload is actually complete is the server's to answer, after
// the loop, where the response is readable.
function queryUploadStatus(uploadUrl: string, fileSize: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Range', `bytes */${fileSize}`)
    xhr.onload = () => {
      if (xhr.status === 308) {
        const range = xhr.getResponseHeader('Range')
        const received = range ? Number(range.split('-')[1]) + 1 : 0
        resolve(Number.isFinite(received) ? received : 0)
        return
      }
      if (xhr.status === 200 || xhr.status === 201) { resolve(fileSize); return }
      reject(new Error(`Kon upload-status niet controleren (${xhr.status}).`))
    }
    xhr.onerror = () => reject(new Error('NETWORK_ERROR'))
    xhr.send()
  })
}

// Walks a file to Drive in chunks, recovering from a dropped connection by
// asking Drive for the real byte offset instead of starting over. Returns
// once the last chunk has been sent; whether it arrived is for the server to
// confirm, since that answer is not readable from here.
export async function putFileToDrive(
  file: File,
  uploadUrl: string,
  onProgress: (pct: number) => void,
  // Where to pick up, when resuming an upload from an earlier visit. Asked of
  // our own server rather than worked out here: a session that already
  // finished answers the browser without CORS headers, which is
  // indistinguishable from a dead network. The server has no such problem.
  startOffset = 0
): Promise<void> {
  if (!uploadUrl.startsWith(DRIVE_UPLOAD_PREFIX)) throw new Error('Ongeldige upload-URL.')

  let offset = startOffset
  if (startOffset > 0) onProgress(Math.round((startOffset / file.size) * 100))
  let consecutiveFailures = 0
  // Eight tries with a backoff that tops out at 8 seconds buys roughly a
  // minute of patience. A phone changing cells or a wifi hiccup takes seconds
  // to recover from, and giving up after fifteen of them means re-sending a
  // gigabyte over something that fixed itself.
  const MAX_CONSECUTIVE_FAILURES = 8
  const backoffMs = (attempt: number) => Math.min(attempt, 8) * 1000

  while (offset < file.size) {
    const end = Math.min(offset + UPLOAD_CHUNK_SIZE, file.size)
    const chunkStart = offset
    try {
      const { receivedBytes } = await putChunk(uploadUrl, file, offset, end, (loaded) => {
        onProgress(Math.round(((chunkStart + loaded) / file.size) * 100))
      })
      // null means the finishing chunk went out unreadable — nothing left to
      // send either way.
      offset = receivedBytes ?? file.size
      consecutiveFailures = 0
      onProgress(Math.round((offset / file.size) * 100))
    } catch {
      consecutiveFailures++
      if (consecutiveFailures > MAX_CONSECUTIVE_FAILURES) {
        throw new Error('Upload mislukt na meerdere pogingen.')
      }
      await new Promise(r => setTimeout(r, backoffMs(consecutiveFailures)))
      try {
        offset = await queryUploadStatus(uploadUrl, file.size)
        onProgress(Math.round((offset / file.size) * 100))
      } catch {
        // Still unreachable — keep the offset and retry the same chunk, until
        // the attempt budget above runs out.
      }
    }
  }
}
