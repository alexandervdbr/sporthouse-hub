import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { DEV_TOOLS, toolForPath, toStatusMap, isInDevelopment } from '@/lib/tool-status'

describe('toolForPath', () => {
  it('vindt de tool voor zijn eigen pad en de subroutes', () => {
    expect(toolForPath('/planning')?.key).toBe('planning')
    expect(toolForPath('/equipment')?.key).toBe('materiaal')
    expect(toolForPath('/equipment/stats')?.key).toBe('materiaal')
    expect(toolForPath('/equipment/extern')?.key).toBe('materiaal')
    expect(toolForPath('/materiaal')?.key).toBe('materiaalplanner')
    expect(toolForPath('/materiaal/beheer')?.key).toBe('materiaalplanner')
    expect(toolForPath('/materiaal/unit/abc')?.key).toBe('materiaalplanner')
  })

  it('pakt geen pad dat er alleen op lijkt', () => {
    expect(toolForPath('/planningen')).toBeNull()
    expect(toolForPath('/dashboard')).toBeNull()
    expect(toolForPath('/admin')).toBeNull()
  })

  it('elke tool wijst naar een pagina die bestaat', () => {
    const appDir = path.resolve(__dirname, '../../app/(app)')
    for (const t of DEV_TOOLS) {
      const page = path.join(appDir, t.path, 'page.tsx')
      // Alleen pagina's onder (app) lopen door AppShell en dus door de poort.
      // Een tool erbuiten zou in Beheer op "in
      // ontwikkeling" kunnen staan zonder dat er iets afgeschermd wordt.
      expect(fs.existsSync(page), `${t.key}: ${page} ontbreekt`).toBe(true)
    }
  })
})

describe('toStatusMap', () => {
  it('laat onbekende tools vallen en zet ontbrekende op live', () => {
    const map = toStatusMap([
      { tool: 'planning', in_development: true, message: 'Even geduld' },
      { tool: 'bestaat-niet', in_development: true, message: null },
    ])
    expect(isInDevelopment(map, 'planning')).toBe(true)
    expect(map.planning.message).toBe('Even geduld')
    expect(isInDevelopment(map, 'bestaat-niet')).toBe(false)
    expect(isInDevelopment(map, 'materiaal')).toBe(false)
  })

  it('kan tegen een mislukte query (tabel nog niet aangemaakt)', () => {
    expect(toStatusMap(null)).toEqual({})
  })
})
