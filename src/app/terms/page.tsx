import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection, Fill } from '@/components/public/PublicShell'
import { LEGAL } from '@/lib/legal'

// Public on purpose (see lib/supabase/middleware): registered on the Google
// OAuth consent screen as the Terms of Service link.

export const metadata: Metadata = {
  title: 'Terms of Service — Sporthouse Hub',
  description: 'The terms that apply to using Sporthouse Hub, the internal platform of SporthouseGroup.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/terms' },
}

export default function TermsPage() {
  const mail = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>

  return (
    <LegalPage
      title="Terms of Service"
      updated={LEGAL.termsLastUpdated}
      intro={
        <p>
          These terms apply to your use of {LEGAL.appName}, the internal platform operated by{' '}
          <Fill value={LEGAL.legalEntity} missing="legal entity name" /> (&quot;{LEGAL.operator}&quot;, &quot;we&quot;).
          By signing in, you agree to them. If you work for {LEGAL.operator} as an employee or freelancer, these terms
          add to your employment or service agreement. Where the two conflict, your agreement takes precedence.
        </p>
      }
    >
      <LegalSection id="service" title="1. The service">
        <p>
          {LEGAL.appName} is an internal work platform for {LEGAL.operator} staff and freelancers. It is used to manage
          clients, projects, files, planning, equipment and related work. It is not offered to the public.
        </p>
      </LegalSection>

      <LegalSection id="accounts" title="2. Accounts and access">
        <ul>
          <li>Accounts are created by an administrator. You sign in with the Google account linked to your invitation.</li>
          <li>Your account is personal. Do not share it or let anyone else use your session.</li>
          <li>What you can see and do depends on the role an administrator assigns to you.</li>
          <li>We can change, suspend or end your access at any time, for example when your work with {LEGAL.operator}{' '}
            ends. Temporary accounts end automatically on their expiry date.</li>
          <li>Tell us right away at {mail} if you think someone else has accessed your account.</li>
        </ul>
      </LegalSection>

      <LegalSection id="acceptable-use" title="3. Acceptable use">
        <p>You agree to use {LEGAL.appName} only for your work for {LEGAL.operator}, and not to:</p>
        <ul>
          <li>access data or parts of the platform you have not been given access to;</li>
          <li>upload content that is unlawful, infringes someone else&apos;s rights, or contains malware;</li>
          <li>share confidential client or company information with people who should not have it, including through share links;</li>
          <li>try to disrupt, overload, probe or reverse-engineer the platform;</li>
          <li>use automated tools to extract data from the platform without permission.</li>
        </ul>
      </LegalSection>

      <LegalSection id="content" title="4. Content and confidentiality">
        <p>
          Content you add to {LEGAL.appName} in the course of your work, and the rights to it, are governed by your
          employment or service agreement with {LEGAL.operator}. Information about {LEGAL.operator}&apos;s clients and
          projects is confidential. When you create a share link, anyone with the link can open what it points to. Only
          share what you are allowed to share, and only with the people who need it.
        </p>
      </LegalSection>

      <LegalSection id="third-parties" title="5. Third-party services">
        <p>
          {LEGAL.appName} relies on third-party services such as Google, Supabase, Vercel and Anthropic. Their own
          terms apply to your use of them, for example Google&apos;s terms to your Google account. How we share data
          with them is described in our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection id="availability" title="6. Availability">
        <p>
          We work to keep {LEGAL.appName} available and reliable, but we provide it as it is, without a guarantee of
          uninterrupted or error-free operation. We may change, add or remove features at any time.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="7. Liability">
        <p>
          To the extent permitted by law, {LEGAL.operator} is not liable for indirect damage, or for loss of data or
          profit, resulting from the use of or inability to use {LEGAL.appName}. Nothing in these terms limits
          liability that cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection id="privacy" title="8. Privacy">
        <p>
          How we handle personal data, including data from your Google account, is described in our{' '}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="9. Changes to these terms">
        <p>
          We may update these terms. We change the date at the top of this page when we do. If you keep using{' '}
          {LEGAL.appName} after a change, you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection id="law" title="10. Governing law">
        <p>
          <Fill value={LEGAL.governingLaw} missing="governing law and competent courts" />
        </p>
      </LegalSection>

      <LegalSection id="contact" title="11. Contact">
        <p>Questions about these terms: {mail}.</p>
      </LegalSection>
    </LegalPage>
  )
}
