-- Videothumbnails maken we voortaan zelf: bij het uploaden pakt de browser
-- een frame uit de video en slaat dat als los JPEG op in Drive. Deze kolom
-- wijst naar dat bestand. Drive's eigen voorbeeld blijft het vangnet voor
-- rijen waar dit leeg is — oudere video's, of formaten die de browser niet
-- kan decoderen.
alter table files add column if not exists poster_drive_file_id text;
