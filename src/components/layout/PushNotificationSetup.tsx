'use client'

import { useEffect } from 'react'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export default function PushNotificationSetup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    async function setup() {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready

        if (Notification.permission === 'denied') return

        const currentPermission = Notification.permission
        let permission: NotificationPermission = currentPermission
        if (currentPermission === 'default') {
          permission = await Notification.requestPermission()
        }
        if (permission !== 'granted') return

        const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
          ),
        })

        // Ook een bestaand abonnement melden. Vroeger stopte dit zodra de
        // browser er al een had, in de veronderstelling dat de server het dan
        // ook kende. Na het verlies van de database (28 oktober 2026) klopte
        // dat niet meer: elke browser had een abonnement, de tabel was leeg, en
        // niemand kreeg nog meldingen. De server werkt bij op endpoint, dus
        // opnieuw sturen kan geen kwaad — één keer per browsersessie volstaat.
        const syncedKey = `push-synced:${sub.endpoint}`
        try { if (sessionStorage.getItem(syncedKey)) return } catch { /* private browsing */ }

        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        })
        if (res.ok) {
          try { sessionStorage.setItem(syncedKey, '1') } catch { /* private browsing */ }
        }
      } catch {
        // silently fail — push is non-critical
      }
    }

    setup()
  }, [])

  return null
}
