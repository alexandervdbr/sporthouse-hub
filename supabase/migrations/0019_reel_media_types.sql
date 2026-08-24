-- Media types (Video/Motion/Grafisch/Foto/...) move from a hardcoded list to
-- a real table so permitted staff can add new ones (e.g. "3D") without a
-- code change — the classifier prompt is built from this table at
-- classification time, so it always considers whatever currently exists.
create table if not exists reel_media_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table reel_media_types enable row level security;

drop policy if exists "Authenticated users can read reel_media_types" on reel_media_types;
create policy "Authenticated users can read reel_media_types"
  on reel_media_types for select to authenticated using (true);

drop policy if exists "Service role full access reel_media_types" on reel_media_types;
create policy "Service role full access reel_media_types"
  on reel_media_types for all to service_role using (true);

insert into reel_media_types (name) values ('Video'), ('Motion'), ('Grafisch'), ('Foto')
  on conflict (name) do nothing;

alter publication supabase_realtime add table reel_media_types;
