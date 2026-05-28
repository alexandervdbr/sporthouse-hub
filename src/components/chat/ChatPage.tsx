'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Send, Hash, Plus, Loader2, Trash2, X, ChevronDown, ChevronRight, MoreHorizontal, Pencil, FolderPlus, Paperclip, FileText, Download, GripVertical } from 'lucide-react'
import {
  DndContext, DragEndEvent,
  PointerSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Channel {
  id: string
  name: string
  description: string | null
  category: string
  color: string | null
  sort_order: number
}

interface Message {
  id: string
  channel_id: string
  content: string
  created_by: string
  user_name: string
  created_at: string
  attachment_url: string | null
  attachment_name: string | null
  attachment_type: string | null
}

interface PendingAttachment {
  file: File
  previewUrl: string       // local blob URL for preview
  uploading: boolean
  uploadedUrl: string | null
  error: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#3A913F','#0ea5e9','#a855f7','#f97316','#ec4899','#14b8a6','#f59e0b','#6366f1']

const CHANNEL_COLORS = [
  { label: 'Standaard', value: null },
  { label: 'Groen',     value: '#3A913F' },
  { label: 'Blauw',     value: '#0ea5e9' },
  { label: 'Paars',     value: '#a855f7' },
  { label: 'Oranje',    value: '#f97316' },
  { label: 'Roze',      value: '#ec4899' },
  { label: 'Teal',      value: '#14b8a6' },
  { label: 'Amber',     value: '#f59e0b' },
  { label: 'Indigo',    value: '#6366f1' },
  { label: 'Rood',      value: '#ef4444' },
]

function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
}

function formatDateLabel(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)
  if (diffDays === 0) return 'Vandaag'
  if (diffDays === 1) return 'Gisteren'
  return date.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function isGrouped(prev: Message, curr: Message) {
  return (
    prev.created_by === curr.created_by &&
    new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
  )
}

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

// ─── Attachment renderer ──────────────────────────────────────────────────────

function Attachment({ url, name, type }: { url: string; name: string; type: string }) {
  const isImage = type.startsWith('image/')
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1.5">
        <div className="relative rounded-xl overflow-hidden" style={{ maxWidth: 320 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={name}
            className="block rounded-xl object-cover"
            style={{ maxWidth: 320, maxHeight: 260 }}
          />
        </div>
      </a>
    )
  }
  // Document / generic file
  const ext = name.split('.').pop()?.toUpperCase() ?? 'FILE'
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 inline-flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors group"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
      download={name}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.08)' }}
      >
        <FileText size={15} className="text-zinc-400" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-zinc-200 truncate max-w-[200px] group-hover:text-white transition-colors">{name}</p>
        <p className="text-[11px] text-zinc-600 mt-0.5">{ext}</p>
      </div>
      <Download size={13} className="text-zinc-600 group-hover:text-zinc-400 flex-shrink-0 transition-colors" />
    </a>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, photoUrl, size = 32 }: { name: string; photoUrl?: string | null; size?: number }) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        className="rounded-full flex-shrink-0 object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 select-none"
      style={{ width: size, height: size, fontSize: size * 0.35, backgroundColor: avatarColor(name) }}
    >
      {getInitials(name)}
    </div>
  )
}

// ─── Sortable category block ──────────────────────────────────────────────────

function SortableCategoryBlock({
  cat, isAdmin, isCollapsed, onToggle, children,
}: {
  cat: string
  isAdmin: boolean
  isCollapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const id = `cat:${cat}`
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !isAdmin })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="mb-1"
    >
      <div className="flex items-center group/cat">
        {isAdmin && (
          <span
            {...attributes}
            {...listeners}
            className="flex-shrink-0 pl-1.5 pr-0.5 py-1 cursor-grab active:cursor-grabbing text-zinc-700 opacity-0 group-hover/cat:opacity-100 transition-opacity touch-none"
            title="Versleep categorie"
          >
            <GripVertical size={10} />
          </span>
        )}
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-1 px-3 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest hover:text-zinc-400 transition-colors"
          style={isAdmin ? { paddingLeft: 4 } : undefined}
        >
          {isCollapsed
            ? <ChevronRight size={10} className="flex-shrink-0" />
            : <ChevronDown size={10} className="flex-shrink-0" />
          }
          {cat}
        </button>
      </div>
      {children}
    </div>
  )
}

