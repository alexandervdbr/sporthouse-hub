# Mailscript materiaalplanner

Een eigen Google Apps Script-project, los van de poolwagenmail. Het verstuurt
de mails van de materiaalplanner met Gmail als **Sporthouse Materiaal**:

- **bevestiging** bij een nieuwe boeking of nieuwe data (met `.ics`), naar de
  persoon, de maker (als die iemand anders is) en de contactpersoon van
  verantwoordelijk materiaal;
- **herinnering** op de ochtend van de terugbrengdag, naar de persoon en de maker.

De hub maakt de inhoud en houdt een logboek bij (`gear_mail_log`), zodat
niemand een mail twee keer krijgt. Een mislukte mail houdt een boeking nooit tegen.

## Instellen (eenmalig)

1. Ga met het Workspace-account dat moet versturen naar script.google.com → **Nieuw project**, naam *Sporthouse Materiaal mail*.
2. Vervang de inhoud van `Code.gs` door [Code.gs](Code.gs) uit deze map en sla op.
3. **Projectinstellingen** (tandwiel): zet *Tijdzone* op `(GMT+01:00) Brussel` (`Europe/Brussels`).
4. Onder **Scripteigenschappen** voeg je toe:
   - `SECRET`: een willekeurige tekst van minstens 32 tekens (bv. `openssl rand -hex 32`);
   - `PLATFORM_URL`: het adres van de hub, zonder `/` op het einde.
5. **Uitvoeren → `testMail`**, en geef toestemming (Gmail en externe verzoeken). Je krijgt een testmail.
6. **Implementeren → Nieuwe implementatie → Web-app**: *Uitvoeren als:* ik, *Wie heeft toegang:* Iedereen. Kopieer de URL die op `/exec` eindigt.
7. In Vercel (Settings → Environment Variables, Production):
   - `MATERIAAL_MAIL_WEBHOOK_URL` = die `/exec`-URL;
   - `MATERIAAL_MAIL_SECRET` = dezelfde waarde als `SECRET`.
8. Redeploy de hub in Vercel, zodat hij de variabelen leest.
9. **Uitvoeren → `installeerTrigger`**: de dagelijkse trigger om 07:00 Brussel. Controleer onder **Triggers** (wekker-icoon) dat `dagelijks` er staat.
10. Test: boek iets voor jezelf → bevestiging met agenda-item. Wil je de herinnering testen, boek iets dat vandaag eindigt en voer `dagelijks` uit.

Wijzig je later `Code.gs`, dan **Implementeren → Implementaties beheren → bewerken → Nieuwe versie**, zodat de `/exec`-URL dezelfde blijft.
