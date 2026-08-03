-- The consolidation worker (src/worker/consolidate.ts) writes merged notes
-- with author 'consolidated', so the history view can tell a machine-written
-- merge apart from extraction ('ingest') and agent lessons ('agent') — a bad
-- merge is the thing you most want to find and undo later.
--
-- Postgres auto-named the original inline constraint notes_author_check
-- (0001_app.sql).

-- if exists: the name is Postgres's own for the inline check in 0001, but a
-- migration that cannot be run twice is a migration that fails a re-run for
-- the wrong reason.
alter table notes drop constraint if exists notes_author_check;
alter table notes add constraint notes_author_check
  check (author in ('ingest', 'human', 'agent', 'consolidated'));
