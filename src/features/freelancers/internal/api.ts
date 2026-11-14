import { send } from '@/components/materiaal/ui'
import type { AssignmentDetail, AssignmentRow, Discipline, Freelancer, LinkStatus } from './types'

// De interne API, voor de browser. Fouten komen als leesbare Error terug (send).
const F = '/api/freelancers'

export const internalApi = {
  list: (archief = false) => send<Freelancer[]>(`${F}${archief ? '?archief=1' : ''}`, 'GET'),
  get: (id: string) => send<Freelancer>(`${F}/${id}`, 'GET'),
  create: (body: object) => send<Freelancer>(F, 'POST', body),
  update: (id: string, body: object) => send<Freelancer>(`${F}/${id}`, 'PATCH', body),
  rating: (id: string, overall_rating: number | null, overall_rating_note: string | null) =>
    send<Freelancer>(`${F}/${id}/rating`, 'PUT', { overall_rating, overall_rating_note }),
  archive: (id: string, archived: boolean) => send<Freelancer>(`${F}/${id}/archive`, archived ? 'POST' : 'DELETE'),
  disciplines: () => send<Discipline[]>(`${F}/disciplines`, 'GET'),

  link: (id: string) => send<LinkStatus>(`${F}/${id}/link`, 'GET'),
  newLink: (id: string) => send<{ url: string; pin: string }>(`${F}/${id}/link`, 'POST'),
  newPin: (id: string) => send<{ pin: string }>(`${F}/${id}/link/pin`, 'POST'),
  linkUrl: (id: string) => send<{ url: string }>(`${F}/${id}/link/url`, 'GET'),
  revokeLink: (id: string) => send<null>(`${F}/${id}/link`, 'DELETE'),

  assignments: (freelancerId?: string) => send<AssignmentRow[]>(`${F}/assignments${freelancerId ? `?freelancer=${freelancerId}` : ''}`, 'GET'),
  assignment: (id: string) => send<AssignmentDetail>(`${F}/assignments/${id}`, 'GET'),
  createAssignment: (body: object) => send<{ assignment: AssignmentRow; link: { url: string; pin: string } | null; shareError?: string }>(`${F}/assignments`, 'POST', body),
  updateAssignment: (id: string, body: object) => send<AssignmentRow>(`${F}/assignments/${id}`, 'PATCH', body),
  transition: (id: string, to: string, message?: string) =>
    send<{ assignment: AssignmentRow; link: { url: string; pin: string } | null }>(`${F}/assignments/${id}/transition`, 'POST', { to, message: message || null }),
  review: (id: string, body: object) => send<unknown>(`${F}/assignments/${id}/review`, 'PUT', body),
  uploadSession: (id: string, files: { name: string; size: number; mimeType: string }[]) =>
    send<{ uploadUrls: string[] }>(`${F}/assignments/${id}/files/upload-session`, 'POST', { files }),
  finalize: (id: string, uploads: { uploadUrl: string; size: number }[]) =>
    send<{ results: ({ ok: true; id: string; name: string } | { ok: false; error: string })[] }>(`${F}/assignments/${id}/files/finalize`, 'POST', { uploads }),
  deleteFile: (id: string, fileId: string) => send<null>(`${F}/assignments/${id}/files/${fileId}`, 'DELETE'),
  fileUrl: (id: string, fileId: string) => `${F}/assignments/${id}/files/${fileId}`,

  match: (description: string, discipline: string | null, deadline: string | null) =>
    send<{ kandidaten: number; matches: { id: string; rank: number; reden: string; aandachtspunt: string | null; freelancer: { id: string; name: string } }[] }>(
      `${F}/match`, 'POST', { description, discipline, deadline }),
}

export function shareMessage(name: string, url: string) {
  const first = name.trim().split(/\s+/)[0] || name
  return `Hoi ${first}, er staat een nieuwe opdracht voor je klaar: ${url}`
}
