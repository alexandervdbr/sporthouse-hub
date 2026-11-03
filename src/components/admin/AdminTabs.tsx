'use client'

import { useState } from 'react'
import { Users, Building2, KeyRound, FlaskConical } from 'lucide-react'
import UsersPage from '@/components/admin/UsersPage'
import ClientsAdminPanel from '@/components/admin/ClientsAdminPanel'
import RolesPage from '@/components/admin/RolesPage'
import ToolStatusPage from '@/components/admin/ToolStatusPage'

export type Tab = 'users' | 'roles' | 'clients' | 'tools'

// initialTab: de dev-balk boven een tool linkt naar /admin?tab=tools.
export default function AdminTabs({ initialTab = 'users' }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 px-4 sm:px-6 pt-4 border-b border-zinc-800 flex-shrink-0">
        <button
          onClick={() => setTab('users')}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            tab === 'users' ? 'text-zinc-100 border-b-2' : 'text-zinc-500 hover:text-zinc-300'
          }`}
          style={tab === 'users' ? { borderColor: '#3A913F' } : undefined}
        >
          <Users size={14} />
          Gebruikers
        </button>
        <button
          onClick={() => setTab('roles')}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            tab === 'roles' ? 'text-zinc-100 border-b-2' : 'text-zinc-500 hover:text-zinc-300'
          }`}
          style={tab === 'roles' ? { borderColor: '#3A913F' } : undefined}
        >
          <KeyRound size={14} />
          Rollen
        </button>
        <button
          onClick={() => setTab('clients')}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            tab === 'clients' ? 'text-zinc-100 border-b-2' : 'text-zinc-500 hover:text-zinc-300'
          }`}
          style={tab === 'clients' ? { borderColor: '#3A913F' } : undefined}
        >
          <Building2 size={14} />
          Klanten
        </button>
        <button
          onClick={() => setTab('tools')}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            tab === 'tools' ? 'text-zinc-100 border-b-2' : 'text-zinc-500 hover:text-zinc-300'
          }`}
          style={tab === 'tools' ? { borderColor: '#3A913F' } : undefined}
        >
          <FlaskConical size={14} />
          Tools
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'users' ? <UsersPage /> : tab === 'roles' ? <RolesPage /> : tab === 'tools' ? <ToolStatusPage /> : <ClientsAdminPanel />}
      </div>
    </div>
  )
}
