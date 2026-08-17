-- Reel inspiration: Instagram Reels/Posts saved via the iOS Share Sheet
-- shortcut, auto-classified into a category for browsing.

-- Per-user secret token so the shortcut (a static config with no login flow)
-- can identify which user is saving. Only ever touched via the service role
-- from application code — never exposed to the anon/authenticated client,
-- since the token itself is the credential.
create table if not exists user_api_tokens (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);

alter table user_api_tokens enable row level security;

drop policy if exists "Service role beheert tokens" on user_api_tokens;
create policy "Service role beheert tokens"
  on user_api_tokens for all to service_role using (true);

create table if not exists reel_inspiration (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  url           text not null,
  thumbnail_url text,
  caption       text,
  author        text,
  embed_html    text,
  category      text,
  tags          text[] not null default '{}',
  confidence    text check (confidence in ('high', 'medium', 'low')),
  -- 'pending' until the background oEmbed + classification pass finishes,
  -- so /api/save-reel can return immediately after the insert.
  status        text not null default 'pending' check (status in ('pending', 'done', 'error')),
  error_message text,
  saved_at      timestamptz not null default now()
);

create index if not exists reel_inspiration_user_idx on reel_inspiration (user_id);
create index if not exists reel_inspiration_category_idx on reel_inspiration (category);

alter table reel_inspiration enable row level security;

-- Shared across the team like `posts`, not private like `client_favorites` —
-- this is content inspiration for clients, not a personal bookmark list.
drop policy if exists "Authenticated users can read reel_inspiration" on reel_inspiration;
create policy "Authenticated users can read reel_inspiration"
  on reel_inspiration for select to authenticated using (true);

drop policy if exists "Service role full access reel_inspiration" on reel_inspiration;
create policy "Service role full access reel_inspiration"
  on reel_inspiration for all to service_role using (true);
