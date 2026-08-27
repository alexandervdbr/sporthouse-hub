-- Favorieten per gebruiker op tool-niveau (bv. "Content Kalender" voor één
-- specifieke klant), naast de bestaande hele-klant-favorieten in
-- client_favorites. Zelfde patroon: gekoppeld aan auth.users(id) zodat RLS
-- op auth.uid() werkt, dus de browser leest/schrijft rechtstreeks zonder
-- API-route nodig.
create table if not exists client_tool_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  client_id  uuid not null references clients(id)    on delete cascade,
  tool       text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, client_id, tool)
);

create index if not exists client_tool_favorites_user_idx on client_tool_favorites (user_id);

alter table client_tool_favorites enable row level security;

drop policy if exists "Eigen tool-favorieten" on client_tool_favorites;
create policy "Eigen tool-favorieten"
  on client_tool_favorites
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
