export interface InstagramOembed {
  title: string | null
  authorName: string | null
  thumbnailUrl: string | null
  html: string | null
}

export class InstagramOembedError extends Error {}

// Without META_APP_ACCESS_TOKEN, Meta's oEmbed endpoint only returns `html`
// (no title/author/thumbnail) for public content — the full metadata needs
// an App Access Token from an app with the oEmbed Read use case approved.
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
    // Logged so the real Graph API error (bad/unapproved token vs. an
    // actually private/invalid post) is visible in Vercel's function logs —
    // the message shown to the user stays generic either way.
    const body = await res.text().catch(() => '')
    console.error(`Instagram oEmbed ${res.status}:`, body)

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
