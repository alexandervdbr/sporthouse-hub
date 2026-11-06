-- Materiaalplanner: logboek van de verstuurde mails (bevestiging bij boeken of
-- nieuwe data, herinnering op de ochtend van de terugbrengdag).
--
-- Eén rij per boeking × soort × sleutel × ontvanger. De hub schrijft de rij
-- vóór het versturen; de unieke sleutel zorgt dat dezelfde mail nooit twee
-- keer vertrekt, ook niet als de dagelijkse trigger twee keer loopt. Mislukt
-- het versturen, dan blijft de rij met de fout staan (geen tweede poging).
--
--   bevestiging: sleutel = 'begin|einde' (nieuwe data → nieuwe bevestiging)
--   herinnering: sleutel = de terugbrengdag
--
-- Alleen de server (service key) leest en schrijft; RLS aan zonder policies.

create table if not exists public.gear_mail_log (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.gear_bookings(id) on delete cascade,
  kind       text not null check (kind in ('bevestiging', 'herinnering')),
  key        text not null,
  recipient  text not null check (recipient = lower(btrim(recipient)) and recipient <> ''),
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  error      text,
  constraint gear_mail_log_once unique (booking_id, kind, key, recipient)
);
create index if not exists gear_mail_log_created_idx on public.gear_mail_log (created_at);

alter table public.gear_mail_log enable row level security;
revoke all on public.gear_mail_log from anon, authenticated;
