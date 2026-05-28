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

        const existing = await reg.pushManager.getSubscription()
        if (existing) return

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
          ),
        })

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        })
      } catch {
        // silently fail — push is non-critical
      }
    }

    setup()
  }, [])

  return null
}
