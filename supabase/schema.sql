-- SporthouseGroup Internal Platform — Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  logo_url TEXT,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  category TEXT NOT NULL DEFAULT 'klant', -- 'klant', 'atleet', 'podcast'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents table (knowledge base)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  file_url TEXT,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read clients"
  ON clients FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read documents"
  ON documents FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access clients"
  ON clients FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access documents"
  ON documents FOR ALL TO service_role USING (true);

-- Storage bucket for document files
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read documents" ON storage.objects;
DROP POLICY IF EXISTS "Service role can delete documents" ON storage.objects;

CREATE POLICY "Authenticated users can upload documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Authenticated users can read documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents');

CREATE POLICY "Service role can delete documents"
  ON storage.objects FOR DELETE TO service_role
  USING (bucket_id = 'documents');

-- ============================================================
-- FILES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  description TEXT,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read files" ON files;
DROP POLICY IF EXISTS "Authenticated users can insert files" ON files;
DROP POLICY IF EXISTS "Uploader can delete their own files" ON files;

CREATE POLICY "Authenticated users can read files"
  ON files FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert files"
  ON files FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Uploader can delete their own files"
  ON files FOR DELETE TO authenticated
  USING (uploaded_by = (auth.jwt() ->> 'email'));

-- Storage bucket for files
INSERT INTO storage.buckets (id, name, public)
VALUES ('files', 'files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read files storage" ON storage.objects;
DROP POLICY IF EXISTS "Uploader can delete their own file objects" ON storage.objects;

CREATE POLICY "Authenticated users can upload files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'files');

CREATE POLICY "Authenticated users can read files storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'files');

CREATE POLICY "Uploader can delete their own file objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'files');

-- ============================================================
-- MEETINGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  transcription TEXT NOT NULL DEFAULT '',
  summary TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read meetings" ON meetings;
DROP POLICY IF EXISTS "Authenticated users can insert meetings" ON meetings;

CREATE POLICY "Authenticated users can read meetings"
  ON meetings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert meetings"
  ON meetings FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- PLANNING TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS planning_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year INT NOT NULL,
  month INT NOT NULL,
  day INT NOT NULL,
  department TEXT NOT NULL,
  employee TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT planning_entries_unique UNIQUE(year, month, day, department, employee)
);

ALTER TABLE planning_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read planning" ON planning_entries;
DROP POLICY IF EXISTS "Authenticated users can upsert planning" ON planning_entries;
DROP POLICY IF EXISTS "Authenticated users can delete planning" ON planning_entries;

CREATE POLICY "Authenticated users can read planning"
  ON planning_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can upsert planning"
  ON planning_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update planning"
  ON planning_entries FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete planning"
  ON planning_entries FOR DELETE TO authenticated USING (true);

-- ============================================================
-- PROJECTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'actief' CHECK (status IN ('actief', 'in_review', 'gepauzeerd', 'voltooid')),
  due_date DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can insert projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can update projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can delete projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can read project_members" ON project_members;
DROP POLICY IF EXISTS "Authenticated users can insert project_members" ON project_members;
DROP POLICY IF EXISTS "Authenticated users can delete project_members" ON project_members;

CREATE POLICY "Authenticated users can read projects"
  ON projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert projects"
  ON projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update projects"
  ON projects FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete projects"
  ON projects FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read project_members"
  ON project_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert project_members"
  ON project_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete project_members"
  ON project_members FOR DELETE TO authenticated USING (true);

-- ============================================================
-- EXPERT AI TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS expert_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE expert_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read expert_documents" ON expert_documents;
DROP POLICY IF EXISTS "Authenticated users can insert expert_documents" ON expert_documents;
DROP POLICY IF EXISTS "Authenticated users can delete expert_documents" ON expert_documents;

CREATE POLICY "Authenticated users can read expert_documents"
  ON expert_documents FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert expert_documents"
  ON expert_documents FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete expert_documents"
  ON expert_documents FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS expert_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE expert_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read expert_messages" ON expert_messages;
DROP POLICY IF EXISTS "Authenticated users can insert expert_messages" ON expert_messages;

CREATE POLICY "Authenticated users can read expert_messages"
  ON expert_messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert expert_messages"
  ON expert_messages FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- COPY EXAMPLES TABLE (Copy Generator)
-- ============================================================

CREATE TABLE IF NOT EXISTS copy_examples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  platform TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE copy_examples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read copy_examples" ON copy_examples;
DROP POLICY IF EXISTS "Authenticated users can insert copy_examples" ON copy_examples;
DROP POLICY IF EXISTS "Authenticated users can delete copy_examples" ON copy_examples;

CREATE POLICY "Authenticated users can read copy_examples"
  ON copy_examples FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert copy_examples"
  ON copy_examples FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete copy_examples"
  ON copy_examples FOR DELETE TO authenticated USING (true);

-- ============================================================
-- POSTS TABLE (Live Shift)
-- ============================================================

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  template TEXT NOT NULL,
  home_team TEXT,
  away_team TEXT,
  score TEXT,
  player_name TEXT,
  match_day TEXT,
  thumbnail_url TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read posts" ON posts;
