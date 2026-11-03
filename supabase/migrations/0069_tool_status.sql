-- Dev-modus per tool: een admin zet een tool (Planning, Materiaal, …) op
-- "in ontwikkeling" in Beheer → Tools. Admins blijven hem gewoon zien en
-- kunnen op het live platform testen; alle anderen krijgen een melding in
-- plaats van de tool. Zie src/lib/tool-status.ts.
--
-- Volledig additief: niets bestaands wordt aangeraakt. Ontbreekt een tool in
-- deze tabel, dan staat hij gewoon live — er hoeft dus niets ingevuld.
--
-- Nummer 0069 en niet 0068: die zit al op feature/materiaalplanning-v2.

create table if not exists tool_status (
  tool           text primary key,
  in_development boolean not null default false,
  message        text,
  updated_at     timestamptz not null default now(),
  updated_by     text
);

alter table tool_status enable row level security;

-- Lezen mag iedereen die ingelogd is: de app moet bij elke sessie weten
-- welke tools in ontwikkeling staan, en dat is geen geheim.
drop policy if exists "Toolstatus lezen" on tool_status;
create policy "Toolstatus lezen"
  on tool_status for select to authenticated using (true);

-- Schrijven alleen via de server (Beheer → Tools controleert op admin).
drop policy if exists "Service role beheert toolstatus" on tool_status;
create policy "Service role beheert toolstatus"
  on tool_status for all to service_role using (true);
