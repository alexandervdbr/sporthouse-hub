/**
 * Sporthouse Materiaal — mail- en agendascript (los van de poolwagenmail).
 *
 * 1. doPost, mail: de hub stuurt een mail (JSON met het gedeelde geheim, met
 *    inline-afbeeldingen zoals het logo); het script verstuurt die met MailApp
 *    als "Sporthouse Materiaal" (alleen versturen; geen toegang tot de mailbox).
 * 2. doPost, action "agenda": de hub maakt, verplaatst of verwijdert de
 *    afspraak van een boeking in de agenda "Sporthouse Materiaal" op dit
 *    account, met de ontvangers als gasten. Google stuurt zelf de uitnodiging,
 *    de wijziging en de annulering (sendUpdates: all). Antwoordt met het id.
 *    Tijden komen als Brusselse kloktijd met timeZone Europe/Brussels; het
 *    script rekent niets om.
 * 3. dagelijks: een tijdgestuurde trigger (elke dag rond 07:00, Brussel)
 *    vraagt de hub om de herinneringen van vandaag te versturen. De hub
 *    houdt een logboek bij: twee keer lopen verstuurt niets twee keer.
 *
 * Nodig: de geavanceerde dienst "Google Calendar API" (Services → +, id
 * "Calendar"). Scripteigenschappen (Projectinstellingen → Scripteigenschappen):
 *   SECRET        minstens 32 tekens; dezelfde waarde als MATERIAAL_MAIL_SECRET in Vercel
 *   PLATFORM_URL  bv. https://hub.sporthouse.be (zonder / op het einde)
 *   CALENDAR_ID   zet het script zelf, bij de eerste afspraak
 *
 * Zie README.md in deze map voor de installatie.
 */

var SENDER_NAME = 'Sporthouse Materiaal';
var CALENDAR_NAME = 'Sporthouse Materiaal';
var MAX_RECIPIENTS = 10;

function prop_(name) {
  return PropertiesService.getScriptProperties().getProperty(name) || '';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Geheimen vergelijken zonder vroeg te stoppen bij het eerste verschil. */
function sameSecret_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isEmail_(s) {
  return typeof s === 'string' && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s);
}

function doPost(e) {
  try {
    var secret = prop_('SECRET');
    if (secret.length < 32) return json_({ ok: false, error: 'SECRET ontbreekt of is te kort in de scripteigenschappen.' });
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!sameSecret_(body.secret, secret)) return json_({ ok: false, error: 'Ongeldig geheim.' });
    if (body.action === 'agenda') return json_(agenda_(body));
    return json_(mail_(body));
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err).slice(0, 300) });
  }
}

// ── Mail ──────────────────────────────────────────────────────────────────────

function mail_(body) {
  var to = [].concat(body.to || []).filter(isEmail_);
  if (to.length === 0) return { ok: false, error: 'Geen geldige ontvanger.' };
  if (to.length > MAX_RECIPIENTS) return { ok: false, error: 'Te veel ontvangers.' };
  var subject = String(body.subject || '').replace(/[\r\n]+/g, ' ').slice(0, 250);
  if (!subject) return { ok: false, error: 'Onderwerp ontbreekt.' };

  // Inline-afbeeldingen (het logo): in de html als <img src="cid:logo">. De
  // sleutel hier moet gelijk zijn aan de cid.
  var inlineImages = {};
  [].concat(body.inlineImages || []).forEach(function (img) {
    if (!img || !/^[a-z0-9_-]{1,40}$/i.test(img.cid || '')) return;
    inlineImages[img.cid] = Utilities.newBlob(Utilities.base64Decode(img.base64), img.mimeType || 'image/png', img.name || img.cid);
  });

  MailApp.sendEmail(to.join(','), subject, String(body.text || ''), {
    htmlBody: String(body.html || ''),
    name: SENDER_NAME,
    inlineImages: inlineImages,
  });
  return { ok: true };
}

// ── Agenda ────────────────────────────────────────────────────────────────────

/** De agenda "Sporthouse Materiaal" op dit account; maakt ze aan als ze er nog niet is. */
function calendarId_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CALENDAR_ID');
  if (id) {
    try { Calendar.Calendars.get(id); return id; } catch (err) { /* verdwenen: opnieuw zoeken */ }
  }
  var found = CalendarApp.getOwnedCalendarsByName(CALENDAR_NAME);
  id = found.length ? found[0].getId()
    : Calendar.Calendars.insert({ summary: CALENDAR_NAME, timeZone: 'Europe/Brussels' }).id;
  props.setProperty('CALENDAR_ID', id);
  return id;
}

/**
 * op "upsert": afspraak maken, of (met eventId) bijwerken: tijden, titel,
 * beschrijving en gasten. op "delete": weghalen. Google mailt de gasten.
 * event = { summary, description, start, end, attendees } in de vorm van de
 * Calendar API: { date } voor hele dagen, { dateTime, timeZone } met uren.
 */
function agenda_(body) {
  var calId = calendarId_();
  var opts = { sendUpdates: 'all' };
  if (body.op === 'delete') {
    if (!body.eventId) return { ok: true };
    try { Calendar.Events.remove(calId, body.eventId, opts); }
    catch (err) { if (!/not found|deleted|404|410/i.test(String(err))) throw err; }
    return { ok: true };
  }
  var ev = body.event || {};
  var resource = {
    summary: String(ev.summary || 'Materiaal').slice(0, 250),
    description: String(ev.description || '').slice(0, 4000),
    start: ev.start,
    end: ev.end,
    attendees: [].concat(ev.attendees || []).filter(function (a) { return a && isEmail_(a.email); }).slice(0, MAX_RECIPIENTS),
    guestsCanModify: false,
    reminders: { useDefault: true },
  };
  if (body.eventId) {
    try {
      var updated = Calendar.Events.update(resource, calId, body.eventId, opts);
      return { ok: true, eventId: updated.id };
    } catch (err) {
      if (!/not found|deleted|404|410/i.test(String(err))) throw err;
      // Intussen weg uit de agenda: opnieuw maken.
    }
  }
  var created = Calendar.Events.insert(resource, calId, opts);
  return { ok: true, eventId: created.id };
}

// ── Herinneringen ─────────────────────────────────────────────────────────────

/** Door de trigger aangeroepen: de hub verstuurt de herinneringen van vandaag. */
function dagelijks() {
  var url = prop_('PLATFORM_URL').replace(/\/$/, '') + '/api/materiaal/mail/due';
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: { Authorization: 'Bearer ' + prop_('SECRET') },
    muteHttpExceptions: true,
  });
  console.log('Herinneringen: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 500));
}

/**
 * Eén keer uitvoeren (Uitvoeren → installeerTrigger): zet de dagelijkse
 * trigger om 07:00 Brussel. Opnieuw uitvoeren vervangt de oude trigger.
 */
function installeerTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dagelijks') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dagelijks').timeBased().everyDays(1).atHour(7).nearMinute(0).inTimezone('Europe/Brussels').create();
}

/** Om te testen (Uitvoeren → testMail): stuurt een mail naar jezelf. */
function testMail() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Test Sporthouse Materiaal', 'Het mailscript werkt.', { name: SENDER_NAME });
}

/** Om te testen (Uitvoeren → testAgenda): maakt de agenda aan als die er nog niet is, en vraagt de toestemming. */
function testAgenda() {
  console.log('Agenda: ' + calendarId_());
}
