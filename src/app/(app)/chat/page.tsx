import { redirect } from 'next/navigation'
import ChatPage from '@/components/chat/ChatPage'
import { CHAT_ENABLED } from '@/lib/features'

export const metadata = { title: 'Chat — Sporthouse' }

export default function Page() {
  if (!CHAT_ENABLED) redirect('/dashboard')
  return <ChatPage />
}
