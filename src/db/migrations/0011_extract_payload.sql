-- Cached extraction results, so a pg-boss retry does not buy them twice.
--
-- pg-boss retries a failed ingest job as a whole. Without this column a flake
-- at the embed stage — after the Anthropic extraction already succeeded —
-- re-ran the extraction too, billing for the same bytes again. ingest.ts
-- writes the payload right after extraction and reads it back on retry.
-- Kept after success (a few KB per source; enables re-chunking without
-- re-buying); maintenance clears it when a page's text actually changes.

alter table sources add column if not exists extract_payload jsonb;
