-- Een preset met pensioen sturen, zonder de geschiedenis onleesbaar te maken.
--
-- Er was één knop voor twee verschillende dingen. "Verwijderen" wordt in de
-- praktijk gebruikt om een status niet meer aan te bieden, maar het doet iets
-- anders: de cellen houden hun tekst en kleur, maar de dageditor herkent ze
-- niet meer ("geen bestaande status") en in de statistieken vallen ze onder
-- Overig. Stil, en pas maanden later zichtbaar.
--
-- archived_at splitst dat. Een gearchiveerde preset verdwijnt uit de kiezer
-- maar blijft bestaan voor alles wat terugleest. Verwijderen blijft wat het
-- is — voor een typefout, niet voor een status die zijn werk gedaan heeft —
-- en vertelt vanaf nu eerst op hoeveel dagen hij staat.
alter table planning_presets
  add column if not exists archived_at timestamptz;

-- Niet elke afwezigheid is een vraag die je in cijfers wil. NB staat voor
-- "niet beschikbaar" en is een roosterafspraak, geen verlof- of ziektedag:
-- in een overzicht van opgenomen dagen is het ruis.
--
-- Dit is bewust een veld en geen lijst met namen in de code. Precies dat soort
-- naamregel is waar deze planning eerder op stukliep.
alter table planning_presets
  add column if not exists in_stats boolean not null default true;

update planning_presets
   set in_stats = false
 where upper(trim(name)) = 'NB';
