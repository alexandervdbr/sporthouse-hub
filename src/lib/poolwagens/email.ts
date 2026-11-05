// Is dit een e-mailadres? Apart van mail.ts, zodat het scherm dit kan
// gebruiken zonder googleapis mee te nemen naar de browser. Dezelfde regel
// als pool_set_mail_recipients() in de database (0078).

const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value)
}
