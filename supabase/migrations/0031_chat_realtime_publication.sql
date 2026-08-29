-- Confirmed via a read-only check (pg_publication_tables) that chat_messages
-- is already in the supabase_realtime publication in production — this is
-- what makes live chat delivery work today. It was never captured in a
-- migration though, so there was no record of it surviving e.g. a database
-- restore. Purely documentation: adding a table that's already in the
-- publication is a no-op, guarded here so it's also safe to run against an
-- environment where it isn't (yet) added.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table chat_messages;
  end if;
end $$;
