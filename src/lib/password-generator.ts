// Wachtwoordgenerator voor Wachtwoorden. Draait volledig in de browser met
// crypto.getRandomValues — er gaat niets over het netwerk.
//
// Tekens die op elkaar lijken (0/O, 1/l/I) zijn weggelaten: deze wachtwoorden
// worden soms overgetypt op een telefoon of tv-scherm. Elk wachtwoord bevat
// minstens één kleine letter, hoofdletter, cijfer en symbool, omdat veel
// platforms dat eisen.

const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%&*-_=+?'
const ALL = LOWER + UPPER + DIGITS + SYMBOLS

export const DEFAULT_PASSWORD_LENGTH = 20

// Uniform willekeurig getal in [0, max). Rejection sampling in plaats van
// `% max`, want modulo maakt de eerste tekens van de set iets waarschijnlijker.
function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % max
  }
}

function pick(set: string): string {
  return set[randomIndex(set.length)]
}

export function generatePassword(length: number = DEFAULT_PASSWORD_LENGTH): string {
  if (!Number.isInteger(length) || length < 4) throw new Error('Wachtwoord moet minstens 4 tekens lang zijn.')

  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)]
  while (chars.length < length) chars.push(pick(ALL))

  // Fisher–Yates, zodat de verplichte tekens niet altijd vooraan staan.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
