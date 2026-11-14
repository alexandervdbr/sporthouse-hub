import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// De AI-documentchat (POST /api/chat) is verwijderd: geen enkele component
// riep hem aan. De teamchat (/chat, uitgezet via CHAT_ENABLED) gebruikt alleen
// de subroutes onder /api/chat/, en die blijven.

const API = path.resolve(__dirname, '../../app/api/chat')

describe('/api/chat', () => {
  it('heeft geen route meer op /api/chat zelf', () => {
    expect(fs.existsSync(path.join(API, 'route.ts'))).toBe(false)
  })

  it.each(['channels', 'members', 'messages', 'read', 'reorder', 'unread'])('de teamchat-subroute /api/chat/%s blijft', (sub) => {
    expect(fs.existsSync(path.join(API, sub))).toBe(true)
  })
})
