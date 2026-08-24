-- Live-updates the "Mijn gedacht!" grid across viewers as items get saved,
-- classified, edited, or deleted — no polling/manual refresh needed. Same
-- Realtime mechanism already used for chat_messages (see Sidebar.tsx).
alter publication supabase_realtime add table reel_inspiration;
