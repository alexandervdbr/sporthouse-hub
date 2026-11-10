import { describe, it, expect } from 'vitest'
import { parseTable, detectColumns, parseImport, buildImportRow, credentialKey } from '../credential-import'

describe('parseTable', () => {
  it('leest geplakte rijen uit Sheets (tabs)', () => {
    expect(parseTable('\tlogin\twachtwoord\nInstagram\tsh\tgeheim\n')).toEqual([
      ['', 'login', 'wachtwoord'],
      ['Instagram', 'sh', 'geheim'],
    ])
  })

  it('leest CSV met puntkomma (Excel NL) en komma', () => {
    expect(parseTable('a;b;c\r\n1;2;3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
    expect(parseTable('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('kent aanhalingstekens, escapes en regeleinden binnen een cel', () => {
    expect(parseTable('p,"a, ""b""","x\ny"')).toEqual([['p', 'a, "b"', 'x\ny']])
  })

  it('slaat lege regels over', () => {
    expect(parseTable('a,b\n\n,\n1,2\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('detectColumns', () => {
  it('neemt de naamloze eerste kolom als platform', () => {
    expect(detectColumns([['', 'login', 'wachtwoord']])).toEqual({
      hasHeader: true,
      columns: { platform: 0, username: 1, password: 2 },
    })
  })

  it('valt zonder kopregel terug op volgorde', () => {
    expect(detectColumns([['Instagram', 'sh', 'geheim']]).hasHeader).toBe(false)
  })
})

describe('parseImport', () => {
  const sheet = [
    '\tlogin\twachtwoord',
    'Instagram\tsporthouse\tGeheim123!',
    'Canva\t\tLog in met google account social@sporthouse.be',
    'Leeg\tiemand\t',
    '\tzonderplatform\tx',
  ].join('\n')

  const rows = parseImport(sheet)

  it('geeft een gewone login als wachtwoord-login', () => {
    expect(rows[0]).toMatchObject({
      line: 2, platform: 'Instagram', username: 'sporthouse', password: 'Geheim123!', login_method: 'password', issue: null,
    })
  })

  it('herkent een Google-login in vrije tekst', () => {
    expect(rows[1]).toMatchObject({
      platform: 'Canva',
      username: 'social@sporthouse.be',
      password: '',
      login_method: 'google',
      notes: 'Log in met google account social@sporthouse.be',
      issue: null,
    })
  })

  it('meldt wat er ontbreekt', () => {
    expect(rows[2].issue).toBe('Wachtwoord ontbreekt')
    expect(rows[3].issue).toBe('Platform ontbreekt')
  })

  it('kan een rij van methode wisselen zonder iets te verliezen', () => {
    const asPassword = buildImportRow(rows[1].raw, rows[1].line, 'password')
    expect(asPassword.login_method).toBe('password')
    expect(asPassword.password).toBe('Log in met google account social@sporthouse.be')
  })
})

describe('credentialKey', () => {
  it('negeert hoofdletters en spaties', () => {
    expect(credentialKey(' Instagram', 'SH ')).toBe(credentialKey('instagram', 'sh'))
  })
})
