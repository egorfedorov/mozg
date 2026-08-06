-- 0067 — contributions: a reader's agent may propose, never publish
--
-- The refusal this replaces read "You have read-only access to
-- mozg/slot-animation-craft." — sent to someone whose agent had just learned
-- something worth keeping about that very brain. The knowledge was thrown
-- away at exactly the moment the collective mind was supposed to pay off.
--
-- Opening writes to readers would be the other mistake: a public brain anyone
-- can write to is a public brain anyone can poison, and the owner's name and
-- exam score are on it.
--
-- So: a reader proposes. A proposal is an ordinary pending note — invisible to
-- search, absent from the exam, attributed to the person who sent it — and the
-- owner approves or rejects it with the buttons that already exist. Nothing a
-- stranger writes can change an answer before a human has seen it, which is
-- the whole safety argument in one sentence.

-- The owner's switch. Default on: a proposal cannot do harm while it waits,
-- and a brain that never hears from its readers is the thing this fixes. An
-- owner who wants none of it turns it off in the share settings.
alter table brains add column if not exists contributions boolean not null default true;

-- Who sent it. Null on every note that predates this and on the owner's own
-- writes; set on anything a reader proposed. It is what lets the review screen
-- show a track record ("3 of 4 earlier proposals accepted") instead of asking
-- the owner to judge a stranger's note with nothing to go on.
alter table notes add column if not exists proposed_by text
  references "user"(id) on delete set null;

-- The review screen counts a proposer's accepted and rejected notes; without
-- this it is a sequential scan of every note in the product per pending row.
create index if not exists notes_proposed_by_idx
  on notes (proposed_by, status) where proposed_by is not null;
