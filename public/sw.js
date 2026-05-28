self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()
  const title = data.title || 'Sporthouse Hub'
  const options = {
    body: data.body || '',
    icon: '/logos/sporthouse.png',
    badge: '/logos/sporthouse.png',
    tag: data.tag || 'default',
    data: { url: data.url || '/dashboard' },
    vibrate: [200, 100, 200],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/dashboard'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
