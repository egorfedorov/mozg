-- ═══════════════════════════════════════════════════════════════════════════
-- 0075 — where two brains in a pack say different things
--
-- A pack is several brains bought together and read together: the agent asks
-- the compliance brain one minute and the RGS brain the next, and both answer
-- with the same flat confidence. When they disagree — one says the floor is
-- 92%, the other 94% — nothing today notices. The agent picks whichever note
-- ranked first and reports it as the answer, which is precisely the failure
-- this product exists to argue against, reproduced inside our own catalogue.
--
-- So the disagreements get found and written down. Not merged: consolidation
-- (worker/consolidate.ts) merges near-duplicates *inside* one brain, where one
-- owner and one exam decide what is true. Across brains there is no such
-- authority — two sources genuinely say different things, and the honest
-- product move is to publish the conflict rather than pick a winner behind the
-- reader's back.
--
-- Every judged pair lands here, including the ones judged innocent. That is
-- the point of the `clear` status: candidate pairs are found by vector
-- distance and re-found every night, and without a memory of "we already
-- looked at these two" the nightly pass would buy the same verdict forever.
-- ═══════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

create table if not exists contradictions (
  id        uuid primary key default gen_random_uuid(),

  -- Ordered by id, so one pair is one row whichever side the kNN reached
  -- first — the unique below only means anything with the check above it.
  note_a    uuid not null references notes(id) on delete cascade,
  note_b    uuid not null references notes(id) on delete cascade,
  check (note_a < note_b),

  -- What made them candidates. Kept so a threshold change can be argued about
  -- against real rows instead of re-run to find out.
  distance  real not null,

  -- open      the judge found a real conflict, and it is unresolved
  -- clear     the judge looked and found none: do not pay for this pair again
  -- dismissed a human says the judge was wrong
  status    text not null default 'open'
            check (status in ('open', 'clear', 'dismissed')),

  -- Only for 'open'. The subject is what they disagree *about*, in a few
  -- words; the claims are each side in one sentence, so a reader (and an
  -- agent mid-answer) sees the shape of the conflict without opening both.
  subject   text,
  claim_a   text,
  claim_b   text,

  judged_at timestamptz not null default now(),

  unique (note_a, note_b)
);

-- The unique index above serves lookups by note_a; the reverse direction needs
-- its own, because a search hit can be either side of a pair.
create index if not exists contradictions_b_idx on contradictions (note_b);

-- The read paths (a pack page, a search result) only ever want the open ones,
-- and they will always be a small minority of the rows.
create index if not exists contradictions_open_idx on contradictions (status)
  where status = 'open';
