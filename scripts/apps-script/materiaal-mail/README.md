# Mail- en agendascript materiaalplanner

Een eigen Google Apps Script-project, los van de poolwagenmail. Het verstuurt
de mails van de materiaalplanner met MailApp (alleen versturen, geen toegang
tot de mailbox) als **Sporthouse Materiaal**, en houdt per boeking een echte
afspraak bij in Google Calendar:

- **bevestiging** bij een nieuwe boeking of nieuwe data, naar de persoon, de
  maker (als die iemand anders is) en de contactpersoon van verantwoordelijk
  materiaal;
- **annulering** naar dezelfde ontvangers;
- **herinnering** op de ochtend van de terugbrengdag, naar de persoon en de maker;
- **agenda**: een afspraak in de agenda *Sporthouse Materiaal* op dit account,
  met alleen de persoon voor wie geboekt is als gast (wie voor iemand anders
  boekt, krijgt de mail maar geen afspraak). Google stuurt zelf geen mails
  (geen uitnodiging, wijziging of annulering): onze mails volstaan. Bij een
  Google-account verschijnt, verschuift en verdwijnt de afspraak toch in de
  agenda van de gast; een niet-Google-adres krijgt alleen onze mail. Nieuwe
  data verplaatsen de afspraak, annuleren haalt ze weg.
  Zonder uren een afspraak over hele dagen, met uren op Brusselse tijd.

Elke mail heeft onderaan het Sporthouse-logo met "Sporthouse Materiaal".

De hub maakt de inhoud en houdt een logboek bij (`gear_mail_log`), zodat
niemand een mail twee keer krijgt. Het id van de afspraak staat op de boeking
(`gear_bookings.calendar_event_id`, met `calendar_error` als het misliep). Een
mislukte mail of afspraak houdt een boeking nooit tegen. Voor boekingen die al
voorbij waren (achteraf ingevoerd) komt er geen mail en geen afspraak.

## De agenda

Tip voor het verzendaccount: de agenda *Sporthouse Materiaal* is het overzicht
van alle boekingen. Boek je voor jezelf, dan zie je de afspraak daar én als
uitnodiging in je hoofdagenda (één afspraak, twee agenda's). Vink de agenda
links in Google Calendar uit als je ze niet dubbel wil zien.

Het script gebruikt een eigen agenda **Sporthouse Materiaal** op het
verzendaccount, niet de hoofdagenda. Bestaat ze nog niet, dan maakt het script
ze aan (tijdzone Europe/Brussels) en bewaart het id in de scripteigenschap
`CALENDAR_ID`. Wil je een andere agenda, zet dan zelf haar id in `CALENDAR_ID`.

## Instellen (eenmalig)

1. Ga met het Workspace-account dat moet versturen naar script.google.com → **Nieuw project**, naam *Sporthouse Materiaal mail*.
2. Vervang de inhoud van `Code.gs` door [Code.gs](Code.gs) uit deze map en sla op.
3. **Services** (links, +) → **Google Calendar API** toevoegen (id `Calendar`).
4. **Projectinstellingen** (tandwiel): zet *Tijdzone* op `(GMT+01:00) Brussel` (`Europe/Brussels`).
5. Onder **Scripteigenschappen** voeg je toe:
   - `SECRET`: een willekeurige tekst van minstens 32 tekens (bv. `openssl rand -hex 32`);
   - `PLATFORM_URL`: het adres van de hub, zonder `/` op het einde.
6. **Uitvoeren → `testAgenda`** en geef toestemming (e-mail versturen, je agenda's beheren, externe verzoeken). De agenda *Sporthouse Materiaal* verschijnt; daarna **`testMail`** voor een testmail.
7. **Implementeren → Nieuwe implementatie → Web-app**: *Uitvoeren als:* ik, *Wie heeft toegang:* Iedereen. Kopieer de URL die op `/exec` eindigt.
8. In Vercel (Settings → Environment Variables, Production):
   - `MATERIAAL_MAIL_WEBHOOK_URL` = die `/exec`-URL;
   - `MATERIAAL_MAIL_SECRET` = dezelfde waarde als `SECRET`.
   Redeploy de hub daarna, zodat hij de variabelen leest.
9. **Uitvoeren → `installeerTrigger`**: de dagelijkse trigger om 07:00 Brussel. Controleer onder **Triggers** (wekker-icoon) dat `dagelijks` er staat.
10. Test: boek iets voor jezelf → bevestigingsmail met het logo onderaan, en een uitnodiging van Google Calendar.

Wijzig je later `Code.gs`, dan **Implementeren → Implementaties beheren → bewerken → Versie: Nieuwe versie**, zodat de `/exec`-URL dezelfde blijft. Alleen opslaan is niet genoeg: de webapp draait de gepubliceerde versie.
