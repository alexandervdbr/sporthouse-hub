-- Phase 5 of the pre-launch security remediation: ~20 tables existed live
-- but were never captured in any migration or schema.sql (confirmed by
-- diffing every table referenced via .from() in the app against every
-- CREATE TABLE in git). This migration is purely documentation — every
-- statement is a safe no-op against the live database (CREATE TABLE IF NOT
-- EXISTS, idempotent RLS enable, guarded CREATE POLICY blocks) — so a fresh
-- environment ends up with the same structure, and this repo can finally
-- reconstruct the real schema without a live DB connection.
--
-- NOT included here: `drive_files`, which src/app/api/drive/route.ts reads/
-- writes on every request but which does NOT exist in the live database at
-- all (confirmed via information_schema) — that's a live bug, not a
-- documentation gap, and needs a product decision (recreate the table, or
-- retire the route) rather than a silent CREATE TABLE guess here.

create extension if not exists "uuid-ossp";

-- ============================================================
-- chat_channels / chat_messages / chat_read_status
-- ============================================================
create table if not exists chat_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz default now(),
  category text not null default 'Algemeen',
  color text,
  sort_order integer default 0
);
alter table chat_channels enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_channels' and policyname = 'read channels') then
    execute $ddl$create policy "read channels" on chat_channels for select to authenticated using (true)$ddl$;
  end if;
end $$;

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references chat_channels(id),
  content text not null,
  created_by text not null,
  user_name text not null,
  created_at timestamptz default now(),
  attachment_url text,
  attachment_name text,
  attachment_type text
);
alter table chat_messages enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'read messages') then
    execute $ddl$create policy "read messages" on chat_messages for select to authenticated using (true)$ddl$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'insert messages') then
    execute $ddl$create policy "insert messages" on chat_messages for insert to authenticated with check (auth.email() = created_by)$ddl$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'delete own messages') then
    execute $ddl$create policy "delete own messages" on chat_messages for delete to authenticated using (auth.email() = created_by)$ddl$;
  end if;
end $$;

-- user_id inferred as auth.users(id) (standard Supabase convention, no
-- other table it could sensibly reference); live DB has no FK on this
-- column at all, so this is intentionally left unconstrained to match.
create table if not exists chat_read_status (
  user_id uuid not null,
  channel_id uuid not null references chat_channels(id),
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);
alter table chat_read_status enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_read_status' and policyname = 'Users manage own read status') then
    execute $ddl$create policy "Users manage own read status" on chat_read_status for all using (auth.uid() = user_id)$ddl$;
  end if;
end $$;

-- ============================================================
-- project_events (created before content_posts, which has a FK to it)
-- ============================================================
create table if not exists project_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  end_date date,
  time text,
  client_id uuid references clients(id),
  description text,
  type text,
  created_by text,
  created_at timestamptz default now()
);
alter table project_events enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'project_events' and policyname = 'Authenticated read') then
    execute $ddl$create policy "Authenticated read" on project_events for select to authenticated using (true)$ddl$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'project_events' and policyname = 'Authenticated insert') then
    execute $ddl$create policy "Authenticated insert" on project_events for insert to authenticated with check (true)$ddl$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'project_events' and policyname = 'Authenticated update') then
    execute $ddl$create policy "Authenticated update" on project_events for update to authenticated using (true)$ddl$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'project_events' and policyname = 'Authenticated delete') then
    execute $ddl$create policy "Authenticated delete" on project_events for delete to authenticated using (true)$ddl$;
  end if;
end $$;

-- ============================================================
-- content_posts
-- ============================================================
create table if not exists content_posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  title text not null,
  copy text,
  platform text,
  status text not null default 'concept',
  scheduled_date date not null,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  scheduled_time text,
  format text,
  creator text,
  collab text,
  link text,
  event_id uuid references project_events(id)
);
alter table content_posts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'content_posts' and policyname = 'Authenticated users full access') then
    execute $ddl$create policy "Authenticated users full access" on content_posts for all to authenticated using (true) with check (true)$ddl$;
  end if;
end $$;

-- ============================================================
-- copy_types — RLS enabled, no policies live: locked to anon/authenticated,
-- only the service-role/admin client (used by every call site) can touch it.
-- ============================================================
create table if not exists copy_types (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  name text not null,
  created_at timestamptz default now()
);
alter table copy_types enable row level security;

