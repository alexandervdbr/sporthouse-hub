'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

export default function PortalLogout() {
  const router = useRouter()
  const supabase = createClient()

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button onClick={logout}
      className="flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-300 transition-colors">
      <LogOut size={14} />
      Uitloggen
    </button>
  )
}
