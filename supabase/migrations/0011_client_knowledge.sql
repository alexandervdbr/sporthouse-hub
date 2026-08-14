-- Kennisbank per klant: één rij per beantwoorde vraag.
--
-- De vragen zelf staan in code (src/lib/kennisbank-questions.ts) zodat elke
-- klant dezelfde lijst krijgt; hier staan alleen de antwoorden. question_key
-- verwijst naar de sleutel daar en mag dus nooit hernoemd worden.
--
-- Als data in plaats van als document, omdat Expert AI, de Copy Generator en de
-- Briefing Builder deze antwoorden rechtstreeks als context gebruiken. Een RTF
-- was daar ongeschikt voor: opmaakcodes in plaats van tekst, en sinds de
-- verhuizing naar Drive niet eens meer leesbaar voor de AI.

create table if not exists client_knowledge (
  client_id    uuid not null references clients(id) on delete cascade,
  question_key text not null,
  answer       text not null default '',
  updated_at   timestamptz not null default now(),
  updated_by   text,
  primary key (client_id, question_key)
);

create index if not exists client_knowledge_client_idx on client_knowledge (client_id);

alter table client_knowledge enable row level security;

-- Alle toegang loopt via /api/kennisbank, dat klanttoegang en het recht om te
-- bewerken controleert.
drop policy if exists "Service role beheert kennisbank" on client_knowledge;
create policy "Service role beheert kennisbank"
  on client_knowledge for all to service_role using (true);
