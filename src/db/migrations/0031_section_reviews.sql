-- Whole lesson sections join the spaced-repetition loop: when a study
-- sitting ends, each section it touched earns an aggregate grade and is
-- scheduled like any card, keyed by a deterministic hash of its content
-- (see sectionKey in src/lib/learn.ts). Sections carry no notes/checks row
-- of their own — item_id is the hash, the lesson payload holds the text.
alter table learn_progress drop constraint learn_progress_kind_check;
alter table learn_progress add constraint learn_progress_kind_check
  check (kind in ('note', 'check', 'section'));
