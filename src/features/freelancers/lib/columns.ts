// Expliciete kolomlijsten voor de API. Nooit select('*'): wat een route
// teruggeeft, staat hier zichtbaar.

export const FREELANCER_COLUMNS = [
  'id', 'name', 'email', 'phone', 'disciplines', 'status',
  'rate_amount', 'rate_unit', 'rate_note', 'overall_rating', 'overall_rating_note',
  'portfolio_links', 'notes', 'archived_at', 'created_at', 'updated_at',
].join(', ')

export const PROJECT_COLUMNS = 'id, freelancer_id, project_name, client_name, date, score, notes, created_at'

/** De lijst: elke freelancer met de scores van zijn samenwerkingen (voor het gemiddelde). */
export const LIST_COLUMNS = `${FREELANCER_COLUMNS}, freelancer_projects(score)`

export const DISCIPLINE_COLUMNS = 'key, label, sort'
