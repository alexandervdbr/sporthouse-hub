-- Post-launch audit, Critical #3: chat_reactions was created out-of-band at
-- some point and never captured in a migration — the exact "undocumented
-- table" gap 0028 was meant to close, that missed this one. Live shape
-- confirmed via a read-only information_schema/pg_constraint query before
-- writing this (not assumed): uuid PK, message_id -> chat_messages(id) on
-- delete cascade, unique (message_id, user_email, emoji), created_at
-- default now(). CREATE TABLE IF NOT EXISTS is a documentation no-op
-- against the live table — matches it exactly.
create table if not exists chat_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references chat_messages(id) on delete cascade,
  user_email text not null,
  emoji text not null,
  created_at timestamptz default now(),
  unique (message_id, user_email, emoji)
);
alter table chat_reactions enable row level security;

-- The live policy was a single "for all using (auth.role() = 'authenticated')"
-- with no WITH CHECK — Postgres falls back to reusing USING for the write
-- side of an ALL policy, so this was wide open for every action: any
-- authenticated user could delete or insert a reaction under ANY OTHER
-- user's email, not just their own (user_email is a plain client-supplied
-- field on insert, not derived from the session server-side).
--
-- Reading stays open on purpose — company chat itself is fully open to
-- every authenticated user (chat_messages/chat_channels), so a reaction on
-- a visible message should be visible too. The actual fix is ownership on
-- write: you can only add or remove your own reaction. Confirmed
-- ChatPage.tsx already only ever sends the real session email as
-- user_email (src/components/chat/ChatPage.tsx:414), so this doesn't
-- change any legitimate behavior.
drop policy if exists "Authenticated users can manage reactions" on chat_reactions;

create policy "Anyone authenticated can read reactions"
  on chat_reactions for select to authenticated
  using (true);

create policy "Users can add their own reactions"
  on chat_reactions for insert to authenticated
  with check (user_email = (auth.jwt() ->> 'email'));

create policy "Users can remove their own reactions"
  on chat_reactions for delete to authenticated
  using (user_email = (auth.jwt() ->> 'email'));
