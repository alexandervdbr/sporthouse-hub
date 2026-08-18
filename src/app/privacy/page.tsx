import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Sporthouse Hub',
  description: 'Privacy policy for Sporthouse Hub, the internal platform of SporthouseGroup.',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="text-sm leading-relaxed text-zinc-400 space-y-3">{children}</div>
    </section>
  )
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-16">
      <div className="mx-auto max-w-2xl space-y-10">
        <header className="space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white mb-2">
            <span className="text-zinc-950 font-black text-lg tracking-tight">SH</span>
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-zinc-500">Sporthouse Hub — internal platform of SporthouseGroup. Last updated August 2026.</p>
        </header>

        <Section title="Who we are">
          <p>
            Sporthouse Hub is an internal tool built and operated by SporthouseGroup for its own staff.
            It is not a public consumer product — access is restricted to authorized SporthouseGroup
            team members and freelancers.
          </p>
        </Section>

        <Section title="What data we collect">
          <p>
            Staff accounts are authenticated via Google sign-in and are limited to pre-approved
            SporthouseGroup email addresses. Depending on which part of the platform a staff member
            uses, we store the content they create or import for internal work purposes, including but
            not limited to: client and project records, uploaded files, meeting notes, and — relevant to
            this policy — content saved from Instagram for internal inspiration reference.
          </p>
          <p>
            Specifically, our &quot;Moodboard&quot; feature lets a staff member save the public URL
            of an Instagram post (via Meta&apos;s oEmbed API) they want to keep as a content reference.
            When a post is saved, we store: the Instagram post URL, its publicly available caption/title,
            author (account) name, thumbnail image URL, and the oEmbed HTML embed code — all of which is
            data Instagram itself makes available for that public post through its oEmbed endpoint. We do
            not access private posts, private accounts, or any data beyond what the public oEmbed response
            provides. A lightweight AI classification step may add a category label and descriptive tags
            to the saved item for internal organization.
          </p>
        </Section>

        <Section title="How we use this data">
          <p>
            Data saved through Sporthouse Hub, including saved Instagram references, is used exclusively
            for internal SporthouseGroup purposes: content planning, creative inspiration, and internal
            collaboration. It is never sold, shared with third parties for advertising, or used to build
            profiles of Instagram users or accounts.
          </p>
        </Section>

        <Section title="Who can access this data">
          <p>
            Only authenticated SporthouseGroup staff with an account on Sporthouse Hub can access data
            stored in the platform. Access is enforced through per-user authentication and role-based
            permissions.
          </p>
        </Section>

        <Section title="Data retention and deletion">
          <p>
            Saved data is retained for as long as it remains useful for internal reference, or until a
            staff member removes it. Staff can request deletion of any data associated with their account
            by contacting us at the address below.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or requests regarding your data can be sent to{' '}
            <a href="mailto:alexander.vandenbranden@sporthousegroup.com" className="text-white underline underline-offset-2">
              alexander.vandenbranden@sporthousegroup.com
            </a>.
          </p>
        </Section>
      </div>
    </div>
  )
}
