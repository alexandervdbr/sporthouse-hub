import { createClient } from '@/lib/supabase/server'
import ProjectsBoard from '@/components/projects/ProjectsBoard'

export default async function ProjectsPage() {
  const supabase = await createClient()

  const [{ data: projects }, { data: clients }, { data: contacts }, { data: { user } }] = await Promise.all([
    supabase
      .from('projects')
      .select('*, client:clients(name, color), members:project_members(*)')
      .order('created_at', { ascending: false }),
    supabase
      .from('clients')
      .select('id, name, color, category')
      .order('name'),
    supabase
      .from('contacts')
      .select('id, name, role, photo_url')
      .order('name'),
    supabase.auth.getUser(),
  ])

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-base font-semibold text-sh-grey mb-1">Projecten</h2>
          <p className="text-sm text-zinc-500">
            Overzicht van alle lopende projecten per klant.
          </p>
        </div>

        <ProjectsBoard
          initialProjects={projects ?? []}
          clients={clients ?? []}
          contacts={contacts ?? []}
          currentUserEmail={user?.email ?? null}
        />
      </div>
    </div>
  )
}
