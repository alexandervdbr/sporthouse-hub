/**
 * Sporthouse Hub — mail-worker voor Poolwagens (Google Apps Script).
 *
 * De hub (src/lib/poolwagens/mail.ts) stuurt hier een POST met
 *   { secret, to: [...], subject, text, html }
 * en dit script verstuurt de mail met MailApp, als het account waaronder de
 * webapp gedeployed is. Het antwoord is altijd JSON: { ok: true } of
 * { ok: false, error: "..." }.
 *
 * Instellen (eenmalig):
 *   - Projectinstellingen → Scripteigenschappen: SECRET = een lange
 *     willekeurige tekst (minstens 32 tekens), dezelfde als
 *     POOLWAGENS_MAIL_WORKER_SECRET in Vercel.
 *   - Implementeren als webapp: "Uitvoeren als: ik", "Toegang: Iedereen".
 *
 * Het script leest niets, slaat niets op en verstuurt alleen met een
 * kloppend geheim. Maximaal 20 ontvangers per mail.
 */

var SENDER_NAME = 'Sporthouse Poolwagens';
var MAX_RECIPIENTS = 20;
var MIN_SECRET_LENGTH = 32;

function doPost(e) {
  try {
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || secret.length < MIN_SECRET_LENGTH) return reply_({ ok: false, error: 'SECRET in de scripteigenschappen ontbreekt of is te kort.' });

    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!sameText_(String(body.secret || ''), secret)) return reply_({ ok: false, error: 'Geen toegang.' });

    var to = (body.to || []).map(function (a) { return clean_(a); }).filter(isEmail_);
    if (to.length === 0) return reply_({ ok: false, error: 'Geen geldige ontvangers.' });
    if (to.length > MAX_RECIPIENTS) return reply_({ ok: false, error: 'Te veel ontvangers.' });

    MailApp.sendEmail({
      to: to.join(','),
      subject: clean_(body.subject).slice(0, 250) || 'Poolwagens',
      body: String(body.text || ''),
      htmlBody: String(body.html || ''),
      name: SENDER_NAME,
    });
    return reply_({ ok: true });
  } catch (err) {
    return reply_({ ok: false, error: String((err && err.message) || err).slice(0, 300) });
  }
}

/** Een GET (bv. de URL in een browser) doet niets. */
function doGet() {
  return reply_({ ok: false, error: 'Alleen POST.' });
}

/** Even veel tijd, of de tekst nu klopt of niet. */
function sameText_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function clean_(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function isEmail_(value) {
  return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value);
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Eenmalig in de editor uitvoeren (kies "autoriseer" bovenaan en klik op
 * Uitvoeren) om het script toestemming te geven om te mailen. Verstuurt
 * niets; het logboek toont hoeveel mails er vandaag nog kunnen.
 */
function autoriseer() {
  Logger.log('Mails die vandaag nog kunnen: ' + MailApp.getRemainingDailyQuota());
}
