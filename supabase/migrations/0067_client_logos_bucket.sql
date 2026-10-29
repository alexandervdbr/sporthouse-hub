-- Opslag voor klantlogo's, zodat een logo geüpload kan worden in plaats van
-- als link geplakt.
--
-- Publiek leesbaar: logo's staan in de zijbalk, op kaarten en in de kalender,
-- en dragen niets gevoeligs. Schrijven gaat alleen via /api/admin/clients/logo
-- met de service role, dus er zijn geen schrijfpolicies nodig. De browser
-- verkleint het beeld vooraf tot max. 256 px, vandaar de lage limiet.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-logos', 'client-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
