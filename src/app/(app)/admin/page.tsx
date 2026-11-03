import AdminTabs, { type Tab } from '@/components/admin/AdminTabs'

const TABS: Tab[] = ['users', 'roles', 'clients', 'tools']

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  return <AdminTabs initialTab={TABS.includes(tab as Tab) ? (tab as Tab) : 'users'} />
}
