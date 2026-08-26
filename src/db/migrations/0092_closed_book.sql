-- The exam has always asked its questions with the brain already in front of
-- the judge. That measures whether a corpus is self-consistent. It does not
-- measure what the brain is worth, which is the only thing anyone is buying.
--
-- react scores 94 because a corpus containing react.dev answers questions
-- written from react.dev — against a model that already answers ~90 of them
-- with no brain at all. stake-engine scores 88 against a baseline near zero.
-- On the shelf those two numbers sat side by side, sorted best-first, which
-- means the catalogue has been sorted worst-first since it opened.
--
-- So every check now also carries a CLOSED-BOOK verdict: the same question,
-- the same judge, the same rubric — with the model's own unaided answer in
-- place of the retrieved passages. score minus score_closed is the number
-- worth publishing, and the only one an outsider can check.
--
-- Cached on the check, not recomputed per sitting, and that is the entire cost
-- argument. A model's own knowledge does not change between two sittings a
-- week apart; the question set does. Exams already dominate model spend
-- ($11.57/day against $3.87 for ingest) with no platform budget guard, so
-- paying once per question instead of once per sitting is what keeps this from
-- doubling the largest line in the bill.
alter table checks
  add column closed_passed boolean,
  add column closed_at     timestamptz,
  -- Which model was asked. A closed-book verdict is a fact about one model on
  -- one day; when MODEL_JUDGE changes, every cached verdict is stale and the
  -- run re-asks rather than subtracting two different models from each other.
  add column closed_model  text;

-- delta is generated, never written. A hand-maintained difference is a third
-- number that can disagree with the two it came from, and this product's whole
-- claim is that its numbers cannot.
alter table brains
  add column score_closed int,
  add column delta int generated always as (score - score_closed) stored;

-- Both halves of the sitting that produced them, so a delta can be traced to
-- the run that measured it rather than to whatever the brain says today.
alter table check_runs
  add column score_closed int;

-- What the catalogue sorts on.
create index brains_delta_idx on brains (delta desc nulls last)
  where visibility = 'public';
