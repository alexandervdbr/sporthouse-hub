-- Weten wanneer Google het laat afweten, zonder dat iemand het moet melden.
--
-- Op 21 oktober 2026 gaf Drive een tijd lang "Internal Error" terug. Dat kwam
-- aan het licht doordat één iemand toevallig aan het uploaden was en er een
-- screenshot van stuurde. Niemand anders wist het, en achteraf was er niets
-- terug te vinden: geen logboek, geen tijdstip, geen idee hoe lang het duurde.
--
-- Vanaf hier schrijft withDriveRetry (lib/drive-storage) een rij weg zodra hij
-- het na vier pogingen opgeeft op een fout die duidelijk van Google komt. Dus
-- niet bij elke hapering — alleen als er echt iemand een foutmelding op zijn
-- scherm kreeg.
--
-- Die rijen doen twee dingen: ze voeden de banner in de app (actief zolang er
-- recent fouten zijn, daarna vanzelf weg) en ze zijn het logboek dat er
-- vorige keer niet was.

begin;

create table if not exists drive_incidents (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  -- Welke Drive-aanroep het betrof: "map aanmaken", "sessie openen", …
  source      text,
  message     text,
  -- Gezet zodra hierover een melding naar de admins ging. Dubbel gebruik:
  -- het is ook de afkoelperiode, zie claim_drive_alert hieronder.
  alerted_at  timestamptz
);

create index if not exists drive_incidents_occurred_at_idx
  on drive_incidents (occurred_at desc);

alter table drive_incidents enable row level security;

-- Iedereen die ingelogd is mag ze lezen: de banner draait bij elke medewerker
-- en moet weten of er iets loopt. Schrijven doet alleen de server.
drop policy if exists "Authenticated can read drive incidents" on drive_incidents;
create policy "Authenticated can read drive incidents"
  on drive_incidents for select to authenticated using (true);

-- De banner verschijnt live bij wie de app open heeft staan, zonder periodiek
-- bevragen — zie de toelichting in CLAUDE.md over timers en verbruik.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'drive_incidents'
  ) then
    alter publication supabase_realtime add table drive_incidents;
  end if;
end $$;

-- Precies één melding per storing, niet één per mislukte upload.
--
-- Tijdens een storing faalt elke upload van iedereen; zonder dit zou er een
-- stroom notificaties uitgaan. Deze functie geeft alleen `true` terug aan de
-- eerste aanroeper binnen de afkoelperiode — de rest krijgt `false` en stuurt
-- niets.
--
-- De advisory lock maakt dat waterdicht: serverless-aanroepen draaien naast
-- elkaar, en zonder die lock kunnen twee instanties allebei zien dat er nog
-- geen melding uitging.
create or replace function public.claim_drive_alert(incident uuid, cooldown interval default '30 minutes')
returns boolean
language plpgsql
as $$
declare
  claimed boolean;
begin
  perform pg_advisory_xact_lock(hashtext('drive_alert'));

  if exists (select 1 from drive_incidents where alerted_at > now() - cooldown) then
    return false;
  end if;

  update drive_incidents set alerted_at = now() where id = incident;
  get diagnostics claimed = row_count;
  return claimed;
end $$;

commit;
