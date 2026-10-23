-- Weten wanneer Google het laat afweten, zonder dat iemand het moet melden.
--
-- Op 21 oktober 2026 gaf Drive een tijd lang "Internal Error" terug. Dat kwam
-- aan het licht doordat één iemand toevallig aan het uploaden was en er een
-- screenshot van stuurde. Niemand anders wist het, en achteraf was er niets
-- terug te vinden: geen tijdstip, geen duur, geen logboek.
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
  message     text
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

commit;
