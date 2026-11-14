// Vormen zoals de interne API (/api/freelancers/**) ze teruggeeft.

export interface Stats {
  review_avg: number | null; review_count: number; active_assignments: number
  open_review_count: number; last_assignment_at: string | null
}

export interface Freelancer {
  id: string; name: string; email: string | null; phone: string | null; disciplines: string[]
  status: 'kandidaat' | 'proefopdracht' | 'vast' | 'inactief'
  rate_amount: number | null; rate_unit: 'uur' | 'dag' | 'project' | null; rate_note: string | null
  portfolio_links: { label: string; url: string }[]; notes: string | null; avatar_url: string | null
  availability: 'beschikbaar' | 'beperkt' | 'niet_beschikbaar'; available_from: string | null
  availability_updated_at: string | null; availability_updated_by: 'team' | 'freelancer' | null
  overall_rating: number | null; overall_rating_note: string | null
  archived_at: string | null; created_at: string
  stats: Stats | null
}

export interface Discipline { key: string; label: string; sort: number; archived_at: string | null }

export interface AssignmentRow {
  id: string; freelancer_id: string; title: string; discipline: string | null; briefing: string | null
  client_id: string | null; client_name: string | null; deadline: string | null; status: string
  is_historical: boolean; shared_at: string | null; first_viewed_at: string | null; status_changed_at: string
  created_at: string
  freelancer?: { id: string; name: string } | null
  client?: { id: string; name: string } | null
  review?: { score: number } | { score: number }[] | null
}

export interface AssignmentDetail extends AssignmentRow {
  freelancer: { id: string; name: string; email: string | null; phone: string | null } | null
  files: { id: string; file_name: string; file_size: number | null; file_type: string | null; kind: string; uploaded_by: string; uploaded_at: string }[]
  events: { id: string; actor_type: string; kind: string; from_status: string | null; to_status: string | null; message: string | null; visible_to_freelancer: boolean; created_at: string }[]
  review: { score: number; score_quality: number | null; score_deadline: number | null; score_communication: number | null; comment: string | null } | null
  actions: { to: string; action: string; message: 'verplicht' | 'optioneel' | 'geen' }[]
}

export type LinkStatus =
  | { state: 'geen' }
  | { state: 'actief' | 'geblokkeerd'; created_at: string; last_opened_at: string | null; locked_until: string | null; needs_new_pin: boolean }

export const reviewOf = (a: AssignmentRow) => (Array.isArray(a.review) ? a.review[0] : a.review) ?? null
