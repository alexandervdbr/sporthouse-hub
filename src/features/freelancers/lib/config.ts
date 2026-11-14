// Instellingen van de freelancertool, op één plek. Elke waarde hier is met
// één regel te wijzigen.

/** Model voor de AI-match. Andere Claude-calls in de app volgen dit niet. */
export const MATCH_MODEL = 'claude-sonnet-4-6'

/**
 * Hoe een medewerker een bijlage downloadt.
 *  - 'tijdelijke-deling': het bestand wordt na de rechtencheck tijdelijk
 *    gedeeld als "iedereen met de link" en na PUBLIC_SHARE_TTL_MS
 *    ingetrokken. Werkt altijd.
 *  - 'webviewlink': doorsturen naar de Drive-pagina van het bestand, zonder
 *    deling. Werkt alleen als de medewerker zelf toegang heeft tot de
 *    Shared Drive (via Workspace).
 * Standaard de tijdelijke deling, tot bevestigd is dat het team de Shared
 * Drive zelf kan openen.
 */
export type InternalDownloadMode = 'tijdelijke-deling' | 'webviewlink'
export const INTERNAL_DOWNLOAD_MODE: InternalDownloadMode = 'tijdelijke-deling'

/** Hoe lang een publieke deling van één bestand mag blijven staan. */
export const PUBLIC_SHARE_TTL_MS = 60 * 60 * 1000

/** Uploads: per verzoek en per opdracht. De grootte volgt MAX_UPLOAD_BYTES (2 GB). */
export const MAX_FILES_PER_REQUEST = 20
export const MAX_FILES_PER_ASSIGNMENT = 100

/** Pincode: pogingen, blokkering en de escalatie (V3). */
export const PIN_MAX_ATTEMPTS = 5
export const PIN_LOCK_MINUTES = 15
export const LOCKOUTS_BEFORE_HARD_LOCK = 3
export const LOCKOUT_WINDOW_HOURS = 24

/** Hoe lang een afgeronde of geweigerde opdracht nog op de link staat. */
export const RECENT_DAYS_ON_LINK = 30
