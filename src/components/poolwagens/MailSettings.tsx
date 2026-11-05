'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, Loader2, Send } from 'lucide-react'
import { ACCENT, ErrorLine, Notice, actionCls, buttonCls, inputCls, labelCls, newNotice, panelCls, secondaryCls, send } from './ui'
import type { MailStatus, PoolSettingsResponse } from '@/lib/poolwagens/types'

// Beheer → wie de mail krijgt bij een schademelding, en of mail, push en
// Drive ingesteld zijn. Een lege lijst = geen mail (met waarschuwing).

const TEST_TEXT: Record<MailStatus, string> = {
  verstuurd: 'Testmail verstuurd naar',
  mislukt: 'Testmail mislukt',
  niet_geconfigureerd: 'Mail niet geconfigureerd: de env-vars ontbreken.',
  geen_ontvangers: 'Je account heeft geen geldig e-mailadres.',
}

export default function MailSettings() {
  const [settings, setSettings] = useState<PoolSettingsResponse | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<{ text: string; id: number } | null>(null)
  const [test, setTest] = useState<string>('')
  const [error, setError] = useState('')

  useEffect(() => {
    send<PoolSettingsResponse>('/api/poolwagens/settings', 'GET')
      .then(s => { setSettings(s); setText(s.recipients.join('\n')) })
      .catch(e => setError(e.message))
  }, [])

  async function save() {
    setBusy(true); setError(''); setSaved(null)
    try {
      const s = await send<PoolSettingsResponse>('/api/poolwagens/settings', 'PUT', { recipients: text })
      setSettings(s); setText(s.recipients.join('\n')); setSaved(newNotice('Opgeslagen.'))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setBusy(true); setTest(''); setError('')
    try {
      const r = await send<{ status: MailStatus; error: string | null; to?: string }>('/api/poolwagens/mail-test', 'POST')
      setTest(r.status === 'verstuurd' ? `${TEST_TEXT.verstuurd} ${r.to}.` : `${TEST_TEXT[r.status]}${r.error ? `: ${r.error}` : ''}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!settings) return <div className="py-4">{error ? <ErrorLine>{error}</ErrorLine> : <Loader2 size={16} className="animate-spin text-zinc-600" />}</div>

  return (
    <section aria-label="Schademeldingen" className={`${panelCls} p-3 md:p-4`}>
      <h2 className="text-sm font-semibold text-zinc-200 mb-1">Schademeldingen</h2>
      <p className="text-xs text-zinc-500 mb-4">Wie hier staat, krijgt een mail bij elke nieuwe schademelding. Beheerders krijgen daarnaast een push.</p>

      <div className="space-y-2 mb-4">
        {!settings.mailConfigured && <Warn>Mail niet geconfigureerd. Meldingen worden wel opgeslagen, maar er vertrekt geen mail tot de Gmail-koppeling ingesteld is.</Warn>}
        {settings.mailConfigured && settings.recipients.length === 0 && <Warn>Geen ontvangers ingesteld: bij een schademelding vertrekt er geen mail.</Warn>}
        {!settings.pushConfigured && <Warn>Push niet geconfigureerd (VAPID-sleutels ontbreken): er vertrekken geen pushmeldingen.</Warn>}
        {!settings.driveConfigured && <Warn>Google Drive niet geconfigureerd: foto’s bij een schademelding kunnen niet opgeslagen worden.</Warn>}
      </div>

      <label className={labelCls}>Ontvangers (één e-mailadres per regel)</label>
      <textarea className={`${inputCls} min-h-24 font-mono`} value={text} onChange={e => { setText(e.target.value); setSaved(null) }}
        placeholder="vloot@sporthousegroup.com" />
      <div className="mt-2 grid grid-cols-1 gap-2 md:flex md:flex-wrap md:items-center">
        <button onClick={save} disabled={busy} className={`${buttonCls} ${actionCls} text-white`} style={{ backgroundColor: ACCENT }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Opslaan
        </button>
        <button onClick={sendTest} disabled={busy || !settings.mailConfigured} className={`${secondaryCls} ${actionCls}`}
          title={settings.mailConfigured ? 'Stuurt één mail naar het adres van je eigen account' : 'Eerst de mail configureren'}>
          <Send size={14} /> Testmail naar mezelf
        </button>
        {test && <span className="text-xs text-zinc-300">{test}</span>}
      </div>
      <div className="mt-2 space-y-2">
        <Notice notice={saved} onClose={() => setSaved(null)} />
        <ErrorLine>{error}</ErrorLine>
      </div>
    </section>
  )
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-900/40 text-xs text-amber-200">
      <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /><span>{children}</span>
    </div>
  )
}
