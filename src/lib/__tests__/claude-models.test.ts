import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Claude-modellen in de app.
//  1. Geen enkel uitgefaseerd (of binnenkort uitgefaseerd) model-ID meer in
//     src/: een request naar zo'n model mislukt.
//
// Bron voor de lijst: de modeltabel van Anthropic (stand november 2026).
// Komt er een model bij dat uitgefaseerd wordt, zet het hieronder.

const RETIRED_OR_RETIRING = [
  'claude-sonnet-4-20250514', 'claude-sonnet-4-0',          // uitgefaseerd 15 juni 2026
  'claude-sonnet-4-5-20250929', 'claude-sonnet-4-5',        // uitgefaseerd 30 november 2026
  'claude-opus-4-1', 'claude-opus-4-0', 'claude-opus-4-20250514',
  'claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-haiku', 'claude-3-opus',
]

const ROOT = path.resolve(__dirname, '../../..')
function walk(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(n => {
    const p = path.join(dir, n)
    return fs.statSync(p).isDirectory() ? (n === '__tests__' ? [] : walk(p)) : /\.(ts|tsx|js|mjs)$/.test(n) ? [p] : []
  })
}

describe('geen uitgefaseerde Claude-modellen', () => {
  it('src/ en scripts/ noemen geen uitgefaseerd of bijna-uitgefaseerd model', () => {
    const hits: string[] = []
    for (const file of [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'scripts'))]) {
      const src = fs.readFileSync(file, 'utf8')
      for (const id of RETIRED_OR_RETIRING) {
        if (new RegExp(`['"\`]${id.replace(/[.-]/g, m => `\\${m}`)}(['"\`]|-\\d)`).test(src)) hits.push(`${path.relative(ROOT, file)}: ${id}`)
      }
    }
    expect(hits).toEqual([])
  })
})
