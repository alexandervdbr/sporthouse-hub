-- Separates the status ("PS", "SHG", ...) from any extra detail people used
-- to type into the same cell (e.g. "PS - F1 (RC RACING)") — every day with
-- the same status should look identical (same pill, same color), with the
-- specifics shown as a secondary note instead of becoming a one-off status
-- of its own.
alter table planning_entries add column if not exists note text;
