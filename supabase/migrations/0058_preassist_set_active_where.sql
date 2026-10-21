-- 0057 maakte preassist_set_active_edition als:
--
--   update preassist_editions set active = (id = target);
--
-- Eén statement over alle rijen, en precies daar struikelt het over:
--
--   Activeren mislukt: UPDATE requires a WHERE clause
--
-- Dat is pg_safeupdate, dat op Supabase voor de rol authenticated aanstaat en
-- elke UPDATE zonder WHERE tegenhoudt. De oude code van vóór 0057 liep er niet
-- tegenaan omdat beide losse updates wél een where hadden (.neq / .eq).
--
-- De where hieronder is geen formaliteit om die guard tevreden te stellen: hij
-- raakt alleen de rijen waar de waarde daadwerkelijk verandert, dus hooguit
-- twee — de editie die aangaat en die welke uitgaat. Het blijft één statement,
-- dus er is nog steeds geen moment waarop er geen actieve editie is. Dat was
-- de hele reden om hier een functie van te maken.
--
-- `is distinct from` in plaats van `<>`: active is nullable (zie 0028), en
-- NULL <> false is NULL — zo'n rij zou stil blijven staan waar hij staat.
--
-- Verder een expliciete controle dat de editie bestaat. Zonder dat zet een
-- onbekende id alles op niet-actief, en zegt de pagina "Nog geen editie"
-- terwijl er niets stuk is. Dat gold voor de twee losse updates van vroeger
-- net zo goed; nu het toch één plek is, kan het er meteen uit.

begin;

create or replace function public.preassist_set_active_edition(target uuid)
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from preassist_editions where id = target) then
    raise exception 'Editie bestaat niet.' using errcode = 'no_data_found';
  end if;

  update preassist_editions
  set active = (id = target)
  where active is distinct from (id = target);
end $$;

commit;
