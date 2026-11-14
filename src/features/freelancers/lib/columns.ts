// Expliciete kolomlijsten voor de interne API. Nooit select('*'): wat een
// route teruggeeft, staat hier zichtbaar. (De publieke link krijgt in Fase 4
// een eigen, veel kortere lijst.)

export const FREELANCER_COLUMNS = [
  'id', 'name', 'email', 'phone', 'disciplines', 'status',
  'rate_amount', 'rate_unit', 'rate_note', 'portfolio_links', 'notes', 'avatar_url',
  'availability', 'available_from', 'availability_updated_at', 'availability_updated_by',
  'overall_rating', 'overall_rating_note', 'overall_rating_updated_at', 'overall_rating_updated_by',
  'archived_at', 'created_at', 'updated_at',
].join(', ')

export const STATS_COLUMNS = 'freelancer_id, review_avg, review_count, active_assignments, open_review_count, last_assignment_at'

export const ASSIGNMENT_COLUMNS = [
  'id', 'freelancer_id', 'title', 'discipline', 'briefing', 'client_id', 'client_name',
  'deadline', 'status', 'is_historical', 'created_by', 'created_by_email',
  'shared_at', 'first_viewed_at', 'status_changed_at', 'created_at', 'updated_at',
].join(', ')

export const FILE_COLUMNS = [
  'id', 'assignment_id', 'file_name', 'file_size', 'file_type', 'kind', 'uploaded_by',
  'storage_provider', 'uploaded_at', 'created_by',
].join(', ')

export const EVENT_COLUMNS = 'id, assignment_id, actor_type, actor_id, kind, from_status, to_status, message, visible_to_freelancer, created_at'

export const REVIEW_COLUMNS = 'id, assignment_id, score, score_quality, score_deadline, score_communication, comment, reviewer_id, created_at, updated_at'

export const DISCIPLINE_COLUMNS = 'key, label, sort, archived_at'
