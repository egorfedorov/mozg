-- Chunk lookups by note were seq-scanning chunks.
--
-- Every supersede path deletes chunks by note_id (maintenance refresh, ingest
-- dedup), and the FK cascade from notes does the same — all without an index
-- on the referencing side.

create index if not exists chunks_note_idx on chunks (note_id);
