// Bouwt de proefdraai-scripts voor de freelancermigraties:
//
//   supabase/freelancers/0092_proefdraai.sql = begin; 0092; 0092-checks; rollback;
//   supabase/freelancers/0093_proefdraai.sql = begin; 0092; 0093; 0093-checks; rollback;
//
// De SQL-editor van Supabase kan geen ander bestand invoegen, dus een
// proefdraai moet de migraties letterlijk bevatten. Die kopie wordt hier
// gemaakt in plaats van met de hand, zodat ze nooit afwijkt van de echte
// migratie: src/lib/__tests__/freelancers-migration.test.ts faalt als een
// proefdraai niet meer overeenkomt met wat dit script nu zou maken.
//
// Gebruik:  node scripts/freelancers-proefdraai.mjs
// Na elke wijziging aan 0092, 0093, 0092_test.sql of 0093_test.sql opnieuw draaien.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8')

const M0092 = 'supabase/migrations/0092_freelancers_rls_niveaus.sql'
const M0093 = 'supabase/migrations/0093_freelancers_datamodel.sql'
const T0092 = 'supabase/freelancers/0092_test.sql'
const T0093 = 'supabase/freelancers/0093_test.sql'

/** De controles uit een testscript: alles tussen de regel "begin;" en de laatste regel "rollback;". */
export function checksOf(sql, name) {
  const lines = sql.split('\n')
  const start = lines.indexOf('begin;')
  const end = lines.lastIndexOf('rollback;')
  if (start < 0 || end <= start) throw new Error(`${name}: geen begin; … rollback; gevonden`)
  return lines.slice(start + 1, end).join('\n').trim()
}

const banner = title => `-- ${'═'.repeat(76)}\n-- ${title}\n-- ${'═'.repeat(76)}`

function build({ title, intro, guard, parts, success }) {
  return [
    `-- ${title}`,
    '--',
    '-- GEGENEREERD door scripts/freelancers-proefdraai.mjs — niet met de hand',
    '-- wijzigen; pas de bronbestanden aan en draai het script opnieuw.',
    '--',
    ...intro.map(l => (l ? `-- ${l}` : '--')),
    '',
    'begin;',
    '',
    ...(guard ? [guard, ''] : []),
    ...parts.flatMap(([label, sql]) => [banner(label), '', sql.trim(), '']),
    'rollback;',
    '',
    '-- Na de rollback, zodat de SQL-editor (die alleen het laatste resultaat',
    '-- toont) dit laat zien. Bij een fout hierboven stopt het script en komt het',
    '-- hier nooit.',
    `select '${success}' as resultaat;`,
    '',
  ].join('\n')
}

export function buildAll() {
  const m0092 = read(M0092)
  const m0093 = read(M0093)

  const p0092 = build({
    title: 'Proefdraai van 0092 (freelancers: RLS volgt bekijken/beheren).',
    intro: [
      'Voert 0092 uit, controleert het resultaat (ook als ingelogde gebruikers',
      'met verschillende rechten) en draait ALLES terug. Er blijft niets achter,',
      'ook niet als alles slaagt. Werkt zowel vóór als na 0092: 0092 is',
      'herhaalbaar (create or replace / drop policy if exists).',
      '',
      'Verwacht: één rij "Proefdraai 0092 geslaagd — er is niets blijven staan".',
      'Bij een fout: een melding (TEST MISLUKT: … of een SQL-fout), en ook dan',
      'is alles teruggedraaid.',
    ],
    parts: [
      [`0092 — ${M0092}`, m0092],
      [`Controles — uit ${T0092}`, checksOf(read(T0092), T0092)],
    ],
    success: 'Proefdraai 0092 geslaagd — er is niets blijven staan',
  })

  const p0093 = build({
    title: 'Proefdraai van 0092 + 0093 (freelancers: rechten en het nieuwe datamodel).',
    intro: [
      'Voert 0092 en 0093 uit op de echte data, controleert het resultaat en',
      'draait ALLES terug. Er blijft niets achter, ook niet als alles slaagt.',
      '',
      '0092 staat er altijd in: is hij al uitgevoerd, dan doet hij hier opnieuw',
      'hetzelfde (herhaalbaar) en wordt ook dat teruggedraaid. 0093 mag nog niet',
      'uitgevoerd zijn; dan stopt dit script meteen (gebruik dan 0093_test.sql).',
      '',
      'Verwacht: één rij "Proefdraai 0092 + 0093 geslaagd — er is niets blijven staan".',
      'Bij een fout: een melding (Migratie 0093 gestopt: …, Controle 0093: …,',
      'TEST MISLUKT: … of een SQL-fout), en ook dan is alles teruggedraaid.',
    ],
    guard: [
      'do $$',
      'begin',
      "  if to_regclass('public.freelancer_disciplines') is not null then",
      "    raise exception 'Proefdraai gestopt: 0093 is al uitgevoerd. Draai supabase/freelancers/0093_test.sql in plaats van dit script.';",
      '  end if;',
      'end $$;',
    ].join('\n'),
    parts: [
      [`0092 — ${M0092}`, m0092],
      [`0093 — ${M0093}`, m0093],
      [`Controles — uit ${T0093}`, checksOf(read(T0093), T0093)],
    ],
    success: 'Proefdraai 0092 + 0093 geslaagd — er is niets blijven staan',
  })

  return {
    'supabase/freelancers/0092_proefdraai.sql': p0092,
    'supabase/freelancers/0093_proefdraai.sql': p0093,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [file, sql] of Object.entries(buildAll())) {
    fs.writeFileSync(path.join(ROOT, file), sql)
    console.log(`geschreven: ${file} (${sql.split('\n').length} regels)`)
  }
}
