-- One compiled lesson per module: an editor pass that orders a category's
-- notes pedagogically and writes the connective tissue (intro, section
-- leads). Keyed by a hash of the notes it was built from, so a module that
-- learned something new gets recompiled and a stale lesson is never served
-- as current.
create table lessons (
  brain_id uuid not null references brains(id) on delete cascade,
  category text not null,
  notes_hash text not null,
  payload jsonb not null,
  model text not null,
  created_at timestamptz not null default now(),
  primary key (brain_id, category)
);
