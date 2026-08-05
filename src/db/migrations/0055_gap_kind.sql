-- 0055 — a gap suggestion says which kind of gap it is
--
-- Suggestions were only filed when a check failed with zero retrieval hits, so
-- they all meant one thing: material is absent, pick a source. That is the rare
-- case once retrieval works. The common failure is a note that was in front of
-- the judge and did not answer — and "add a source" is the wrong fix for it, as
-- is "add a source" for a negative probe the brain bluffed through.
--
-- See src/lib/gap-kind.ts for what each kind means and what fixes it.

alter table gap_suggestions
  add column if not exists kind text not null default 'missing'
    check (kind in ('missing', 'thin', 'retrieval', 'bluff'));

-- Existing rows were all filed on the zero-hit path, which is exactly what
-- 'missing' means — the default is already correct for them.
