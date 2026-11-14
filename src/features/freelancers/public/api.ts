// Browser-kant van de persoonlijke link. Alleen /api/public/f/*; de cookie
// gaat vanzelf mee (zelfde site). Het token wordt alleen meegestuurd naar
// /session en /pin, in de body — nooit in een URL.

export interface Card { id: string; title: string; client: string | null; deadline: string | null; status: string; isNew: boolean; feedback: boolean }
export interface Me { firstName: string; availability: string; availableFrom: string | null; assignments: Card[] }
export interface Detail extends Omit<Card, 'isNew'> {
  briefing: string | null; statusChangedAt: string | null
  contact: { name: string | null; email: string | null }
  files: { id: string; name: string; size: number | null; type: string | null; kind: string; fromYou: boolean }[]
  messages: { message: string; at: string; kind: 'feedback' | 'weigering' | 'bericht' }[]
}
export type SessionState =
  | { state: 'ok' } | { state: 'ongeldig' }
  | { state: 'pin'; attemptsLeft?: number }
  | { state: 'geblokkeerd'; until: string | null; needsNewPin: boolean }

/** Sessie verlopen of ingetrokken: terug naar de pincode. */
export class SessionLost extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/public/f${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (res.status === 401) throw new SessionLost()
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error || 'Er ging iets mis. Probeer opnieuw.')
  return body as T
}

/** Voor /session en /pin: elke status is een geldig antwoord. */
async function state(path: string, payload: object): Promise<SessionState> {
  const res = await fetch(`/api/public/f${path}`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => null) as SessionState | null
  if (!body || !('state' in body)) throw new Error('Er ging iets mis. Probeer opnieuw.')
  return body
}

export const api = {
  session: (token: string | null) => state('/session', token ? { token } : {}),
  pin: (token: string, pin: string) => state('/pin', { token, pin }),
  me: () => call<Me>('/me'),
  setAvailability: (availability: string, available_from: string | null) =>
    call<{ availability: string; availableFrom: string | null }>('/availability', { method: 'PUT', body: JSON.stringify({ availability, available_from }) }),
  detail: (id: string) => call<Detail>(`/assignments/${id}`),
  action: (id: string, action: 'accepteren' | 'weigeren' | 'opleveren', reason?: string) =>
    call<Detail>(`/assignments/${id}/action`, { method: 'POST', body: JSON.stringify({ action, reason: reason || null }) }),
  uploadSession: (id: string, files: { name: string; size: number; mimeType: string }[]) =>
    call<{ uploadUrls: string[] }>(`/assignments/${id}/upload-session`, { method: 'POST', body: JSON.stringify({ files }) }),
  finalize: (id: string, uploads: { uploadUrl: string; size: number }[]) =>
    call<{ results: ({ ok: true; id: string; name: string } | { ok: false; error: string })[] }>(`/assignments/${id}/finalize`, { method: 'POST', body: JSON.stringify({ uploads }) }),
  fileUrl: (fileId: string) => `/api/public/f/files/${fileId}`,
}
