import { pushToUsers } from '@/lib/poolwagens/push'

// Melding aan de medewerker die de opdracht maakte, bij een actie van de
// freelancer. Via de bestaande web-push (src/lib/poolwagens/push.ts): alleen
// wie push aanzette, krijgt iets; de rest ziet het in het tabblad Opdrachten
// en de activiteitenlog. Nooit een mail, nooit naar de freelancer.
export async function notifyCreator(createdBy: string | null, title: string, body: string, assignmentId: string): Promise<void> {
  if (!createdBy) return
  try {
    await pushToUsers([createdBy], { title, body, url: `/freelancers?opdracht=${assignmentId}` })
  } catch {
    /* een melding is een extraatje, nooit een voorwaarde */
  }
}
