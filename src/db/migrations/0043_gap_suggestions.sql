-- Gap suggestions: when the exam fails a positive check with zero retrieval
-- hits, the material is simply absent — so the exam files a suggestion the
-- owner can act on from the brain page. Nothing is added automatically: the
-- owner picks the source, the suggestion only remembers what is missing.
--
-- check_id cascades: regenerated exams delete their generated checks, and a
-- suggestion about a question nobody asks anymore is noise.
create table gap_suggestions (
  id          uuid primary key default gen_random_uuid(),
  brain_id    uuid not null references brains(id) on delete cascade,
  check_id    uuid references checks(id) on delete cascade,
  question    text not null,
  status      text not null default 'pending'
              check (status in ('pending', 'accepted', 'dismissed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  -- One row per check: a re-failed check updates nothing, and a dismissed
  -- suggestion stays dismissed instead of re-appearing after every exam.
  unique (brain_id, check_id)
);

create index gap_suggestions_brain_idx on gap_suggestions (brain_id, status);
