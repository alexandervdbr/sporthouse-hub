-- category was a second, fixed classification axis on top of media_type and
-- free-form tags — one dimension too many. Fold any existing category value
-- into tags (so nothing is lost/unsearchable) instead of a separate field,
-- then drop the column.
update reel_inspiration
set tags = array_append(tags, category)
where category is not null and not (category = any(tags));

alter table reel_inspiration drop column category;
