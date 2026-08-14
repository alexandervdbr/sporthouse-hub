-- Favorieten per gebruiker: vastgezette klanten die bovenaan de zijbalk komen.
--
-- Gekoppeld aan auth.users(id) in plaats van aan een e-mailadres, zodat row
-- level security op auth.uid() kan werken. Daardoor kan de browser deze tabel
-- rechtstreeks lezen en schrijven en is er geen API-route met de service role
-- nodig: een gebruiker ziet en wijzigt per definitie enkel zijn eigen rijen.

create table if not exists client_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  client_id  uuid not null references clients(id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

create index if not exists client_favorites_user_idx on client_favorites (user_id);

alter table client_favorites enable row level security;

drop policy if exists "Eigen favorieten" on client_favorites;
create policy "Eigen favorieten"
  on client_favorites
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
