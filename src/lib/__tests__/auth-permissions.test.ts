import { describe, it, expect } from 'vitest'
import { hasSection, hasOpenSection, ADMIN_EMAILS } from '@/lib/auth-permissions'

// Het verschil tussen deze twee functies is één tak, en die tak bepaalt wat er
// gebeurt met een account waarvoor nooit permissies zijn ingesteld. Pré-assist
// liep daarop stuk: de pagina liet zo iemand binnen, de download- en
// thumbnail-route gaven hem 403, en de RLS uit 0032 liet hem toe. Dezelfde
// vraag, drie antwoorden. Daarom staan ze hier naast elkaar.

const niemand = { email: 'stagiair@sporthousegroup.com', app_metadata: { permissions: { sections: [] } } }
const metSectie = { email: 'collega@sporthousegroup.com', app_metadata: { permissions: { sections: ['preassist'] } } }
const nooitIngesteld = { email: 'nieuw@sporthousegroup.com', app_metadata: {} }
const admin = { email: ADMIN_EMAILS[0], app_metadata: {} }

describe('hasOpenSection', () => {
  it('laat iemand met de sectie binnen', () => {
    expect(hasOpenSection(metSectie, 'preassist')).toBe(true)
  })

  it('houdt iemand buiten die permissies heeft zonder deze sectie', () => {
    expect(hasOpenSection(niemand, 'preassist')).toBe(false)
  })

  it('laat een account zonder ingestelde permissies alles doen', () => {
    // Dit is de hele reden dat deze functie naast hasSection bestaat, en het
    // is dezelfde keuze als user_has_open_section() in migratie 0032.
    expect(hasOpenSection(nooitIngesteld, 'preassist')).toBe(true)
    expect(hasOpenSection(nooitIngesteld, 'preassist_verwijderen')).toBe(true)
  })

  it('laat een admin altijd binnen', () => {
    expect(hasOpenSection(admin, 'preassist')).toBe(true)
  })

  it('is niet in de war van een leeg of ontbrekend gebruikersobject', () => {
    expect(hasOpenSection(null, 'preassist')).toBe(true)
    expect(hasOpenSection(undefined, 'preassist')).toBe(true)
  })
})

describe('hasSection blijft weigeren bij twijfel', () => {
  it('houdt een account zonder ingestelde permissies buiten', () => {
    // Het omgekeerde van hierboven, en daar hoort het ook zo: Wachtwoorden
    // moet niet opengaan omdat er nog niets is ingesteld.
    expect(hasSection(nooitIngesteld, 'wachtwoorden_bekijken')).toBe(false)
  })

  it('en laat iemand met de sectie wel binnen', () => {
    expect(hasSection(metSectie, 'preassist')).toBe(true)
  })
})