// ─── Sortable channel item ─────────────────────────────────────────────────────

function SortableChannelItem({
  ch, isActive, isAdmin, isMenuOpen, menuRef, deletingChannelId,
  hoveredChannelId, onSetHovered, onSelect, onToggleMenu, onEdit, onDelete,
}: {
  ch: Channel
  isActive: boolean
  isAdmin: boolean
  isMenuOpen: boolean
  menuRef?: React.RefObject<HTMLDivElement>
  deletingChannelId: string | null
  hoveredChannelId: string | null
  onSetHovered: (id: string | null) => void
  onSelect: () => void
  onToggleMenu: (e: React.MouseEvent) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: ch.id, disabled: !isAdmin })

  const isHovered = hoveredChannelId === ch.id
  const hashColor = ch.color ?? '#71717a'

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-1 px-2 relative group/ch"
      onMouseEnter={() => onSetHovered(ch.id)}
      onMouseLeave={() => onSetHovered(null)}
    >
      {/* Grip handle (admin only) */}
      {isAdmin && (
        <span
          {...attributes}
          {...listeners}
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-zinc-700 opacity-0 group-hover/ch:opacity-100 transition-opacity touch-none"
          title="Versleep kanaal"
        >
          <GripVertical size={11} />
        </span>
      )}

      <button
        onClick={onSelect}
        className="flex-1 flex items-center gap-2 px-2 py-1.5 text-sm transition-colors text-left rounded-lg relative min-w-0"
        style={{
          color: isActive ? '#e4e4e7' : '#71717a',
          backgroundColor: isActive ? 'rgba(255,255,255,0.06)' : isHovered ? 'rgba(255,255,255,0.03)' : 'transparent',
          fontWeight: isActive ? 500 : 400,
        }}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full" style={{ backgroundColor: '#3A913F' }} />
        )}
        <Hash size={13} className="flex-shrink-0" style={{ color: hashColor }} />
        <span className="truncate" style={{ color: isActive ? '#e4e4e7' : isHovered ? '#a1a1aa' : '#71717a' }}>
          {ch.name}
        </span>
      </button>

      {/* 3-dot menu (admin only) */}
      {isAdmin && (isHovered || isMenuOpen) && (
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={onToggleMenu}
            className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
            title="Opties"
          >
            <MoreHorizontal size={13} />
          </button>
          {isMenuOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-50 min-w-[150px] rounded-xl overflow-hidden"
              style={{ background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
            >
              <button
                onClick={onEdit}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors text-left"
              >
                <Pencil size={11} /> Bewerken
              </button>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />
              <button
                onClick={onDelete}
                disabled={deletingChannelId === ch.id}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-500 hover:text-red-400 hover:bg-white/5 transition-colors text-left"
              >
                {deletingChannelId === ch.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                Verwijderen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChatPage() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [memberPhotos, setMemberPhotos] = useState<Record<string, string>>({})
  const [input, setInput] = useState('')
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [currentUserName, setCurrentUserName] = useState<string>('')
  const [isAdmin, setIsAdmin] = useState(false)

  // New channel
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelDesc, setNewChannelDesc] = useState('')
  const [newChannelCategory, setNewChannelCategory] = useState('Algemeen')
  const [newChannelCategoryCustom, setNewChannelCategoryCustom] = useState('')
  const [newChannelColor, setNewChannelColor] = useState<string | null>(null)
  const [creatingChannel, setCreatingChannel] = useState(false)

  // New category (standalone)
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryFirstChannel, setNewCategoryFirstChannel] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)

  // Edit channel
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editColor, setEditColor] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  // UI state
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [hoveredChannelId, setHoveredChannelId] = useState<string | null>(null)
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  // ── Close dropdown on outside click ───────────────────────
  useEffect(() => {
    if (!openMenuId) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openMenuId])

  // ── Init user ──────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user?.email) return
      setCurrentUserEmail(user.email)
      setIsAdmin(ADMIN_EMAILS.includes(user.email))
      const namePart = user.email.split('@')[0]
      const name = namePart.split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      setCurrentUserName(name)
    })
  }, [])

  // ── Load member photos ─────────────────────────────────────
  useEffect(() => {
    fetch('/api/chat/members')
      .then(r => r.ok ? r.json() : [])
      .then((members: { email: string; photo_url: string | null }[]) => {
        const map: Record<string, string> = {}
        for (const m of members) {
          if (m.email && m.photo_url) map[m.email.toLowerCase()] = m.photo_url
        }
        setMemberPhotos(map)
      })
  }, [])

  // ── Load channels ──────────────────────────────────────────
  useEffect(() => {
    fetch('/api/chat/channels')
      .then(r => r.json())
      .then((data: Channel[]) => {
        setChannels(data)
        if (data.length > 0) setActiveChannel(data[0])
        setLoadingChannels(false)
      })
  }, [])

  // ── Load messages ──────────────────────────────────────────
  const loadMessages = useCallback(async (channelId: string) => {
    setLoadingMessages(true)
    const r = await fetch(`/api/chat/messages?channelId=${channelId}`)
    const data = await r.json()
    setMessages(data)
    setLoadingMessages(false)
  }, [])

  useEffect(() => {
    if (!activeChannel) return
    loadMessages(activeChannel.id)
    // Mark channel as read
    fetch('/api/chat/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: activeChannel.id }),
    }).catch(() => {})
  }, [activeChannel?.id])

  // ── Realtime subscription ──────────────────────────────────
  useEffect(() => {
    if (!activeChannel) return

    const channel = supabase
      .channel(`chat-${activeChannel.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${activeChannel.id}` },
        (payload) => {
          setMessages(prev => {
            if (prev.find(m => m.id === (payload.new as Message).id)) return prev
            return [...prev, payload.new as Message]
          })
          // Mark as read since we're actively watching this channel
          fetch('/api/chat/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId: activeChannel.id }),
          }).catch(() => {})
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages' },
        (payload) => {
          setMessages(prev => prev.filter(m => m.id !== (payload.old as { id: string }).id))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeChannel?.id])

  // ── Scroll to bottom ───────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Drag-and-drop ──────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragStart() {
    // drag tracking handled by dnd-kit internals
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)

    // Determine if dragging a category or a channel
    // Category drag IDs are prefixed with "cat:"
    const isCategoryDrag = activeId.startsWith('cat:')

    if (isCategoryDrag) {
      // Reorder categories
      const activeCat = activeId.slice(4)
      const overCat = overId.startsWith('cat:') ? overId.slice(4) : null
      if (!overCat || activeCat === overCat) return

      // Build ordered category list
      const cats = Array.from(new Set(channels.map(c => c.category || 'Algemeen')))
      const oldIdx = cats.indexOf(activeCat)
      const newIdx = cats.indexOf(overCat)
      if (oldIdx === -1 || newIdx === -1) return
      const newCats = arrayMove(cats, oldIdx, newIdx)

      // Reassign sort_order: give each channel a new global sort_order based on new category order
      const reordered = newCats.flatMap(cat =>
        channels.filter(c => (c.category || 'Algemeen') === cat)
      ).map((ch, i) => ({ ...ch, sort_order: i }))

      setChannels(reordered)
      persistOrder(reordered)
    } else {
      // Reorder channel within (or across) categories
      const oldIdx = channels.findIndex(c => c.id === activeId)
      const newIdx = channels.findIndex(c => c.id === overId)
      if (oldIdx === -1 || newIdx === -1) return

      const reordered = arrayMove(channels, oldIdx, newIdx).map((ch, i) => ({ ...ch, sort_order: i }))
      setChannels(reordered)
      persistOrder(reordered)
    }
  }

  function persistOrder(ordered: Channel[]) {
    fetch('/api/chat/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: ordered.map(c => ({ id: c.id, sort_order: c.sort_order })) }),
    })
  }

  // ── File select & upload ───────────────────────────────────
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so same file can be re-selected
    e.target.value = ''

    const previewUrl = URL.createObjectURL(file)
    const pending: PendingAttachment = { file, previewUrl, uploading: true, uploadedUrl: null, error: null }
    setPendingAttachment(pending)

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from('chat-attachments')
      .upload(path, file, { contentType: file.type, upsert: false })

    if (error) {
      setPendingAttachment(prev => prev ? { ...prev, uploading: false, error: 'Upload mislukt.' } : null)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(path)

    setPendingAttachment(prev => prev ? { ...prev, uploading: false, uploadedUrl: publicUrl } : null)
    inputRef.current?.focus()
  }

  // ── Send message ───────────────────────────────────────────
  async function handleSend() {
    const text = input.trim()
    const hasAttachment = pendingAttachment?.uploadedUrl
    if ((!text && !hasAttachment) || sending || !activeChannel) return
    if (pendingAttachment?.uploading) return

    setSending(true)
    setInput('')
    const attachment = pendingAttachment
    setPendingAttachment(null)
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl)

    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      channel_id: activeChannel.id,
      content: text,
      created_by: currentUserEmail ?? '',
      user_name: currentUserName,
      created_at: new Date().toISOString(),
      attachment_url: attachment?.uploadedUrl ?? null,
      attachment_name: attachment?.file.name ?? null,
      attachment_type: attachment?.file.type ?? null,
    }
    setMessages(prev => [...prev, tempMsg])

    const r = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: activeChannel.id,
        content: text,
        attachmentUrl: attachment?.uploadedUrl ?? null,
        attachmentName: attachment?.file.name ?? null,
        attachmentType: attachment?.file.type ?? null,
      }),
    })

    if (r.ok) {
      const saved: Message = await r.json()
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? saved : m))
    } else {
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id))
    }

    setSending(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // ── Delete message ─────────────────────────────────────────
  async function handleDelete(id: string) {
    setDeletingId(id)
    await fetch(`/api/chat/messages/${id}`, { method: 'DELETE' })
    setMessages(prev => prev.filter(m => m.id !== id))
    setDeletingId(null)
  }

  // ── Delete channel ─────────────────────────────────────────
  async function handleDeleteChannel(id: string) {
    setDeletingChannelId(id)
    await fetch(`/api/chat/channels/${id}`, { method: 'DELETE' })
    setChannels(prev => prev.filter(c => c.id !== id))
    if (activeChannel?.id === id) setActiveChannel(channels.find(c => c.id !== id) ?? null)
    setDeletingChannelId(null)
    setOpenMenuId(null)
  }

  // ── Create channel ─────────────────────────────────────────
  async function handleCreateChannel() {
    if (!newChannelName.trim()) return
    setCreatingChannel(true)
    const resolvedCategory = newChannelCategory === '__new__'
      ? (newChannelCategoryCustom.trim() || 'Algemeen')
      : newChannelCategory
    const r = await fetch('/api/chat/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newChannelName, description: newChannelDesc, category: resolvedCategory, color: newChannelColor }),
    })
    if (r.ok) {
      const ch: Channel = await r.json()
      setChannels(prev => [...prev, ch])
      setActiveChannel(ch)
      setShowNewChannel(false)
      setNewChannelName('')
      setNewChannelDesc('')
      setNewChannelCategory('Algemeen')
      setNewChannelCategoryCustom('')
      setNewChannelColor(null)
    }
    setCreatingChannel(false)
  }

  // ── Create category (with first channel) ───────────────────
  async function handleCreateCategory() {
    if (!newCategoryName.trim() || !newCategoryFirstChannel.trim()) return
    setCreatingCategory(true)
    const r = await fetch('/api/chat/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCategoryFirstChannel, category: newCategoryName.trim(), color: null }),
    })
    if (r.ok) {
      const ch: Channel = await r.json()
      setChannels(prev => [...prev, ch])
      setActiveChannel(ch)
      setShowNewCategory(false)
      setNewCategoryName('')
      setNewCategoryFirstChannel('')
    }
    setCreatingCategory(false)
  }

  // ── Edit channel ───────────────────────────────────────────
  function openEdit(ch: Channel) {
    setEditingChannel(ch)
    setEditName(ch.name)
    setEditDesc(ch.description ?? '')
    setEditCategory(ch.category)
    setEditColor(ch.color)
    setOpenMenuId(null)
  }

  async function handleSaveEdit() {
    if (!editingChannel || !editName.trim()) return
    setSavingEdit(true)
    const r = await fetch(`/api/chat/channels/${editingChannel.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, description: editDesc, category: editCategory, color: editColor }),
    })
    if (r.ok) {
      const updated: Channel = await r.json()
      setChannels(prev => prev.map(c => c.id === updated.id ? updated : c))
      if (activeChannel?.id === updated.id) setActiveChannel(updated)
      setEditingChannel(null)
    }
    setSavingEdit(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ─── Color picker component ───────────────────────────────

  function ColorPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
    return (
      <div className="flex flex-wrap gap-2">
        {CHANNEL_COLORS.map(c => (
          <button
            key={c.label}
            title={c.label}
            onClick={() => onChange(c.value)}
            className="w-6 h-6 rounded-full flex items-center justify-center transition-all"
            style={{
              backgroundColor: c.value ?? '#3f3f46',
              outline: value === c.value ? '2px solid white' : '2px solid transparent',
              outlineOffset: '2px',
            }}
          >
            {value === c.value && (
              <span className="w-2 h-2 rounded-full bg-white/80 block" />
            )}
          </button>
        ))}
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 overflow-hidden">

      {/* ── Channel sidebar ────────────────────────────────── */}
      <div
        className="flex-shrink-0 w-52 flex flex-col h-full"
        style={{ borderRight: '1px solid rgba(255,255,255,0.07)', background: '#141414' }}
      >
        <div className="flex-shrink-0 px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Kanalen</p>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loadingChannels ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={14} className="animate-spin text-zinc-600" />
            </div>
          ) : (() => {
            // Build ordered category list (preserving channel sort_order)
            const categoryMap = new Map<string, Channel[]>()
            for (const ch of channels) {
              const cat = ch.category || 'Algemeen'
              if (!categoryMap.has(cat)) categoryMap.set(cat, [])
              categoryMap.get(cat)!.push(ch)
            }
            const catList = Array.from(categoryMap.keys())
            const catIds = catList.map(c => `cat:${c}`)

            return (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={isAdmin ? catIds : []} strategy={verticalListSortingStrategy}>
                  {catList.map(cat => {
                    const catChannels = categoryMap.get(cat)!
                    const isCollapsed = collapsedCategories.has(cat)
                    const channelIds = catChannels.map(c => c.id)

                    return (
                      <SortableCategoryBlock
                        key={cat}
                        cat={cat}
                        isAdmin={isAdmin}
                        isCollapsed={isCollapsed}
                        onToggle={() => setCollapsedCategories(prev => {
                          const next = new Set(prev)
                          if (next.has(cat)) { next.delete(cat) } else { next.add(cat) }
                          return next
                        })}
                      >
                        <SortableContext items={isAdmin ? channelIds : []} strategy={verticalListSortingStrategy}>
                          {!isCollapsed && catChannels.map(ch => (
                            <SortableChannelItem
                              key={ch.id}
                              ch={ch}
                              isActive={activeChannel?.id === ch.id}
                              isAdmin={isAdmin}
                              isMenuOpen={openMenuId === ch.id}
                              menuRef={openMenuId === ch.id ? menuRef : undefined}
                              deletingChannelId={deletingChannelId}
                              hoveredChannelId={hoveredChannelId}
                              onSetHovered={setHoveredChannelId}
                              onSelect={() => setActiveChannel(ch)}
                              onToggleMenu={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === ch.id ? null : ch.id) }}
                              onEdit={() => openEdit(ch)}
                              onDelete={() => handleDeleteChannel(ch.id)}
                            />
                          ))}
                        </SortableContext>
                      </SortableCategoryBlock>
                    )
                  })}
                </SortableContext>
              </DndContext>
            )
          })()}
        </div>

        {/* New channel / category buttons (admin only) */}
        {isAdmin && (
          <div className="flex-shrink-0 p-3 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <button
              onClick={() => setShowNewChannel(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
            >
              <Plus size={12} />
              Kanaal toevoegen
            </button>
            <button
              onClick={() => setShowNewCategory(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
            >
              <FolderPlus size={12} />
              Categorie aanmaken
            </button>
          </div>
        )}
      </div>

      {/* ── Messages area ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">

        {/* Channel header */}
        {activeChannel && (
          <div
            className="flex-shrink-0 flex items-center gap-2 px-6 py-3.5"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
          >
            <Hash size={15} style={{ color: activeChannel.color ?? '#71717a', flexShrink: 0 }} />
            <span className="text-sm font-semibold text-zinc-200">{activeChannel.name}</span>
            {activeChannel.description && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="text-xs text-zinc-500">{activeChannel.description}</span>
              </>
            )}
          </div>
        )}

        {/* Messages list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-0.5">
          {loadingMessages ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={16} className="animate-spin text-zinc-600" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <Hash size={20} className="text-zinc-700" />
              </div>
              <p className="text-sm font-medium text-zinc-500">Welkom in #{activeChannel?.name}</p>
              <p className="text-xs text-zinc-700">Stuur het eerste bericht in dit kanaal.</p>
            </div>
          ) : (
            messages.map((msg, i) => {
              const prev = messages[i - 1]
              const grouped = prev ? isGrouped(prev, msg) && isSameDay(prev.created_at, msg.created_at) : false
              const showDate = !prev || !isSameDay(prev.created_at, msg.created_at)
              const isOwn = msg.created_by === currentUserEmail

              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="flex items-center gap-3 my-5">
                      <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
                      <span className="text-[11px] text-zinc-500 font-medium px-2">{formatDateLabel(msg.created_at)}</span>
                      <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
                    </div>
                  )}

                  <div
                    className="group flex items-start gap-3 px-2 py-0.5 rounded-lg transition-colors relative"
                    style={{ marginTop: grouped ? 0 : '12px' }}
                    onMouseEnter={() => setHoveredId(msg.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onMouseOver={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.025)'}
                    onMouseOut={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                  >
                    <div className="flex-shrink-0 w-8 mt-0.5">
                      {!grouped ? (
                        <Avatar
                          name={msg.user_name}
                          photoUrl={memberPhotos[msg.created_by?.toLowerCase() ?? '']}
                          size={32}
                        />
                      ) : null}
                    </div>

                    <div className="flex-1 min-w-0">
                      {!grouped && (
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-zinc-100">{msg.user_name}</span>
                          <span className="text-[11px] text-zinc-600">{formatTime(msg.created_at)}</span>
                        </div>
                      )}
                      {msg.content && (
                        <p className="text-sm text-zinc-300 leading-relaxed break-words whitespace-pre-wrap">
                          {msg.content}
                        </p>
                      )}
                      {msg.attachment_url && msg.attachment_name && msg.attachment_type && (
                        <Attachment
                          url={msg.attachment_url}
                          name={msg.attachment_name}
                          type={msg.attachment_type}
                        />
                      )}
                    </div>

                    {isOwn && hoveredId === msg.id && (
                      <button
                        onClick={() => handleDelete(msg.id)}
                        disabled={deletingId === msg.id}
                        className="flex-shrink-0 p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-all"
                        title="Verwijder bericht"
                      >
                        {deletingId === msg.id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Trash2 size={12} />
                        }
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 px-6 pb-5 pt-3">

          {/* Attachment preview */}
          {pendingAttachment && (
            <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {pendingAttachment.file.type.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pendingAttachment.previewUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <FileText size={16} className="text-zinc-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-300 truncate">{pendingAttachment.file.name}</p>
                <p className="text-[11px] text-zinc-600 mt-0.5">
                  {pendingAttachment.uploading
                    ? 'Uploaden...'
                    : pendingAttachment.error
                      ? <span className="text-red-400">{pendingAttachment.error}</span>
                      : 'Klaar om te versturen'
                  }
                </p>
              </div>
              {pendingAttachment.uploading
                ? <Loader2 size={13} className="animate-spin text-zinc-600 flex-shrink-0" />
                : (
                  <button
                    onClick={() => {
                      if (pendingAttachment.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl)
                      setPendingAttachment(null)
                    }}
                    className="flex-shrink-0 p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
                  >
                    <X size={13} />
                  </button>
                )
              }
            </div>
          )}

          <div
            className="flex items-end gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
          >
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Paperclip button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!activeChannel || sending || !!pendingAttachment}
              className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-all disabled:opacity-30"
              title="Bijlage toevoegen"
            >
              <Paperclip size={15} />
            </button>

            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activeChannel ? `Bericht in #${activeChannel.name}...` : 'Selecteer een kanaal...'}
              disabled={!activeChannel || sending}
              rows={1}
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none resize-none disabled:opacity-40"
              style={{ minHeight: '24px', maxHeight: '160px' }}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`
              }}
            />
            <button
              onClick={handleSend}
              disabled={(!input.trim() && !pendingAttachment?.uploadedUrl) || sending || !activeChannel || pendingAttachment?.uploading === true}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg disabled:opacity-30 transition-all"
              style={{ backgroundColor: '#3A913F' }}
            >
              {sending
                ? <Loader2 size={13} className="animate-spin text-white" />
                : <Send size={13} className="text-white" />
              }
            </button>
          </div>
          <p className="text-[10px] text-zinc-700 mt-1.5 text-center">
            Enter om te versturen · Shift+Enter voor nieuwe regel
          </p>
        </div>
      </div>

      {/* ── New channel modal ───────────────────────────────── */}
      {showNewChannel && (() => {
        const existingCategories = Array.from(new Set(channels.map(c => c.category || 'Algemeen')))
        if (!existingCategories.includes('Algemeen')) existingCategories.unshift('Algemeen')
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setShowNewChannel(false)} />
            <div className="relative rounded-2xl w-full max-w-sm glass animate-scale-in" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
              <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-sm font-semibold text-zinc-200">Nieuw kanaal</p>
                <button onClick={() => setShowNewChannel(false)} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                  <X size={15} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">Naam *</label>
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg focus-within:border-zinc-700 transition-colors">
                    <Hash size={13} style={{ color: newChannelColor ?? '#71717a', flexShrink: 0 }} />
                    <input
                      autoFocus
                      type="text"
                      value={newChannelName}
                      onChange={e => setNewChannelName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateChannel()}
                      placeholder="bv. content-feedback"
                      className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">Categorie</label>
                  <select
                    value={newChannelCategory}
                    onChange={e => {
                      setNewChannelCategory(e.target.value)
                      if (e.target.value !== '__new__') setNewChannelCategoryCustom('')
                    }}
                    className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-700 transition-colors appearance-none cursor-pointer"
                  >
                    {existingCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="__new__">+ Nieuwe categorie aanmaken...</option>
                  </select>
                  {newChannelCategory === '__new__' && (
                    <input
                      autoFocus
                      type="text"
                      value={newChannelCategoryCustom}
                      onChange={e => setNewChannelCategoryCustom(e.target.value)}
                      placeholder="Naam van de nieuwe categorie"
                      className="mt-2 w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">Beschrijving <span className="text-zinc-700">— optioneel</span></label>
                  <input
                    type="text"
                    value={newChannelDesc}
                    onChange={e => setNewChannelDesc(e.target.value)}
                    placeholder="Waar gaat dit kanaal over?"
                    className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-2">Kleur</label>
                  <ColorPicker value={newChannelColor} onChange={setNewChannelColor} />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 p-5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <button onClick={() => setShowNewChannel(false)} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  Annuleren
                </button>
                <button
                  onClick={handleCreateChannel}
                  disabled={
                    !newChannelName.trim() ||
                    (newChannelCategory === '__new__' && !newChannelCategoryCustom.trim()) ||
                    creatingChannel
                  }
                  className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-xl disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: '#3A913F' }}
                >
                  {creatingChannel ? <><Loader2 size={13} className="animate-spin" /> Aanmaken...</> : 'Aanmaken'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── New category modal ─────────────────────────────── */}
      {showNewCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setShowNewCategory(false)} />
          <div className="relative rounded-2xl w-full max-w-sm glass animate-scale-in" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-sm font-semibold text-zinc-200">Nieuwe categorie</p>
              <button onClick={() => setShowNewCategory(false)} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                <X size={15} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Naam categorie *</label>
                <input
                  autoFocus
                  type="text"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="bv. Projecten, Marketing, Intern..."
                  className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Eerste kanaal *</label>
                <p className="text-[11px] text-zinc-600 mb-2">Een categorie heeft minstens één kanaal nodig.</p>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg focus-within:border-zinc-700 transition-colors">
                  <Hash size={13} className="text-zinc-600 flex-shrink-0" />
                  <input
                    type="text"
                    value={newCategoryFirstChannel}
                    onChange={e => setNewCategoryFirstChannel(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateCategory()}
                    placeholder="bv. algemeen"
                    className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <button onClick={() => setShowNewCategory(false)} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                Annuleren
              </button>
              <button
                onClick={handleCreateCategory}
                disabled={!newCategoryName.trim() || !newCategoryFirstChannel.trim() || creatingCategory}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-xl disabled:opacity-50 transition-colors"
                style={{ backgroundColor: '#3A913F' }}
              >
                {creatingCategory ? <><Loader2 size={13} className="animate-spin" /> Aanmaken...</> : 'Aanmaken'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit channel modal ──────────────────────────────── */}
      {editingChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setEditingChannel(null)} />
          <div className="relative rounded-2xl w-full max-w-sm glass animate-scale-in" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-sm font-semibold text-zinc-200">Kanaal bewerken</p>
              <button onClick={() => setEditingChannel(null)} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                <X size={15} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Naam *</label>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
                  <Hash size={13} style={{ color: editColor ?? '#71717a', flexShrink: 0 }} />
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                    className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Categorie</label>
                <input
                  type="text"
                  value={editCategory}
                  onChange={e => setEditCategory(e.target.value)}
                  placeholder="bv. Projecten, Intern, Marketing..."
                  className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Beschrijving <span className="text-zinc-700">— optioneel</span></label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  placeholder="Waar gaat dit kanaal over?"
                  className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-2">Kleur</label>
                <ColorPicker value={editColor} onChange={setEditColor} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <button onClick={() => setEditingChannel(null)} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                Annuleren
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editName.trim() || savingEdit}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-xl disabled:opacity-50 transition-colors"
                style={{ backgroundColor: '#3A913F' }}
              >
                {savingEdit ? <><Loader2 size={13} className="animate-spin" /> Opslaan...</> : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
