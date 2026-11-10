import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection, Fill } from '@/components/public/PublicShell'
import { LEGAL } from '@/lib/legal'

// Public on purpose (see lib/supabase/middleware): this URL is registered both
// on the Google OAuth consent screen and in Meta's App Review for the
// Instagram oEmbed integration. Keep the Instagram section when editing.

export const metadata: Metadata = {
  title: 'Privacy Policy — Sporthouse Hub',
  description:
    'How Sporthouse Hub, the internal platform of SporthouseGroup, collects, uses, stores and protects personal data, including data received through Google Sign-In.',
  robots: { index: true, follow: true },
}

export default function PrivacyPolicyPage() {
  const mail = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>

  return (
    <LegalPage
      title="Privacy Policy"
      updated={LEGAL.privacyLastUpdated}
      intro={
        <p>
          This policy explains what personal data {LEGAL.appName} collects, why, how it is stored and shared,
          and which rights you have. It applies to everyone who uses {LEGAL.appName}: {LEGAL.operator} staff,
          freelancers, and people who open a link shared from the platform.
        </p>
      }
    >
      <LegalSection id="who-we-are" title="1. Who we are">
        <p>
          {LEGAL.appName} is an internal tool built and operated by {LEGAL.operator} for its own staff and
          freelancers. It is not a public consumer product: there is no public sign-up, and accounts are created
          by an administrator.
        </p>
        <p>The controller of your personal data is:</p>
        <ul>
          <li><strong>Company:</strong> <Fill value={LEGAL.legalEntity} missing="legal entity name" /></li>
          <li><strong>Registered address:</strong> <Fill value={LEGAL.registeredAddress} missing="registered address" /></li>
          <li><strong>Company number:</strong> <Fill value={LEGAL.companyNumber} missing="company / VAT number" /></li>
          <li><strong>Contact for privacy questions:</strong> {mail}</li>
        </ul>
      </LegalSection>

      <LegalSection id="data-we-collect" title="2. Data we collect">
        <p><strong>Account data from Google Sign-In.</strong> You sign in with your Google account. Google then
          shares with us your name, email address, profile picture and Google account identifier. We request only
          the basic <code>openid</code>, <code>email</code> and <code>profile</code> scopes.</p>
        <p><strong>Account settings set by an administrator.</strong> Your role and permissions in the platform,
          whether you are staff or a freelancer, and, for temporary accounts, the date the account expires.</p>
        <p><strong>Content you create for your work.</strong> Depending on which parts of the platform you use, this
          includes client and project records, uploaded files, planning and schedules, equipment bookings, pool car
          reservations and damage reports, chat messages, meeting transcripts and summaries, and saved content
          references (see section 9 on Instagram).</p>
        <p><strong>Technical data.</strong> Cookies that keep you signed in (set by our authentication provider,
          Supabase), a push notification subscription if you choose to turn notifications on, and the request logs
          our hosting providers keep to run and secure the service.</p>
        <p>We do not use advertising cookies or third-party tracking scripts.</p>
      </LegalSection>

      <LegalSection id="google-user-data" title="3. Google user data">
        <p>This section describes specifically how {LEGAL.appName} handles data it receives from Google accounts.</p>
        <ul>
          <li><strong>Access:</strong> through Google Sign-In we receive only your name, email address, profile
            picture and Google account identifier. Signing in does not give {LEGAL.appName} access to your Gmail,
            Google Drive, Google Calendar, contacts or any other Google data.</li>
          <li><strong>Use:</strong> we use this data only to authenticate you, to match you to the account an
            administrator created for you, and to show your name next to your activity inside the platform. We
            receive your profile picture as part of the basic profile, but the platform does not use it.</li>
          <li><strong>Storage:</strong> the data is stored in our authentication and database provider, Supabase,
            for as long as your account exists (see section 7).</li>
          <li><strong>Sharing:</strong> we do not sell Google user data, use it for advertising, or share it with
            anyone other than the service providers listed in section 5 that are needed to run the platform. We do
            not use it to train AI models.</li>
        </ul>
        <p>
          {LEGAL.appName}&apos;s use and transfer of information received from Google APIs adheres to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>, including the Limited Use requirements.
        </p>
        <p>
          Separately from your sign-in, {LEGAL.operator} stores project files in its own company Google Workspace
          and sends booking emails and calendar invitations from it. That uses {LEGAL.operator}&apos;s own Google
          account, not yours.
        </p>
      </LegalSection>

      <LegalSection id="how-we-use" title="4. How we use your data">
        <ul>
          <li>to sign you in and keep your account secure;</li>
          <li>to give you the access that matches your role;</li>
          <li>to let you and your colleagues do your work: manage clients, projects, files, planning and equipment;</li>
          <li>to send you service messages, such as booking confirmations, reminders and notifications you turned on;</li>
          <li>to keep the platform running, fix errors and prevent misuse.</li>
        </ul>
        <p>
          Legal basis: <Fill value={LEGAL.legalBasis} missing="legal basis for processing (GDPR art. 6)" />
        </p>
      </LegalSection>

      <LegalSection id="service-providers" title="5. Service providers">
        <p>We use the following providers to run {LEGAL.appName}, each for the purpose described.</p>
        <ul>
          <li><strong>Supabase</strong>: authentication, database and storage of some files. Region:{' '}
            <Fill value={LEGAL.databaseRegion} missing="Supabase project region" />.</li>
          <li><strong>Vercel</strong>: hosting of the web application.</li>
          <li><strong>Google</strong>: Google Sign-In; Google Workspace for file storage, email and calendar
            invitations; Google Apps Script for scheduled emails.</li>
          <li><strong>Anthropic</strong>: AI processing of content you choose to submit, such as summarizing a
            meeting transcript or labelling a saved content reference. Your Google account data is not sent to it.</li>
          <li><strong>Meta (Instagram oEmbed)</strong>: retrieving the public preview of an Instagram post you save
            (see section 9).</li>
          <li><strong>Your browser</strong>: if you record a meeting, live transcription uses your browser&apos;s
            built-in speech recognition; some browsers, such as Google Chrome, process that audio on their
            vendor&apos;s servers. Push notifications are delivered through your browser vendor&apos;s push service.</li>
        </ul>
        <p>
          Transfers outside the European Economic Area:{' '}
          <Fill value={LEGAL.transferSafeguards} missing="transfer safeguards and data processing agreements with these providers" />
        </p>
      </LegalSection>

      <LegalSection id="sharing" title="6. Who can see your data">
        <p>
          Only signed-in {LEGAL.appName} users can see data in the platform, and what each user can see depends on
          the role an administrator gave them. Freelancers only see their own portal. A user can create a share link
          for a specific file or folder; anyone with that link can then open it without an account.
        </p>
        <p>We never sell personal data. We may disclose data if the law requires it.</p>
      </LegalSection>

      <LegalSection id="retention" title="7. How long we keep data">
        <ul>
          <li><strong>Accounts</strong> exist until an administrator removes them. Accounts with an expiry date are
            deleted automatically on that date (checked daily).</li>
          <li><strong>Deleted files</strong> stay in the platform&apos;s trash for 30 days and are then
            permanently removed.</li>
          <li><strong>Other content and backups:</strong>{' '}
            <Fill value={LEGAL.contentRetention} missing="retention period for other content and backups" /></li>
        </ul>
      </LegalSection>

      <LegalSection id="security" title="8. Security">
        <p>
          All traffic to {LEGAL.appName} is encrypted with HTTPS. Sign-in goes through Google, so we never see or
          store your Google password. Access inside the platform is limited by per-user authentication and
          role-based permissions.
        </p>
      </LegalSection>

      <LegalSection id="instagram" title="9. Saved Instagram references">
        <p>
          Our &quot;Mijn gedacht!&quot; feature lets a staff member save the public URL of an Instagram post they
          want to keep as a content reference, using Meta&apos;s oEmbed API. When a post is saved, we store the
          post URL, its publicly available caption or title, the author (account) name, the thumbnail image URL and
          the oEmbed embed code, all of which Instagram itself makes available for that public post. We do not
          access private posts, private accounts or any data beyond what the public oEmbed response provides. An AI
          classification step may add a category label and descriptive tags to the saved item.
        </p>
        <p>
          These references are used only for internal {LEGAL.operator} purposes: content planning, creative
          inspiration and internal collaboration. They are never sold, shared with third parties for advertising, or
          used to build profiles of Instagram users or accounts.
        </p>
      </LegalSection>

      <LegalSection id="your-rights" title="10. Your rights">
        <p>Under the EU General Data Protection Regulation (GDPR) you have the right to:</p>
        <ul>
          <li>access the personal data we hold about you and get a copy of it;</li>
          <li>have incorrect data corrected;</li>
          <li>have your data deleted;</li>
          <li>restrict or object to certain processing;</li>
          <li>receive your data in a portable format;</li>
          <li>lodge a complaint with a data protection authority:{' '}
            <Fill value={LEGAL.supervisoryAuthority} missing="name and website of the competent supervisory authority" />.</li>
        </ul>
        <p>
          To use any of these rights, email {mail}. We answer within one month. You can also revoke{' '}
          {LEGAL.appName}&apos;s access to your Google account at any time at{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.
        </p>
      </LegalSection>

      <LegalSection id="deletion" title="11. Deleting your data">
        <p>
          To have your account and personal data deleted, email {mail} from the address you sign in with. We then
          delete your account, including the name, email address and profile picture we received from Google,
          and the personal data linked to it. Work content that belongs to {LEGAL.operator}&apos;s client projects
          may be kept where we need it for those projects or are legally required to keep it.
        </p>
        <p>
          Revoking access in your Google account stops future sign-ins but does not by itself delete the data we
          already hold, so please also email us.
        </p>
      </LegalSection>

      <LegalSection id="children" title="12. Children">
        <p>{LEGAL.appName} is a work tool and is not intended for children under 16.</p>
      </LegalSection>

      <LegalSection id="changes" title="13. Changes to this policy">
        <p>
          If we change this policy, we update the date at the top of this page.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="14. Contact">
        <p>Questions about this policy or about your data: {mail}.</p>
        <p>See also our <Link href="/terms">Terms of Service</Link>.</p>
      </LegalSection>
    </LegalPage>
  )
}
