export interface InstagramOembed {
  title: string | null
  authorName: string | null
  thumbnailUrl: string | null
  html: string | null
}

export class InstagramOembedError extends Error {}

async function requestOembed(url: string, accessToken?: string): Promise<Response> {
  const params = new URLSearchParams({ url, omitscript: 'true' })
  if (accessToken) params.set('access_token', accessToken)

  try {
    return await fetch(`https://graph.facebook.com/v25.0/instagram_oembed?${params.toString()}`)
  } catch {
    throw new InstagramOembedError('Kon Instagram niet bereiken.')
  }
}

function toOembed(data: Record<string, unknown>): InstagramOembed {
  return {
    title: (data.title as string) ?? null,
    authorName: (data.author_name as string) ?? null,
    thumbnailUrl: (data.thumbnail_url as string) ?? null,
    html: (data.html as string) ?? null,
  }
}

// With META_APP_ACCESS_TOKEN from an app that hasn't cleared Meta's "Meta
// oEmbed Read" App Review yet, the authenticated call gets rejected outright
// (400, "must be reviewed and approved by Facebook") — worse than having no
// token at all, since an unauthenticated request still succeeds with a bare
// `html` field. So: try with the token first for full metadata, but fall
// back to the unauthenticated call rather than failing the whole save while
// review is pending. Once approved, the first branch just starts succeeding
// and this fallback stops being reachable — no code change needed then.
export async function fetchInstagramOembed(url: string): Promise<InstagramOembed> {
  const token = process.env.META_APP_ACCESS_TOKEN

  if (token) {
    const res = await requestOembed(url, token)
    if (res.ok) return toOembed(await res.json())

    const body = await res.text().catch(() => '')
    console.error(`Instagram oEmbed (met token) ${res.status}:`, body)
  }

  const res = await requestOembed(url)
  if (res.ok) return toOembed(await res.json())

  const body = await res.text().catch(() => '')
  console.error(`Instagram oEmbed ${res.status}:`, body)

  const isNotFound = res.status === 400 || res.status === 404
  throw new InstagramOembedError(
    isNotFound
      ? 'Deze post is privé, verwijderd of ongeldig.'
      : `Instagram gaf een fout terug (${res.status}).`
  )
}
