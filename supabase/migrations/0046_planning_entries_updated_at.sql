-- updated_by was already being written on every save but never read back or
-- shown anywhere; updated_at didn't exist at all (an upsert doesn't bump a
-- plain default-now() column on its own, only on insert). Both are now set
-- explicitly on every write (see PlanningApp's writeEntries) so the
-- DayEditor can show a "last edited by X, on Y" trace per cell.
alter table planning_entries add column if not exists updated_at timestamptz;
