-- Materiaalplanner: annuleringsmail. Het mail-logboek (0082) kent een derde
-- soort: 'annulering' (sleutel 'annulering', dus hooguit één per ontvanger).
-- Alleen de check op kind verandert; geen gegevens gewijzigd.

alter table public.gear_mail_log drop constraint if exists gear_mail_log_kind_check;
alter table public.gear_mail_log add constraint gear_mail_log_kind_check
  check (kind in ('bevestiging', 'herinnering', 'annulering'));