DROP POLICY IF EXISTS "Authenticated users can insert posts" ON posts;

CREATE POLICY "Authenticated users can read posts"
  ON posts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert posts"
  ON posts FOR INSERT TO authenticated WITH CHECK (true);

-- Storage bucket for post thumbnails
INSERT INTO storage.buckets (id, name, public)
VALUES ('posts', 'posts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload posts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read posts storage" ON storage.objects;

CREATE POLICY "Authenticated users can upload posts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'posts');

CREATE POLICY "Authenticated users can read posts storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'posts');

-- ============================================================
-- BIOCARTIS DOCUMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS biocartis_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  page_count INT,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE biocartis_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read biocartis_documents" ON biocartis_documents;
DROP POLICY IF EXISTS "Authenticated users can insert biocartis_documents" ON biocartis_documents;
DROP POLICY IF EXISTS "Authenticated users can delete biocartis_documents" ON biocartis_documents;

CREATE POLICY "Authenticated users can read biocartis_documents"
  ON biocartis_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert biocartis_documents"
  ON biocartis_documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete biocartis_documents"
  ON biocartis_documents FOR DELETE TO authenticated USING (true);

-- ============================================================
-- GIVEAWAYS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS giveaways (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  question TEXT,
  correct_answer TEXT NOT NULL,
  winner_username TEXT,
  total_comments INT NOT NULL DEFAULT 0,
  eligible_count INT NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE giveaways ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read giveaways" ON giveaways;
DROP POLICY IF EXISTS "Authenticated users can insert giveaways" ON giveaways;
DROP POLICY IF EXISTS "Authenticated users can delete giveaways" ON giveaways;

CREATE POLICY "Authenticated users can read giveaways"
  ON giveaways FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert giveaways"
  ON giveaways FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete giveaways"
  ON giveaways FOR DELETE TO authenticated USING (true);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Klanten
INSERT INTO clients (name, description, color, category) VALUES
  ('Pro League',               'Belgische professionele voetbalcompetitie',   '#1a56db', 'klant'),
  ('RBFA',                     'Royal Belgian Football Association',           '#e3a008', 'klant'),
  ('Unibet Experts',           'Unibet Experts content platform',              '#057a55', 'klant'),
  ('Sporza',                   'VRT sport media platform',                     '#dc2626', 'klant'),
  ('KRC Genk',                 'Belgische voetbalclub',                        '#1d4ed8', 'klant'),
  ('Club Brugge',              'Belgische voetbalclub',                        '#1e3a5f', 'klant'),
  ('RSC Anderlecht',           'Belgische voetbalclub',                        '#6d28d9', 'klant'),
  ('Flanders Classics',        'Organisator Belgische wielerwedstrijden',      '#d97706', 'klant'),
  ('Lotto Super League',       'Belgische vrouwenvoetbalcompetitie',           '#7e3af2', 'klant'),
  ('AG',                       'AG Insurance',                                 '#0891b2', 'klant'),
  ('i-fitness',                'Belgische fitnessketen',                       '#16a34a', 'klant'),
  ('PLAY',                     'PLAY Sports Network',                          '#ea580c', 'klant'),
  ('Play Sports',              'Play Sports zender',                           '#c2410c', 'klant'),
  ('Sport Vlaanderen',         'Vlaamse overheidsinstelling voor sport',       '#2563eb', 'klant'),
  ('Move To Cure',             'Sport voor het goede doel',                    '#db2777', 'klant'),
  ('Jan Vertonghen Foundation','Stichting van Jan Vertonghen',                 '#0f766e', 'klant'),
  ('Verstappen.com',           'Officieel platform Max Verstappen',            '#dc2626', 'klant')
ON CONFLICT DO NOTHING;

-- Atleten
INSERT INTO clients (name, description, color, category) VALUES
  ('Kevin De Bruyne',    'Belgisch voetballer — Manchester City',   '#6cb4e4', 'atleet'),
  ('Kos Karatsas',       'Belgisch voetballer',                     '#f59e0b', 'atleet'),
  ('Max Verstappen',     'Formule 1 wereldkampioen',                '#e11d48', 'atleet'),
  ('Maxim De Cuyper',    'Belgisch voetballer — Club Brugge',       '#1e3a5f', 'atleet'),
  ('Arthur Vermeeren',   'Belgisch voetballer — Atletico Madrid',   '#cc0000', 'atleet'),
  ('Dries Mertens',      'Belgisch voetballer',                     '#3b82f6', 'atleet'),
  ('Charles De Ketelaere','Belgisch voetballer — AC Milan',         '#cc0000', 'atleet')
ON CONFLICT DO NOTHING;

-- Interne organisaties
INSERT INTO clients (name, description, color, category) VALUES
  ('Sporthouse',         'Interne organisatie — Sporthouse',           '#3A913F', 'intern'),
  ('Friends of Sports',  'Interne organisatie — Friends of Sports',    '#0284c7', 'intern')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONTACTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read contacts" ON contacts;
DROP POLICY IF EXISTS "Authenticated users can insert contacts" ON contacts;
DROP POLICY IF EXISTS "Authenticated users can update contacts" ON contacts;
DROP POLICY IF EXISTS "Authenticated users can delete contacts" ON contacts;

CREATE POLICY "Authenticated users can read contacts"
  ON contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contacts"
  ON contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contacts"
  ON contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete contacts"
  ON contacts FOR DELETE TO authenticated USING (true);

-- Friends Of Sports — Podcasts
INSERT INTO clients (name, description, color, category) VALUES
  ('MIDMID',           'Friends Of Sports podcast',  '#a21caf', 'podcast'),
  ('90 MINUTES',       'Friends Of Sports podcast',  '#0284c7', 'podcast'),
  ('OEP Z''N BAKKES',  'Friends Of Sports podcast',  '#15803d', 'podcast'),
  ('VALS PLAT',        'Friends Of Sports podcast',  '#b45309', 'podcast'),
  ('KICK&RUSH',        'Friends Of Sports podcast',  '#0f766e', 'podcast'),
  ('BUITEN DE LIJNEN', 'Friends Of Sports podcast',  '#4338ca', 'podcast'),
  ('CROQUETA',         'Friends Of Sports podcast',  '#b91c1c', 'podcast'),
  ('X&O''s',           'Friends Of Sports podcast',  '#7c3aed', 'podcast'),
  ('BALLIEMAN',        'Friends Of Sports podcast',  '#0369a1', 'podcast'),
  ('Kartel',           'Friends Of Sports podcast',  '#1d4ed8', 'podcast')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONTENT PLANNER TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS content_planner_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  asana_project_gid TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT content_planner_config_client_unique UNIQUE(client_id)
);

CREATE TABLE IF NOT EXISTS content_planner_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('pm', 'designer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT content_planner_members_unique UNIQUE(client_id, contact_email)
);

ALTER TABLE content_planner_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_planner_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read content_planner_config" ON content_planner_config;
DROP POLICY IF EXISTS "Service role full access content_planner_config" ON content_planner_config;
CREATE POLICY "Authenticated users can read content_planner_config"
  ON content_planner_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access content_planner_config"
  ON content_planner_config FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "Authenticated users can read content_planner_members" ON content_planner_members;
DROP POLICY IF EXISTS "Service role full access content_planner_members" ON content_planner_members;
CREATE POLICY "Authenticated users can read content_planner_members"
  ON content_planner_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access content_planner_members"
  ON content_planner_members FOR ALL TO service_role USING (true);

-- ============================================================
-- CLUB LOOKUP TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS club_lookup_clubs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  competition TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  sofascore_id TEXT NOT NULL DEFAULT '',
  needs_name BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS club_lookup_competitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  sofascore_tournament_id TEXT NOT NULL,
  sofascore_season_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE club_lookup_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_lookup_competitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read club_lookup_clubs" ON club_lookup_clubs;
DROP POLICY IF EXISTS "Service role full access club_lookup_clubs" ON club_lookup_clubs;
CREATE POLICY "Authenticated users can read club_lookup_clubs"
  ON club_lookup_clubs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access club_lookup_clubs"
  ON club_lookup_clubs FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "Authenticated users can read club_lookup_competitions" ON club_lookup_competitions;
DROP POLICY IF EXISTS "Service role full access club_lookup_competitions" ON club_lookup_competitions;
CREATE POLICY "Authenticated users can read club_lookup_competitions"
  ON club_lookup_competitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access club_lookup_competitions"
  ON club_lookup_competitions FOR ALL TO service_role USING (true);

-- Seizoensupdate: niveau per competitie binnen een land
ALTER TABLE club_lookup_competitions
ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT NULL;

-- Content Planner: actieve PM per project
ALTER TABLE content_planner_config
ADD COLUMN IF NOT EXISTS active_pm_email TEXT DEFAULT NULL;

-- ============================================================
-- BRIEFING BUILDER TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS briefing_builder_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  asana_project_gid TEXT NOT NULL DEFAULT '',
  asana_extra_project_gids JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT briefing_builder_config_client_unique UNIQUE(client_id)
);

CREATE TABLE IF NOT EXISTS briefing_builder_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT briefing_builder_members_unique UNIQUE(client_id, contact_email)
);

ALTER TABLE briefing_builder_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefing_builder_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read briefing_builder_config" ON briefing_builder_config;
DROP POLICY IF EXISTS "Service role full access briefing_builder_config" ON briefing_builder_config;
CREATE POLICY "Authenticated users can read briefing_builder_config"
  ON briefing_builder_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access briefing_builder_config"
  ON briefing_builder_config FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "Authenticated users can read briefing_builder_members" ON briefing_builder_members;
DROP POLICY IF EXISTS "Service role full access briefing_builder_members" ON briefing_builder_members;
CREATE POLICY "Authenticated users can read briefing_builder_members"
  ON briefing_builder_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access briefing_builder_members"
  ON briefing_builder_members FOR ALL TO service_role USING (true);
