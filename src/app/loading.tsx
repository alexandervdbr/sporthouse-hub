import { Loader2 } from 'lucide-react'

export default function Loading() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="animate-spin text-[#3A913F]" size={28} />
    </div>
  )
}
