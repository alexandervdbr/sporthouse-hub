export interface Client {
  id: string
  name: string
  logo_url: string | null
  description: string | null
  color: string
  category: 'klant' | 'atleet' | 'podcast' | 'intern'
  created_at: string
}

export interface Document {
  id: string
  title: string
  content: string
  client_id: string
  file_url: string | null
  created_at: string
}

export interface FileRecord {
  id: string
  // Client files are scoped by client_id, Sporthouse Intern documents by
  // section — the shared FileManager renders either, so both are optional.
  client_id?: string
  section?: 'finance' | 'administration'
  filename: string
  description: string | null
  file_type: string
  file_size: number
  storage_path: string | null
  uploaded_by: string | null
  folder_id?: string | null
  created_at: string
  storage_provider?: 'supabase' | 'drive'
  drive_file_id?: string | null
  deleted_at?: string | null
  deleted_by?: string | null
  web_view_link?: string | null
  thumbnail_link?: string | null
}

export interface Post {
  id: string
  client_id: string
  template: string
  home_team: string | null
  away_team: string | null
  score: string | null
  player_name: string | null
  match_day: string | null
  thumbnail_url: string | null
  created_by: string | null
  created_at: string
}

export interface Meeting {
  id: string
  client_id: string
  title: string
  transcription: string
  summary: string | null
  created_by: string | null
  created_at: string
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface ReelInspiration {
  id: string
  user_id: string
  url: string
  thumbnail_url: string | null
  caption: string | null
  author: string | null
  embed_html: string | null
  category: string | null
  media_type: string | null
  tags: string[]
  confidence: 'high' | 'medium' | 'low' | null
  status: 'pending' | 'done' | 'error'
  error_message: string | null
  saved_at: string
}
