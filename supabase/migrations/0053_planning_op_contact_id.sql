-- De planning koppelen aan de persoon in plaats van aan zijn naam.
--
-- planning_entries stond op (jaar, maand, dag, afdeling, naam) — allemaal
-- tekst. Dat betekende dat iemand hernoemen of naar een andere afdeling
-- verplaatsen geen tekstwijziging was maar een verhuizing: elke rij moest mee,
-- of ze bleven achter onder een naam die nergens meer bestond. In oktober 2026
-- kostte dat ~3.800 verweesde rijen en twee dagen opruimen.
--
-- Vanaf hier hangt een dag aan een contact_id. Hernoemen in Team plant zich
-- vanzelf voort, want er is geen kopie meer van die naam. Van afdeling
-- wisselen ook niet, want de afdeling staat niet meer op de regel.
--
-- Gevolg van dat laatste, bewust: wie van afdeling verandert neemt zijn hele
-- geschiedenis mee naar de nieuwe. Eén persoon, één werkgeschiedenis. Waar
-- iemand destijds zat is daarmee niet meer af te lezen uit de planning.
--
-- Dit kan nu goedkoop omdat planning_entries zo goed als leeg is na de
-- opschoning. Met een jaar aan planning erin was dit een heel ander verhaal.
--
-- Alles staat in één transactie en breekt af bij het eerste dat niet klopt.
-- Half gemigreerd is hier erger dan niet gemigreerd.

begin;

-- ── 1. planning_entries ────────────────────────────────────────────────────

-- on delete restrict en niet cascade: een contact verwijderen mag niet stil
-- iemands planning meenemen. De database weigert het nu, en de Team-pagina
-- maakt daar een leesbare melding van. Dat is dezelfde regel als het
-- geblokkeerde prullenbakje in de planning, maar dan afgedwongen op de plek
-- waar hij hoort.
alter table planning_entries
  add column if not exists contact_id uuid references contacts(id) on delete restrict;

-- Een naam die bij twee contacten past zou willekeurig gekoppeld worden.
-- Liever stoppen.
do $$
declare dubbel text;
begin
  select string_agg(distinct e.employee, ', ') into dubbel
    from planning_entries e
   where e.contact_id is null
     and (select count(*) from contacts c
           join clients cl on cl.id = c.client_id and cl.category = 'intern'
          where lower(trim(c.name)) = lower(trim(e.employee))) > 1;
  if dubbel is not null then
    raise exception 'Deze namen passen bij meer dan één Team-contact: %', dubbel;
  end if;
end $$;

update planning_entries e
   set contact_id = c.id
  from contacts c
  join clients cl on cl.id = c.client_id and cl.category = 'intern'
 where e.contact_id is null
   and lower(trim(c.name)) = lower(trim(e.employee));

do $$
declare n int; namen text;
begin
  select count(*), string_agg(distinct department || ' — ' || employee, ', ')
    into n, namen
    from planning_entries where contact_id is null;
  if n > 0 then
    raise exception 'Kon % rij(en) niet aan een contact koppelen: %', n, namen;
  end if;
end $$;

alter table planning_entries alter column contact_id set not null;

alter table planning_entries drop constraint if exists planning_entries_unique;
alter table planning_entries
  add constraint planning_entries_unique unique (year, month, day, contact_id);

alter table planning_entries drop column if exists department;
alter table planning_entries drop column if exists employee;

-- ── 2. planning_links ──────────────────────────────────────────────────────

alter table planning_links
  add column if not exists contact_id uuid references contacts(id) on delete cascade;

update planning_links l
   set contact_id = c.id
  from contacts c
  join clients cl on cl.id = c.client_id and cl.category = 'intern'
 where l.contact_id is null
   and lower(trim(c.name)) = lower(trim(l.employee));

-- Een link die nergens meer naar wijst heeft geen betekenis; die trekken we in
-- in plaats van de migratie te laten vallen.
update planning_links
   set revoked_at = coalesce(revoked_at, now())
 where contact_id is null;

delete from planning_links where contact_id is null and revoked_at is not null;

alter table planning_links alter column contact_id set not null;
alter table planning_links drop column if exists department;
alter table planning_links drop column if exists employee;

drop index if exists planning_links_person_idx;
create index if not exists planning_links_contact_idx on planning_links (contact_id);

-- ── 3. Het rooster in planning_config ──────────────────────────────────────
--
-- Van [{name, employees: ["Naam", …]}] naar [{name, employees: [uuid, …]}].
-- De naam leeft vanaf nu alleen nog in contacts.

do $$
declare
  oud jsonb;
  nieuw jsonb;
  aantal_oud int;
  aantal_nieuw int;
begin
  select value into oud from planning_config where key = 'departments';
  if oud is null then return; end if;

  select jsonb_agg(
           jsonb_build_object(
             'name', d.value->>'name',
             'employees', coalesce((
               select jsonb_agg(c.id order by emp.ordinality)
                 from jsonb_array_elements_text(d.value->'employees')
                      with ordinality as emp(naam, ordinality)
                 join contacts c on lower(trim(c.name)) = lower(trim(emp.naam))
                 join clients cl on cl.id = c.client_id and cl.category = 'intern'
             ), '[]'::jsonb)
           )
           order by d.ordinality
         )
    into nieuw
    from jsonb_array_elements(oud) with ordinality as d(value, ordinality);

  select coalesce(sum(jsonb_array_length(d->'employees')), 0) into aantal_oud
    from jsonb_array_elements(oud) d;
  select coalesce(sum(jsonb_array_length(d->'employees')), 0) into aantal_nieuw
    from jsonb_array_elements(nieuw) d;

  if aantal_oud <> aantal_nieuw then
    raise exception
      'Rooster: % namen vooraf, % gekoppeld. Er is er minstens één die niet in Team staat.',
      aantal_oud, aantal_nieuw;
  end if;

  update planning_config set value = nieuw, updated_at = now() where key = 'departments';
end $$;

-- ── 4. De archieflijst ─────────────────────────────────────────────────────
--
-- Van [{dept, emp}] naar [uuid]. Een naam die niet meer bij een contact hoort
-- valt weg: archiveren is een weergavekeuze, daar gaat niets verloren.

do $$
declare oud jsonb; nieuw jsonb;
begin
  select value into oud from planning_config where key = 'archived_employees';
  if oud is null then return; end if;

  select coalesce(jsonb_agg(c.id), '[]'::jsonb) into nieuw
    from jsonb_array_elements(oud) a
    join contacts c on lower(trim(c.name)) = lower(trim(a.value->>'emp'))
    join clients cl on cl.id = c.client_id and cl.category = 'intern';

  update planning_config set value = nieuw, updated_at = now()
   where key = 'archived_employees';
end $$;

commit;
