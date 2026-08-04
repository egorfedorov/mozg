-- Exam regressions: when a re-sit fails a check that passed in the previous
-- sitting, the answer went stale — usually because the crawler re-read a
-- rewritten page and the notes moved. That transition is the one signal an
-- owner cannot see in the score alone (a 86 -> 84 could be anything), so it
-- is recorded explicitly and surfaced on the brain page until the check
-- passes again.
--
-- check_runs.kind tells the cheap probe apart from a real sitting: a "mini"
-- run re-judges the existing checks with a single judge vote after a
-- content-refresh re-ingest, never generates checks, and does not move the
-- brain's official score. The kind also keeps mini probes from counting
-- against a plan's exam sittings.
alter table check_runs add column kind text not null default 'full'
  check (kind in ('full', 'mini'));

create table exam_regressions (
  id          uuid primary key default gen_random_uuid(),
  brain_id    uuid not null references brains(id) on delete cascade,
  check_id    uuid not null references checks(id) on delete cascade,
  -- The sitting that first saw the flip, for forensics.
  run_id      uuid not null references check_runs(id) on delete cascade,
  -- What the check was before it broke. Only 'passed' today; kept as a
  -- column so a future 'unknown' (new check, no history) does not need a
  -- migration.
  prev_status text not null default 'passed',
  detected_at timestamptz not null default now(),
  resolved    boolean not null default false,
  resolved_at timestamptz
);

-- One open regression per check: a check that keeps failing across runs is
-- one stale answer, not a new one every sitting.
create unique index exam_regressions_open_idx on exam_regressions (check_id)
  where not resolved;

create index exam_regressions_brain_idx on exam_regressions (brain_id, detected_at desc);
