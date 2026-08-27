import type { Client } from '@/types/database'
import { FolderOpen, Mic, PenLine, BrainCircuit, Gift, Scissors, CalendarDays, CalendarRange, GraduationCap, BarChart2, Landmark, ClipboardList, LayoutList, Search, FileText } from 'lucide-react'

export interface ToolDefinition {
  id: string
  label: string
  description: string
  icon: React.ElementType
  color: string
  href: (clientId: string) => string
}

export interface ToolPermissions {
  isAdmin: boolean
  canSeeWelkom: boolean
  canSeeFinancien: boolean
  canSeeAdministratie: boolean
}

// The single source of truth for "which tools does this client have, and
// which ones can this user see" — shared by the client's own Tools grid
// (src/app/clients/[id]/page.tsx) and the dashboard's favorited-tools
// section, so a favorited tool can be re-validated (still available for
// this client/user) without duplicating these conditionals a second time.
export function getAvailableTools(client: Client, perms: ToolPermissions): ToolDefinition[] {
  const { isAdmin, canSeeWelkom, canSeeFinancien, canSeeAdministratie } = perms

  return [
    {
      id: 'meetings',
      label: 'Vergaderingen',
      description: 'Neem vergaderingen op, bekijk live transcriptie en genereer een AI-samenvatting.',
      icon: Mic,
      color: '#3A913F',
      href: (id: string) => `/clients/${id}/meetings`,
    },
    {
      id: 'expert',
      label: 'Expert AI',
      description: 'Chat met een AI die alles weet over deze organisatie — processen, mensen, aanpak en strategie.',
      icon: BrainCircuit,
      color: '#7c3aed',
      href: (id: string) => `/clients/${id}/expert`,
    },
    {
      id: 'copy',
      label: 'Copy Generator',
      description: 'Genereer social media copy op basis van een brief en verfijn via AI-chat.',
      icon: PenLine,
      color: '#3A913F',
      href: (id: string) => `/clients/${id}/copy`,
    },
    {
      id: 'calendar',
      label: 'Content Kalender',
      description: 'Plan social media posts per dag en platform — van concept tot gepost.',
      icon: CalendarDays,
      color: '#0ea5e9',
      href: (id: string) => `/clients/${id}/calendar`,
    },
    {
      id: 'events',
      label: 'Projectkalender',
      description: 'Overzicht van events, shoots, wedstrijden en deadlines.',
      icon: CalendarRange,
      color: '#a855f7',
      href: (id: string) => `/clients/${id}/events`,
    },
    {
      id: 'files',
      label: 'Bestanden',
      description: 'Upload, zoek en download bestanden van elk bestandstype.',
      icon: FolderOpen,
      color: '#3A913F',
      href: (id: string) => `/clients/${id}/files`,
    },
    ...(client.category === 'podcast' ? [{
      id: 'snippets',
      label: 'Mogelijke Snippits',
      description: 'Plak een transcript en AI selecteert de sterkste fragmenten voor Instagram Reels, TikTok en YouTube Shorts.',
      icon: Scissors,
      color: '#a21caf',
      href: (id: string) => `/clients/${id}/snippets`,
    }] : []),
    ...(client.name === 'Sporthouse' && canSeeWelkom ? [{
      id: 'welcome',
      label: 'Welkom stagiair',
      description: 'Alles wat je moet weten als je start bij Sporthouse — klanten, team, tools en praktische info.',
      icon: GraduationCap,
      color: '#f59e0b',
      href: () => `/welcome`,
    }] : []),
    ...(client.name === 'Sporthouse' && isAdmin ? [{
      id: 'analytics',
      label: 'Analytics',
      description: 'Website statistieken van sporthouse.be — sessies, gebruikers, verkeersbronnen en trends.',
      icon: BarChart2,
      color: '#0ea5e9',
      href: (id: string) => `/clients/${id}/analytics`,
    }] : []),
    ...(client.name === 'Sporthouse' && canSeeFinancien ? [{
      id: 'finance',
      label: 'Financiën',
      description: 'Financiële documenten uploaden en raadplegen — facturen, budgetten en rapporten.',
      icon: Landmark,
      color: '#0ea5e9',
      href: (id: string) => `/clients/${id}/finance`,
    }] : []),
    ...(client.name === 'Sporthouse' && canSeeAdministratie ? [{
      id: 'administration',
      label: 'Administratie',
      description: 'Administratieve documenten uploaden en raadplegen — contracten, HR en beleid.',
      icon: ClipboardList,
      color: '#a855f7',
      href: (id: string) => `/clients/${id}/administration`,
    }] : []),
    ...(client.name === 'i-fitness' ? [{
      id: 'briefing-builder',
      label: 'Briefing Builder',
      description: 'Stel taken op met een volledige briefing en push ze naar Asana of kopieer ze per mail.',
      icon: FileText,
      color: '#0ea5e9',
      href: (id: string) => `/clients/${id}/briefing-builder`,
    }] : []),
    ...(client.name === 'Unibet Experts' ? [{
      id: 'giveaway',
      label: 'Giveaway Tool',
      description: 'Upload de scraped reacties als CSV, filter op correct antwoord en kies automatisch een winnaar.',
      icon: Gift,
      color: '#057a55',
      href: (id: string) => `/clients/${id}/giveaway`,
    }, {
      id: 'content-planner',
      label: 'Content Planner',
      description: 'Plan posts tijdens de meeting en push ze in één klik naar Asana — inclusief WhatsApp-export.',
      icon: LayoutList,
      color: '#057a55',
      href: (id: string) => `/clients/${id}/content-planner`,
    }, {
      id: 'club-lookup',
      label: 'Club Lookup',
      description: 'Zoek de juiste interne benaming voor elke club — eén klik om te kopiëren, met seizoensupdate via Sofascore.',
      icon: Search,
      color: '#057a55',
      href: (id: string) => `/clients/${id}/club-lookup`,
    }] : []),
  ]
}
