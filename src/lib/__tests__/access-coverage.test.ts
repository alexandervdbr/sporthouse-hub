import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { ALL_SECTION_KEYS, FROZEN_SECTION_KEYS } from '@/lib/access-roles'

// Wakker blijven als iemand een nieuw recht toevoegt.
//
// Een permissiesleutel die de code controleert maar die in geen enkel niveau
// van src/lib/access-roles.ts staat, kan niemand krijgen: de feature is dan
// voor iedereen behalve admins onzichtbaar, zonder dat het beheerscherm het
// zegt. Omgekeerd is een sleutel in de catalogus die nergens gecontroleerd
// wordt een keuzelijst die niets doet. Deze test leest de broncode en de
// migraties en faalt in beide gevallen — met de plek erbij.

const ROOT = path.resolve(__dirname, '../../..')

function walk(dir: string, out: string[] = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') walk(p, out)
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

// De vormen waarin de app een recht controleert. Nieuwe code hoort
// hasSection(user, '…') te gebruiken; de andere vormen staan er omdat ze al
// bestaan.
const CODE_PATTERNS = [
  /\bhas(?:Open)?Section\([^,()]+,\s*['"]([a-z_-]+)['"]\s*\)/g,
  /\bsections(?:\s*\?\?\s*\[\]\s*\))?\s*\??\.includes\(\s*['"]([a-z_-]+)['"]\s*\)/g,
]
const SQL_PATTERNS = [
  /user_has_(?:open_)?section\(\s*'([a-z_-]+)'/g,
  /'sections'\s*\)?\s*\?\s*'([a-z_-]+)'/g,
]
// Menu-items in de zijbalk dragen een section; 'admin' is daar het
// Beheer-item zelf, dat op isAdminUser draait en geen sleutel is.
const SIDEBAR = path.join(ROOT, 'src/components/layout/Sidebar.tsx')
const SIDEBAR_PATTERN = /section:\s*['"]([a-z_-]+)['"]/g
const NOT_A_PERMISSION = new Set(['admin'])

function collectUsedKeys() {
  const used = new Map<string, string>()
  const note = (key: string, where: string) => { if (!used.has(key)) used.set(key, where) }

  for (const file of walk(path.join(ROOT, 'src'))) {
    const rel = path.relative(ROOT, file)
    if (rel === 'src/lib/access-roles.ts') continue
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      for (const re of CODE_PATTERNS) for (const m of line.matchAll(re)) note(m[1], `${rel}:${i + 1}`)
      if (file === SIDEBAR) for (const m of line.matchAll(SIDEBAR_PATTERN)) {
        if (!NOT_A_PERMISSION.has(m[1])) note(m[1], `${rel}:${i + 1}`)
      }
    })
  }

  const migrations = path.join(ROOT, 'supabase/migrations')
  for (const name of fs.readdirSync(migrations)) {
    const sql = fs.readFileSync(path.join(migrations, name), 'utf8')
    for (const re of SQL_PATTERNS) for (const m of sql.matchAll(re)) note(m[1], `supabase/migrations/${name}`)
  }
  return used
}

describe('rechten in de code ↔ catalogus', () => {
  const used = collectUsedKeys()
  const known = new Set([...ALL_SECTION_KEYS, ...FROZEN_SECTION_KEYS])

  it('elk gecontroleerd recht staat in een niveau van src/lib/access-roles.ts', () => {
    const missing = [...used].filter(([key]) => !known.has(key)).map(([key, where]) => `'${key}' (${where})`)
    expect(missing, `Voeg deze toe aan ACCESS_MODULES in src/lib/access-roles.ts: ${missing.join(', ')}`).toEqual([])
  })

  it('elk recht in de catalogus wordt ergens gecontroleerd', () => {
    const unused = [...known].filter(key => !used.has(key))
    expect(unused, `Deze sleutels doen niets — haal ze weg of controleer ze met hasSection(): ${unused.join(', ')}`).toEqual([])
  })
})
