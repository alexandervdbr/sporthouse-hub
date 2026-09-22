import { createAdminClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { trashFile } from '@/lib/drive-storage'
import { isValidCronSecret } from '@/lib/cron-auth'

// Mirrors Google Drive's own trash retention: anything soft-deleted in the
// app for 30+ days gets permanently purged (Drive file + DB row), whether or
// not anyone opened the Prullenbak to look at it.
export async function GET() {
  const headersList = await headers()
  const auth = headersList.get('authorization')

  if (!isValidCronSecret(auth)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const admin = createAdminClient()

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: expired, error } = await admin
    .from('files')
    .select('id, storage_provider, storage_path, drive_file_id')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)

  if (error) return new Response(error.message, { status: 500 })

  const expiredFiles = expired ?? []
  const results = await Promise.allSettled(
    expiredFiles.map(async (file) => {
      if (file.storage_provider === 'drive' && file.drive_file_id) {
        try { await trashFile(file.drive_file_id) } catch { /* may already be gone */ }
      } else if (file.storage_path) {
        await admin.storage.from('files').remove([file.storage_path])
      }
      const { error: delErr } = await admin.from('files').delete().eq('id', file.id)
      if (delErr) throw delErr
    })
  )

  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`Prullenbak opruimen mislukt voor bestand ${expiredFiles[i].id}:`, r.reason)
  })
  const purged = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length

  // Sporthouse Intern-documenten (Financiën/Administratie) staan in een aparte,
  // afgeschermde Shared Drive maar volgen dezelfde bewaartermijn van 30 dagen.
  const { data: expiredDocs, error: docsError } = await admin
    .from('sporthouse_documents')
    .select('id, storage_provider, storage_path, drive_file_id')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)

  if (docsError) return new Response(docsError.message, { status: 500 })

  const expiredDocsList = expiredDocs ?? []
  const docResults = await Promise.allSettled(
    expiredDocsList.map(async (doc) => {
      if (doc.storage_provider === 'drive' && doc.drive_file_id) {
        try { await trashFile(doc.drive_file_id) } catch { /* may already be gone */ }
      } else if (doc.storage_path) {
        await admin.storage.from('sporthouse-internal').remove([doc.storage_path])
      }
      const { error: delErr } = await admin.from('sporthouse_documents').delete().eq('id', doc.id)
      if (delErr) throw delErr
    })
  )

  docResults.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`Prullenbak opruimen mislukt voor document ${expiredDocsList[i].id}:`, r.reason)
  })

  return Response.json({
    checked: expired?.length ?? 0,
    purged,
    failed,
    documentsChecked: expiredDocs?.length ?? 0,
    documentsPurged: docResults.filter(r => r.status === 'fulfilled').length,
    documentsFailed: docResults.filter(r => r.status === 'rejected').length,
  })
}
