// Onderdelen die tijdelijk in de koelkast staan: de code, de routes en de
// data blijven bestaan, ze worden alleen nergens meer aangeboden. Terugzetten
// is deze waarde op true zetten — meer niet.

// Projectkalender (/events en de klanttool "Projectkalender"). Uitgezet op
// 2026-10-28: op dit moment niet in gebruik. De tabel project_events en
// /api/events blijven staan, dus bestaande events gaan niet verloren.
export const PROJECTKALENDER_ENABLED = false

// Chat (/chat, het ongelezen-teller in de zijbalk). Uitgezet op 2026-10-29:
// na het verlies van de database waren er geen kanalen meer, en de chat is op
// dit moment niet in gebruik. Tabellen en /api/chat blijven staan. Uit staan
// scheelt ook een verzoek en een live-verbinding bij elke paginalading.
export const CHAT_ENABLED = false
