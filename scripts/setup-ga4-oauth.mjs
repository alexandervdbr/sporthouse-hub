import { createServer } from 'http'
import { readFileSync, writeFileSync } from 'fs'
import { OAuth2Client } from 'google-auth-library'

// Parse .env.local
const envPath = new URL('../.env.local', import.meta.url).pathname
const envContent = readFileSync(envPath, 'utf8')
const env = {}
for (const line of envContent.split('\n')) {
  const idx = line.indexOf('=')
  if (idx > 0) {
    const k = line.substring(0, idx).trim()
    let v = line.substring(idx + 1).trim()
    if (v.startsWith('"')) v = v.slice(1, -1)
    env[k] = v
  }
}

const CLIENT_ID = env['GA4_OAUTH_CLIENT_ID']
const CLIENT_SECRET = env['GA4_OAUTH_CLIENT_SECRET']
const REDIRECT_URI = 'http://localhost:4444'

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('GA4_OAUTH_CLIENT_ID en GA4_OAUTH_CLIENT_SECRET ontbreken in .env.local')
  process.exit(1)
}

const oAuth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/analytics.readonly'],
})

console.log('\n=== GA4 OAuth2 Setup ===\n')
console.log('Open deze URL in je browser:\n')
console.log(authUrl)
console.log('\nWachten op autorisatie...\n')

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI)
  const code = url.searchParams.get('code')
  if (!code) {
    res.end('Geen code ontvangen.')
    return
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code)
    const refreshToken = tokens.refresh_token

    if (!refreshToken) {
      res.end('Geen refresh token ontvangen. Probeer opnieuw.')
      console.error('\nGeen refresh token. Verwijder de app-toegang op https://myaccount.google.com/permissions en run het script opnieuw.')
      server.close()
      return
    }

    // Write to .env.local
    let updated = envContent
    if (updated.includes('GA4_REFRESH_TOKEN=')) {
      updated = updated.replace(/^GA4_REFRESH_TOKEN=.*/m, `GA4_REFRESH_TOKEN=${refreshToken}`)
    } else {
      updated = updated.trimEnd() + `\nGA4_REFRESH_TOKEN=${refreshToken}\n`
    }
    writeFileSync(envPath, updated)

    res.end('<h2 style="font-family:sans-serif;color:green">✅ Gelukt! Je kan dit tabblad sluiten.</h2>')
    console.log('\n✅ Refresh token opgeslagen in .env.local')
    console.log('Herstart de dev server en open /analytics in het platform.\n')
    server.close()
    process.exit(0)
  } catch (e) {
    res.end('Fout: ' + e.message)
    console.error('\nFout:', e.message)
    server.close()
    process.exit(1)
  }
})

server.listen(4444)
