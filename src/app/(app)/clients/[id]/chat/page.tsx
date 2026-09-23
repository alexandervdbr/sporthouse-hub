import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClientChatPage({ params }: Props) {
  const { id } = await params
  redirect(`/clients/${id}`)
}
