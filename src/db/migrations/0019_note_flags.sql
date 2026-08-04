-- ═══════════════════════════════════════════════════════════════════════════
-- 0019 — agents flag notes
--
-- Thousands of agent sessions read these notes; when one catches a note being
-- wrong or stale mid-task, that observation is worth more than any scheduled
-- check — but until now it had nowhere to go. A flag is a report, not an
-- edit: the note keeps answering until the owner decides, because "an agent
-- disagreed once" must not be able to silence a correct note.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists note_flags (
  id         uuid primary key default gen_random_uuid(),
  brain_id   uuid not null references brains(id) on delete cascade,
  note_id    uuid not null references notes(id) on delete cascade,
  caller_id  text not null references "user"(id) on delete cascade,
  reason     text not null,
  created_at timestamptz not null default now(),
  -- One open flag per reader per note: repeating a report adds noise, not
  -- signal. A second agent flagging the same note is a second row — that
  -- count is the priority order for the owner.
  unique (note_id, caller_id)
);

create index if not exists note_flags_brain_idx on note_flags (brain_id, created_at desc);
