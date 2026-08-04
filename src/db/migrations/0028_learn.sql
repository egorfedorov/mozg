-- Spaced-repetition progress for humans learning a brain. One row per person
-- per card; a card is either a note (lesson side) or a check (quiz side).
-- The knowledge itself stays in notes/checks — this table only remembers when
-- this person should see each card again.
create table learn_progress (
  user_id text not null references "user"(id) on delete cascade,
  brain_id uuid not null references brains(id) on delete cascade,
  kind text not null check (kind in ('note', 'check')),
  item_id uuid not null,
  due_at timestamptz not null default now(),
  interval_days real not null default 0,
  ease real not null default 2.5,
  reps int not null default 0,
  lapses int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);

create index learn_due_idx on learn_progress (user_id, brain_id, due_at);
