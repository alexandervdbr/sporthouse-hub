-- Een inzending heeft nu drie dingen te zeggen in plaats van twee.
--
-- title werd bij Inspiratie het onderwerp — de kop waaronder een handvol
-- links bij elkaar komt te staan (0059 + de groepering). Daarmee verdween de
-- plek voor "waarom stuur ik dit in", terwijl dat bij inspiratie juist het
-- stuk is dat het verschil maakt tussen een link en een link met een reden.
--
-- Dus: title = waar het bij hoort, note = wat je erover wil zeggen.
--
-- Optioneel en additief: bestaande rijen houden hun title en krijgen note
-- null, en er verandert niets aan hoe ze getoond worden.

begin;

alter table preassist_submissions
  add column if not exists note text;

commit;
