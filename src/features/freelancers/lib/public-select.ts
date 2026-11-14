import type { SupabaseClient } from '@supabase/supabase-js'
import { RECENT_DAYS_ON_LINK } from './config'

// Wat een freelancer op zijn link te zien krijgt. Elke uitvoer wordt hier
// VELD VOOR VELD opgebouwd uit expliciete kolommen: wat niet in deze
// functies staat, bestaat voor de link niet.
//
// Zichtbaar: titel, briefing, deadline, klantnaam, bedrag, status, bijlagen,
// de events die voor de freelancer bedoeld zijn, en naam + e-mail van de
// medewerker die de opdracht maakte.
// NOOIT: notes, overall_rating(_note), reviews, de status van de freelancer
// in de tool (kandidaat, …), interne events, andere freelancers, klantcontacten.
// src/lib/__tests__/freelancers-public.test.ts controleert dat op veldnaam.

type Db = SupabaseClient

const OPEN = ['gedeeld', 'geaccepteerd', 'opgeleverd'] as const
const RECENT = ['afgerond', 'geweigerd'] as const

export function isVisibleOnLink(status: string, statusChangedAt: string | null, now = Date.now()): boolean {
  if ((OPEN as readonly string[]).includes(status)) return true
  if ((RECENT as readonly string[]).includes(status)) {
    return !!statusChangedAt && now - Date.parse(statusChangedAt) < RECENT_DAYS_ON_LINK * 86400_000
  }
  return false // concept, geannuleerd, onbekend
}

const ASSIGNMENT_SELECT = 'id, title, briefing, deadline, client_name, agreed_amount, status, status_changed_at, first_viewed_at, is_historical, created_by, created_by_email, client:clients(name)'

interface Row {
  id: string; title: string; briefing: string | null; deadline: string | null; client_name: string | null
  agreed_amount: number | null; status: string; status_changed_at: string | null; first_viewed_at: string | null
  is_historical: boolean; created_by: string | null; created_by_email: string | null; client: { name: string } | null
}

export interface PublicCard {
  id: string; title: string; client: string | null; deadline: string | null; status: string
  isNew: boolean; feedback: boolean
}

export interface PublicDetail extends Omit<PublicCard, 'isNew'> {
  briefing: string | null
  agreedAmount: number | null
  statusChangedAt: string | null
  contact: { name: string | null; email: string | null }
  files: { id: string; name: string; size: number | null; type: string | null; kind: string; fromYou: boolean }[]
  messages: { message: string; at: string; kind: 'feedback' | 'weigering' | 'bericht' }[]
}

const clientOf = (r: Row) => r.client?.name ?? r.client_name ?? null

async function feedbackIds(db: Db, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const { data } = await db.from('freelancer_assignment_events')
    .select('assignment_id').in('assignment_id', ids)
    .eq('visible_to_freelancer', true).eq('from_status', 'opgeleverd').eq('to_status', 'geaccepteerd')
  return new Set((data ?? []).map(e => e.assignment_id as string))
}

export async function listForFreelancer(db: Db, freelancerId: string, now = Date.now()): Promise<PublicCard[]> {
  const { data } = await db.from('freelancer_assignments').select(ASSIGNMENT_SELECT)
    .eq('freelancer_id', freelancerId).eq('is_historical', false)
    .in('status', [...OPEN, ...RECENT])
    .order('deadline', { ascending: true, nullsFirst: false })
  const rows = ((data ?? []) as unknown as Row[]).filter(r => isVisibleOnLink(r.status, r.status_changed_at, now))
  const withFeedback = await feedbackIds(db, rows.filter(r => r.status === 'geaccepteerd').map(r => r.id))
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    client: clientOf(r),
    deadline: r.deadline,
    status: r.status,
    isNew: r.status === 'gedeeld' && !r.first_viewed_at,
    feedback: withFeedback.has(r.id),
  }))
}

/** Een zichtbare opdracht van DEZE freelancer, of null (→ 404). */
export async function loadVisible(db: Db, freelancerId: string, id: string, now = Date.now()): Promise<Row | null> {
  const { data } = await db.from('freelancer_assignments').select(ASSIGNMENT_SELECT)
    .eq('id', id).eq('freelancer_id', freelancerId).eq('is_historical', false).maybeSingle()
  const r = data as unknown as Row | null
  return r && isVisibleOnLink(r.status, r.status_changed_at, now) ? r : null
}

async function contactOf(db: Db, r: Row): Promise<PublicDetail['contact']> {
  if (r.created_by) {
    const { data } = await db.auth.admin.getUserById(r.created_by)
    const u = data?.user
    if (u) {
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>
      const name = typeof meta.full_name === 'string' && meta.full_name.trim() ? meta.full_name.trim() : null
      return { name, email: u.email ?? r.created_by_email }
    }
  }
  return { name: null, email: r.created_by_email }
}

export async function detailFor(db: Db, r: Row): Promise<PublicDetail> {
  const [{ data: files }, { data: events }, feedback, contact] = await Promise.all([
    db.from('freelancer_assignment_files')
      .select('id, file_name, file_size, file_type, kind, uploaded_by, uploaded_at')
      .eq('assignment_id', r.id).order('uploaded_at', { ascending: true }),
    db.from('freelancer_assignment_events')
      .select('message, created_at, from_status, to_status')
      .eq('assignment_id', r.id).eq('visible_to_freelancer', true).not('message', 'is', null)
      .order('created_at', { ascending: false }),
    feedbackIds(db, r.status === 'geaccepteerd' ? [r.id] : []),
    contactOf(db, r),
  ])
  return {
    id: r.id,
    title: r.title,
    client: clientOf(r),
    deadline: r.deadline,
    status: r.status,
    feedback: feedback.has(r.id),
    briefing: r.briefing,
    agreedAmount: r.agreed_amount,
    statusChangedAt: r.status_changed_at,
    contact,
    files: (files ?? []).map(f => ({
      id: f.id as string,
      name: f.file_name as string,
      size: (f.file_size as number | null) ?? null,
      type: (f.file_type as string | null) ?? null,
      kind: f.kind as string,
      fromYou: f.uploaded_by === 'freelancer',
    })),
    messages: (events ?? []).map(e => ({
      message: e.message as string,
      at: e.created_at as string,
      kind: e.to_status === 'geweigerd' ? 'weigering' : e.from_status === 'opgeleverd' && e.to_status === 'geaccepteerd' ? 'feedback' : 'bericht',
    })),
  }
}

export async function profileFor(db: Db, freelancerId: string) {
  const { data } = await db.from('freelancers').select('name, availability, available_from').eq('id', freelancerId).maybeSingle()
  return {
    firstName: (data?.name as string | undefined)?.trim().split(/\s+/)[0] ?? '',
    availability: (data?.availability as string | undefined) ?? 'beschikbaar',
    availableFrom: (data?.available_from as string | null | undefined) ?? null,
  }
}
