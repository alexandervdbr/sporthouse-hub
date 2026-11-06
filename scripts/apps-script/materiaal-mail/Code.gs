/**
 * Sporthouse Materiaal — mailscript (los van de poolwagenmail).
 *
 * 1. doPost: de hub stuurt hier een mail naartoe (JSON met het gedeelde
 *    geheim, met bijlagen en inline-afbeeldingen zoals het logo); het script
 *    verstuurt die met MailApp als "Sporthouse Materiaal"
 *    (alleen versturen; geen toegang tot de mailbox)
 *    en antwoordt met { ok: true } of { ok: false, error }.
 * 2. dagelijks: een tijdgestuurde trigger (elke dag rond 07:00, Brussel)
 *    vraagt de hub om de herinneringen van vandaag te versturen. De hub
 *    houdt een logboek bij: twee keer lopen verstuurt niets twee keer.
 *
 * Scripteigenschappen (Projectinstellingen → Scripteigenschappen):
 *   SECRET        minstens 32 tekens; dezelfde waarde als MATERIAAL_MAIL_SECRET in Vercel
 *   PLATFORM_URL  bv. https://hub.sporthouse.be (zonder / op het einde)
 *
 * Zie README.md in deze map voor de installatie.
 */

var SENDER_NAME = 'Sporthouse Materiaal';
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

    var to = [].concat(body.to || []).filter(isEmail_);
    if (to.length === 0) return json_({ ok: false, error: 'Geen geldige ontvanger.' });
    if (to.length > MAX_RECIPIENTS) return json_({ ok: false, error: 'Te veel ontvangers.' });
    var subject = String(body.subject || '').replace(/[\r\n]+/g, ' ').slice(0, 250);
    if (!subject) return json_({ ok: false, error: 'Onderwerp ontbreekt.' });

    var attachments = [].concat(body.attachments || []).map(function (a) {
      return Utilities.newBlob(Utilities.base64Decode(a.base64), a.mimeType || 'application/octet-stream', a.name || 'bijlage');
    });
    // Inline-afbeeldingen (het logo): in de html als <img src="cid:logo">.
    var inlineImages = {};
    [].concat(body.inlineImages || []).forEach(function (img) {
      if (!img || !/^[a-z0-9_-]{1,40}$/i.test(img.cid || '')) return;
      inlineImages[img.cid] = Utilities.newBlob(Utilities.base64Decode(img.base64), img.mimeType || 'image/png', img.name || img.cid);
    });

    MailApp.sendEmail(to.join(','), subject, String(body.text || ''), {
      htmlBody: String(body.html || ''),
      name: SENDER_NAME,
      attachments: attachments,
      inlineImages: inlineImages,
    });
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err).slice(0, 300) });
  }
}

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
