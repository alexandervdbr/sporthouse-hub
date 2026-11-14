import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { trashFile } from '@/lib/drive-storage'
import { requireFreelancers, isUuid } from '@/features/freelancers/lib/server'
import { downloadUrl, revokeExpiredShares, FILE_DOWNLOAD_COLUMNS, type FileRow } from '@/features/freelancers/lib/files-server'
import { revokePermission } from '@/features/freelancers/lib/drive-files'
import { recordEvent } from '@/features/freelancers/lib/assignments-server'

// GET    (bekijken) — downloaden: na de rechtencheck een redirect (302) naar
//        Drive of een signed URL van 60 s. Nooit gestreamd door deze function.
//        Hoe (tijdelijke deling of webViewLink): INTERNAL_DOWNLOAD_MODE in
//        src/features/freelancers/lib/config.ts.
// DELETE (beheren)  — bijlage weg (Drive: naar de prullenbak).
type Ctx = { params: Promise<{ id: string; fileId: string }> }

async function fileOf(id: string, fileId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from('freelancer_assignment_files')
    .select(`${FILE_DOWNLOAD_COLUMNS}, file_name`)
    .eq('id', fileId).eq('assignment_id', id).maybeSingle()
  return { admin, file: data as (FileRow & { file_name: string }) | null }
}

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('bekijken')
  if ('error' in auth) return auth.error
  const { id, fileId } = await params
  if (!isUuid(id) || !isUuid(fileId)) return new Response('Niet gevonden', { status: 404 })

  // Eerst via de client van de gebruiker: ziet die de opdracht (RLS)?
  const { data: a } = await auth.supabase.from('freelancer_assignments').select('id').eq('id', id).maybeSingle()
  if (!a) return new Response('Niet gevonden', { status: 404 })

  const { admin, file } = await fileOf(id, fileId)
  if (!file) return new Response('Niet gevonden', { status: 404 })

  // Verlopen delingen opruimen, na het antwoord.
  after(() => revokeExpiredShares(admin).catch(() => {}))

  try {
    const url = await downloadUrl(admin, file)
    if (!url) return new Response('Bestand niet gevonden.', { status: 404 })
    return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
  } catch (err) {
    console.error('Freelancers: download mislukt:', (err as Error).message)
    return new Response('Kon het bestand niet klaarzetten.', { status: 502 })
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id, fileId } = await params
  if (!isUuid(id) || !isUuid(fileId)) return new Response('Niet gevonden', { status: 404 })

  const { data: a } = await auth.supabase.from('freelancer_assignments').select('id').eq('id', id).maybeSingle()
  if (!a) return new Response('Niet gevonden', { status: 404 })
  const { admin, file } = await fileOf(id, fileId)
  if (!file) return new Response('Niet gevonden', { status: 404 })

  if (file.storage_provider === 'drive' && file.drive_file_id) {
    if (file.public_permission_id) await revokePermission(file.drive_file_id, file.public_permission_id).catch(() => {})
    await trashFile(file.drive_file_id).catch(err => console.error('Freelancers: Drive-bestand niet naar prullenbak:', (err as Error).message))
  } else if (file.file_url) {
    await admin.storage.from('freelancer-assignments').remove([file.file_url])
  }

  const { error } = await auth.supabase.from('freelancer_assignment_files').delete().eq('id', fileId).eq('assignment_id', id)
  if (error) return new Response('Kon de bijlage niet verwijderen.', { status: 500 })
  await recordEvent(auth.supabase, {
    assignmentId: id, actorType: 'team', actorId: auth.user.id, kind: 'bestand',
    message: `Bijlage verwijderd: ${file.file_name}`, visibleToFreelancer: false,
  })
  return new Response(null, { status: 204 })
}
