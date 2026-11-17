// Vormen zoals /api/freelancers ze teruggeeft (zie lib/columns.ts en lib/rows.ts).

export type FStatus = 'vast' | 'proefopdracht' | 'kandidaat' | 'inactief'
export type RateUnit = 'uur' | 'dag' | 'project'
export interface PortfolioLink { label?: string; url: string }

export interface Freelancer {
  id: string
  name: string
  email: string | null
  phone: string | null
  disciplines: string[]
  status: FStatus
  rate_amount: number | null
  rate_unit: RateUnit | null
  rate_note: string | null
  overall_rating: number | null
  overall_rating_note: string | null
  portfolio_links: PortfolioLink[]
  notes: string | null
  archived_at: string | null
  created_at: string
  /** Gemiddelde van de samenwerkingen; overschrijft overall_rating nooit. */
  collab: { avg: number | null; count: number; scored: number }
}

export interface Discipline { key: string; label: string; sort: number }

export interface Project {
  id: string
  freelancer_id: string
  project_name: string
  client_name: string | null
  date: string | null
  score: number | null
  notes: string | null
  created_at: string
}
