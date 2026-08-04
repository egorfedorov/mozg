-- Hierarchical memory: one auto-synthesised summary per category, read first
-- by brain_brief so an agent gets the map before the territory.
--
-- A side table, NOT a note with kind='summary': the lesson compiler and the
-- learn pages read every active note of a category, so a summary stored as a
-- note would leak into study material and force a lesson recompile on every
-- refresh. The lessons table (0029) is the proven pattern for derived
-- per-category content — keyed by a hash of the notes it was built from, so a
-- category that learned something new gets re-summarised and a stale summary
-- is never served as current.
--
-- Search never sees these by construction: searchBrain runs over chunks of
-- notes, and summaries are neither. That is the deliberate choice — summaries
-- are for the brief, not for diluting retrieval (every summary restates what
-- its category's notes already say, so indexing it would only add a fuzzy
-- duplicate to every result list).
create table summaries (
  brain_id   uuid not null references brains(id) on delete cascade,
  category   text not null,
  notes_hash text not null,
  body       text not null,
  note_count int not null,
  model      text not null,
  created_at timestamptz not null default now(),
  primary key (brain_id, category)
);