-- ============================================================
-- day_projects
-- ============================================================
create table if not exists day_projects (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  project_name text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table day_projects enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'day_projects' and policyname = 'Authenticated users full access') then
    execute $ddl$create policy "Authenticated users full access" on day_projects for all to authenticated using (true) with check (true)$ddl$;
  end if;
end $$;

-- ============================================================
-- equipment / equipment_reservations
-- ============================================================
create table if not exists equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text,
  created_at timestamptz default now(),
  is_broken boolean not null default false,
  broken_note text
);
alter table equipment enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'equipment' and policyname = 'Authenticated users full access') then
    execute $ddl$create policy "Authenticated users full access" on equipment for all to authenticated using (true) with check (true)$ddl$;
  end if;
end $$;

create table if not exists equipment_reservations (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id),
  reserved_by text not null,
  date date not null,
  note text,
  created_at timestamptz default now(),
  pickup_datetime timestamptz,
  return_datetime timestamptz,
  project text
);
alter table equipment_reservations enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'equipment_reservations' and policyname = 'Authenticated users full access') then
    execute $ddl$create policy "Authenticated users full access" on equipment_reservations for all to authenticated using (true) with check (true)$ddl$;
  end if;
end $$;

-- ============================================================
-- external_rentals — no update policy live (deliberately or not; documented
-- as-is, not assumed)
-- ============================================================
create table if not exists external_rentals (
  id uuid primary key default uuid_generate_v4(),
  item_name text not null,
  supplier text,
  start_date date not null,
  end_date date not null,
  total_cost numeric,
  project text,
  note text,
  created_at timestamptz default now()
);
alter table external_rentals enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'external_rentals' and policyname = 'Authenticated users can read external_rentals') then
    execute $ddl$create policy "Authenticated users can read external_rentals" on external_rentals for select to authenticated using (true)$ddl$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'external_rentals' and policyname = 'Authenticated users can insert external_rentals') then
    execute $ddl$create policy "Authenticated users can insert external_rentals" on external_rentals for insert to authenticated with check (true)$ddl$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'external_rentals' and policyname = 'Authenticated users can delete external_rentals') then
    execute $ddl$create policy "Authenticated users can delete external_rentals" on external_rentals for delete to authenticated using (true)$ddl$;
  end if;
end $$;

