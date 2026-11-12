-- Visual similarity: each catalog item records the id of its style vector in
-- attributes.vectorId. Search results come back as vector ids, so this index
-- turns them into catalog rows.
create index catalog_items_vector_id_idx
  on public.catalog_items ((attributes ->> 'vectorId'))
  where attributes ? 'vectorId';
