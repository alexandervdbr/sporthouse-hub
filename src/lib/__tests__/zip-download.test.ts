import { describe, it, expect } from 'vitest'
import { uniqueZipPath } from '@/lib/zip-download'

// JSZip overschrijft een pad dat al bestaat zonder iets te zeggen, en de zip
// van Pré-assist stelt zijn paden zelf samen uit sectie, klant, inzender en
// bestandsnaam. Twee keer "IMG_0042.jpg" van dezelfde persoon voor dezelfde
// klant leverde dus één bestand op. Dit is de functie die dat opvangt.

describe('uniqueZipPath', () => {
  it('laat een pad dat nog vrij is ongemoeid', () => {
    const taken = new Set<string>()
    expect(uniqueZipPath(taken, 'Content/Club Brugge/Arne — foto.jpg')).toBe('Content/Club Brugge/Arne — foto.jpg')
  })

  it('zet een teller vóór de extensie bij een dubbel pad', () => {
    const taken = new Set<string>()
    const p = 'Content/Club Brugge/Arne — IMG_0042.jpg'
    expect(uniqueZipPath(taken, p)).toBe(p)
    expect(uniqueZipPath(taken, p)).toBe('Content/Club Brugge/Arne — IMG_0042 (2).jpg')
    expect(uniqueZipPath(taken, p)).toBe('Content/Club Brugge/Arne — IMG_0042 (3).jpg')
  })

  it('blijft doortellen als de genummerde naam zelf ook al bezet is', () => {
    const taken = new Set<string>(['a.jpg', 'a (2).jpg'])
    expect(uniqueZipPath(taken, 'a.jpg')).toBe('a (3).jpg')
  })

  it('ziet een punt in een mapnaam niet als extensie', () => {
    const taken = new Set<string>()
    expect(uniqueZipPath(taken, 'Inspiratie/dhr. Jansen/clip')).toBe('Inspiratie/dhr. Jansen/clip')
    expect(uniqueZipPath(taken, 'Inspiratie/dhr. Jansen/clip')).toBe('Inspiratie/dhr. Jansen/clip (2)')
  })

  it('houdt verschillende klanten los van elkaar', () => {
    const taken = new Set<string>()
    expect(uniqueZipPath(taken, 'Content/Club Brugge/Arne — foto.jpg')).toBe('Content/Club Brugge/Arne — foto.jpg')
    expect(uniqueZipPath(taken, 'Content/KRC Genk/Arne — foto.jpg')).toBe('Content/KRC Genk/Arne — foto.jpg')
  })
})
