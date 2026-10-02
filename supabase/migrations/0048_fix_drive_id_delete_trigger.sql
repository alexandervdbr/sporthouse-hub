-- Een map verwijderen mislukte altijd met:
--   record "old" has no field "drive_file_id"
--
-- De triggerfunctie uit 0034 bedient vier tabellen en koos de tak met
--   if TG_TABLE_NAME = 'files' and OLD.drive_file_id is not null then
-- PL/pgSQL evalueert zo'n voorwaarde als één SQL-expressie, dus het veld
-- OLD.drive_file_id wordt opgezocht ongeacht de uitkomst van de eerste helft.
-- Bij een rij uit file_folders — die drive_folder_id heeft en geen
-- drive_file_id — faalt dat, en daarmee de hele verwijdering.
--
-- Opgelost door eerst alleen op de tabelnaam te vertakken en pas binnen die
-- tak naar velden te kijken. PL/pgSQL bereidt een statement pas voor bij de
-- eerste uitvoering, dus een tak die niet aan de beurt komt raakt het veld
-- ook nooit aan.
--
-- Verder identiek aan 0034: dezelfde kolommen, dezelfde logging.
create or replace function public.log_drive_id_before_delete()
returns trigger
language plpgsql
as $$
begin
  if TG_TABLE_NAME = 'files' then
    if OLD.drive_file_id is not null then
      insert into drive_id_deletion_log (source_table, record_id, client_id, drive_id, kind, name, web_view_link)
      values ('files', OLD.id, OLD.client_id, OLD.drive_file_id, 'file', OLD.filename, OLD.web_view_link);
    end if;

  elsif TG_TABLE_NAME = 'file_folders' then
    if OLD.drive_folder_id is not null then
      insert into drive_id_deletion_log (source_table, record_id, client_id, drive_id, kind, name)
      values ('file_folders', OLD.id, OLD.client_id, OLD.drive_folder_id, 'folder', OLD.name);
    end if;

  elsif TG_TABLE_NAME = 'drive_files' then
    if OLD.drive_file_id is not null then
      insert into drive_id_deletion_log (source_table, record_id, client_id, drive_id, kind, name)
      values ('drive_files', OLD.id, OLD.client_id, OLD.drive_file_id, 'file', OLD.name);
    end if;

  elsif TG_TABLE_NAME = 'preassist_submissions' then
    if OLD.drive_file_id is not null then
      insert into drive_id_deletion_log (source_table, record_id, client_id, drive_id, kind, name, web_view_link)
      values ('preassist_submissions', OLD.id, OLD.client_id, OLD.drive_file_id, 'file', OLD.file_name, OLD.web_view_link);
    end if;
  end if;

  return OLD;
end;
$$;
