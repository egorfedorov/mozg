-- Every paid model call in one place. Extraction and exams already record
-- their cost on sources/check_runs, but lessons and summaries spent silently
-- — the accounting flattered us by exactly the amount we could not see.
create table spend (
  id bigserial primary key,
  kind text not null,
  brain_id uuid references brains(id) on delete set null,
  cents real not null,
  model text,
  created_at timestamptz not null default now()
);

create index spend_recent_idx on spend (created_at desc);
