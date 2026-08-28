import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Two separate .ilike() queries merged in JS, instead of building a single
// .or(`col1.ilike.${like},col2.ilike.${like}`) string — PostgREST's filter
// DSL treats ',' and '(' / ')' as syntax, so interpolating a raw search term
// into it let a query containing those characters inject extra conditions.
async function searchColumns(
  supabase: SupabaseClient,
  table: string,
  select: string,
  columns: string[],
  like: string,
  limit: number
): Promise<Record<string, unknown>[]> {
  const results = await Promise.all(
    columns.map(col => supabase.from(table).select(select).ilike(col, like).limit(limit))
  )
  const byId = new Map<string, Record<string, unknown>>()
  for (const { data } of results) {
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      byId.set(row.id as string, row)
    }
  }
  return Array.from(byId.values()).slice(0, limit)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim()

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const like = `%${query}%`

  const [clients, files, meetings, documents, projects] = await Promise.all([
    searchColumns(supabase, 'clients', 'id, name, description, color, category', ['name', 'description'], like, 5),
    searchColumns(supabase, 'files', 'id, filename, description, client_id', ['filename', 'description'], like, 5),
    supabase.from('meetings').select('id, title, client_id, created_at').ilike('title', like).limit(5),
    supabase.from('expert_documents').select('id, title, client_id').ilike('title', like).limit(5),
    searchColumns(supabase, 'projects', 'id, name, description, status', ['name', 'description'], like, 5),
  ])

  return NextResponse.json({
    results: {
      clients,
      files,
      meetings: meetings.data || [],
      documents: documents.data || [],
      projects,
    },
  })
}
