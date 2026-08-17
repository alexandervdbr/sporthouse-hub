export interface InstagramOembed {
  title: string | null
  authorName: string | null
  thumbnailUrl: string | null
  html: string | null
}

export class InstagramOembedError extends Error {}

// Works without an access token for public content (as of mid-2026) — a Meta
// app token can be added later for higher rate limits via
// META_APP_ACCESS_TOKEN, no code change needed here.
export async function fetchInstagramOembed(url: string): Promise<InstagramOembed> {
  const params = new URLSearchParams({ url, omitscript: 'true' })
  if (process.env.META_APP_ACCESS_TOKEN) {
    params.set('access_token', process.env.META_APP_ACCESS_TOKEN)
  }

  let res: Response
  try {
    res = await fetch(`https://graph.facebook.com/v25.0/instagram_oembed?${params.toString()}`)
  } catch {
    throw new InstagramOembedError('Kon Instagram niet bereiken.')
  }

  if (!res.ok) {
    const isNotFound = res.status === 400 || res.status === 404
    throw new InstagramOembedError(
      isNotFound
        ? 'Deze post is privé, verwijderd of ongeldig.'
        : `Instagram gaf een fout terug (${res.status}).`
    )
  }

  const data = await res.json()
  return {
    title: data.title ?? null,
    authorName: data.author_name ?? null,
    thumbnailUrl: data.thumbnail_url ?? null,
    html: data.html ?? null,
  }
}
