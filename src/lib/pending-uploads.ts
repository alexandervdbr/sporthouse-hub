// Uploads that were still running when the tab went away.
//
// Drive keeps a resumable session open for about a week, and it knows exactly
// how many bytes it already holds. So a gigabyte that was 80% done before
// someone closed the tab doesn't have to start over — if we remember which
// session belonged to which file.
//
// What can't be remembered is the file itself: a File object dies with the
// page, and no browser hands back bytes from disk without the user picking
// them again. So this stores the session and the file's identity, and the
// person has to point at the same file once more. That's the honest limit of
// what's possible, and it still saves the part that already arrived.

const STORAGE_KEY = 'sporthouse-pending-uploads'

// Drive sessions last about a week; a day keeps the list short while still
// covering "I'll finish it tomorrow".
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export interface PendingUpload {
  uploadUrl: string
  filename: string
  fileSize: number
  folderId: string | null
  /** Which file manager this belongs to — a client's files, or a section. */
  scope: string
  startedAt: number
}

function readAll(): PendingUpload[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const fresh = parsed.filter((p: PendingUpload) =>
      p && typeof p.uploadUrl === 'string' && Date.now() - p.startedAt < MAX_AGE_MS
    )
    return fresh
  } catch {
    // Private browsing, cleared storage, a half-written value — none of it is
    // worth failing an upload over.
    return []
  }
}

function writeAll(list: PendingUpload[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch { /* storage unavailable or full; resuming is a courtesy, not a duty */ }
}

export function rememberUpload(entry: PendingUpload) {
  writeAll([...readAll().filter(p => p.uploadUrl !== entry.uploadUrl), entry])
}

export function forgetUpload(uploadUrl: string) {
  writeAll(readAll().filter(p => p.uploadUrl !== uploadUrl))
}

export function pendingUploadsFor(scope: string): PendingUpload[] {
  return readAll().filter(p => p.scope === scope)
}
