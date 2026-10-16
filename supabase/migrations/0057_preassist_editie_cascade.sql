-- Een editie verwijderen deed niets, en zei dat ook niet.
--
-- preassist_submissions.edition_id verwijst naar preassist_editions(id) zonder
-- on delete cascade. Een editie met inzendingen verwijderen levert dus een
-- foreign key violation — en EditionModal keek niet naar die error, riep
-- gewoon onRefresh() aan en liet de editie staan. Je klikte "Zeker?", er
-- gebeurde niets, en je kreeg geen melding.
--
-- Twee dingen hieronder:
--
-- 1. De FK krijgt on delete cascade, zodat het verwijderen van een editie de
--    inzendingen meeneemt. De trigger uit 0048 schrijft elke drive_file_id
--    eerst in drive_id_deletion_log, dus de bestanden blijven terug te vinden
--    ook als iets dit buiten de app om doet. De app zelf zet ze eerst in
--    Drive's prullenbak (zie /api/preassist/editions) — deze cascade is het
--    vangnet, niet de route die normaal gelopen wordt.
--
-- 2. Eén actieve editie activeren gaat via één statement in plaats van twee
--    losse updates. Het waren:
--        update ... set active = false where id <> target
--        update ... set active = true  where id  = target
--    zonder foutcontrole, met een moment tussenin waarop er geen enkele
--    actieve editie is. Valt de tweede weg, dan blijft dat zo, en de pagina
--    zegt "Geen actieve editie" terwijl er niets stuk is.
--
-- Geen unieke index op active: die zou een statement dat álle rijen bijwerkt
-- halverwege kunnen laten struikelen op een conflict dat aan het einde niet
-- meer bestaat. Het enkele statement hieronder is de garantie.
--
-- Let op bij uitvoeren: dit is onomkeerbaar, en op dit Supabase-plan staat er
-- geen point-in-time recovery onder. De cascade verwijdert geen enkele rij op
-- het moment dat je deze migratie draait — hij bepaalt alleen wat er gebeurt
-- bij een latere delete.

begin;

-- De naam van de constraint is niet gegarandeerd, dus eerst opzoeken welke
-- FK op edition_id staat in plaats van een naam aannemen.
do $$
declare
  fk_name text;
begin
  select con.conname into fk_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'preassist_submissions'
    and con.contype = 'f'
    and con.conkey = array[
      (select attnum from pg_attribute where attrelid = rel.oid and attname = 'edition_id')
    ]::smallint[];

  if fk_name is not null then
    execute format('alter table preassist_submissions drop constraint %I', fk_name);
  end if;

  alter table preassist_submissions
    add constraint preassist_submissions_edition_id_fkey
    foreign key (edition_id) references preassist_editions(id) on delete cascade;
end $$;

-- Security invoker (de standaard), dus de RLS-policy uit 0032 blijft gelden:
-- alleen wie preassist_beheer heeft — of een account zonder ingestelde
-- permissies — mag edities bijwerken. De functie verruimt niets, ze maakt er
-- één statement van.
create or replace function public.preassist_set_active_edition(target uuid)
returns void
language sql
as $$
  update preassist_editions set active = (id = target);
$$;

commit;