-- ============================================================
-- file_folders — RLS enabled, no policies live: service-role/admin client
-- only (matches src/app/api/folders/**, which always uses createAdminClient())
-- ============================================================
create table if not exists file_folders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  name text not null,
  parent_id uuid references file_folders(id),
  created_by text,
  created_at timestamptz default now(),
  drive_folder_id text
);
alter table file_folders enable row level security;

-- ============================================================
-- freelancers / freelancer_projects / freelancer_assignments /
-- freelancer_assignment_files
-- ============================================================
create table if not exists freelancers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text,
  phone text,
  specialties text[] default '{}',
  hourly_rate numeric,
  bio text,
  created_at timestamptz default now(),
  types text[] default '{}',
  tested text,
  price_info text,
  rating integer,
  portfolio_url text,
  notes text,
  avatar_url text
);
alter table freelancers enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'freelancers' and policyname = 'Auth read freelancers') then
    execute $ddl$create policy "Auth read freelancers" on freelancers for select to authenticated using (true)$ddl$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'freelancers' and policyname = 'Auth insert freelancers') then
    execute $ddl$create policy "Auth insert freelancers" on freelancers for insert to authenticated with check (true)$ddl$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'freelancers' and policyname = 'Auth update freelancers') then
    execute $ddl$create policy "Auth update freelancers" on freelancers for update to authenticated using (true)$ddl$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'freelancers' and policyname = 'Auth delete freelancers') then
    execute $ddl$create policy "Auth delete freelancers" on freelancers for delete to authenticated using (true)$ddl$;
  end if;
end $$;

create table if not exists freelancer_projects (
  id uuid primary key default uuid_generate_v4(),
  freelancer_id uuid not null references freelancers(id),
  project_name text not null,
  client_name text,
  date date,
  score integer,
  notes text,
  created_at timestamptz default now(),
  description text
);
alter table freelancer_projects enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'freelancer_projects' and policyname = 'Auth read freelancer_projects') then
    execute $ddl$create policy "Auth read freelancer_projects" on freelancer_projects for select to authenticated using (true)$ddl$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'freelancer_projects' and policyname = 'Auth insert freelancer_projects') then
    execute $ddl$create policy "Auth insert freelancer_projects" on freelancer_projects for insert to authenticated with check (true)$ddl$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'freelancer_projects' and policyname = 'Auth delete freelancer_projects') then
    execute $ddl$create policy "Auth delete freelancer_projects" on freelancer_projects for delete to authenticated using (true)$ddl$;
  end if;
end $$;

-- RLS enabled, no policies live: service-role/admin client only (matches
-- src/app/api/freelancers/**, which always uses createAdminClient())
create table if not exists freelancer_assignments (
  id uuid primary key default gen_random_uuid(),
  freelancer_id uuid not null references freelancers(id),
  title text not null,
  briefing text,
  deadline date,
  client_name text,
  status text not null default 'nieuw',
  created_by text,
  created_at timestamptz default now()
);
alter table freelancer_assignments enable row level security;

create table if not exists freelancer_assignment_files (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references freelancer_assignments(id),
  file_name text not null,
  file_url text not null,
  file_size bigint,
  file_type text,
  uploaded_at timestamptz default now()
);
alter table freelancer_assignment_files enable row level security;

-- ============================================================
-- liveshift_embargo_docs
-- ============================================================
create table if not exists liveshift_embargo_docs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  filename text not null,
  content text not null,
  page_count integer,
  uploaded_by text,
  created_at timestamptz default now()
);
alter table liveshift_embargo_docs enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'liveshift_embargo_docs' and policyname = 'authenticated users can manage embargo docs') then
    execute $ddl$create policy "authenticated users can manage embargo docs" on liveshift_embargo_docs for all to authenticated using (true) with check (true)$ddl$;
  end if;
end $$;

-- ============================================================
-- planning_config — RLS enabled, no policies live: service-role/admin
-- client only
-- ============================================================
create table if not exists planning_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
alter table planning_config enable row level security;

-- ============================================================
-- preassist_editions / preassist_submissions
-- ============================================================
create table if not exists preassist_editions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  active boolean default false,
  created_at timestamptz default now()
);
alter table preassist_editions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'preassist_editions' and policyname = 'Authenticated') then
    execute $ddl$create policy "Authenticated" on preassist_editions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated')$ddl$;
  end if;
end $$;

create table if not exists preassist_submissions (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid references preassist_editions(id),
  section text not null,
  title text,
  file_url text,
  file_name text not null,
  file_type text not null,
  file_size bigint,
  submitted_by_id text,
  submitted_by_name text,
  created_at timestamptz default now(),
  client_id uuid references clients(id),
  client_name text,
  storage_provider text not null default 'drive',
  drive_file_id text,
  web_view_link text,
  web_content_link text,
  thumbnail_link text
);
alter table preassist_submissions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'preassist_submissions' and policyname = 'Authenticated') then
    execute $ddl$create policy "Authenticated" on preassist_submissions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated')$ddl$;
  end if;
end $$;

-- ============================================================
-- push_subscriptions — user_id has no FK live (documented as-is, not assumed)
-- ============================================================
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_name text,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
alter table push_subscriptions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_subscriptions' and policyname = 'Users manage own subscriptions') then
    execute $ddl$create policy "Users manage own subscriptions" on push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id)$ddl$;
  end if;
end $$;

-- ============================================================
-- sporthouse_documents — RLS enabled, no policies live: service-role/admin
-- client only (matches src/app/api/sporthouse/documents/**)
-- ============================================================
create table if not exists sporthouse_documents (
  id uuid primary key default gen_random_uuid(),
  section text not null,
  filename text not null,
  description text,
  file_type text not null default '',
  file_size bigint not null default 0,
  storage_path text,
  uploaded_by text,
  created_at timestamptz default now(),
  storage_provider text default 'supabase',
  drive_file_id text,
  deleted_at timestamptz,
  deleted_by text,
  folder_id uuid references sporthouse_document_folders(id)
);
alter table sporthouse_documents enable row level security;
