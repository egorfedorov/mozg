-- 0070 — generation: paying an artist every time their style is used
--
-- Buying a style brain pays its author once. This is the other half of the
-- argument on /styles: an agent that generates in someone's manner should pay
-- them for that, per image, forever — "not once, when a scraper passed
-- through. Every time."
--
-- Money moves before the picture exists, and that ordering is the whole
-- design. The buyer is debited when the row is created, inside the same
-- transaction that creates it, so two tabs cannot spend the same balance
-- twice. The artist is credited only when an image actually lands. A failure
-- refunds the buyer and pays nobody — which is why the row carries its own
-- prices rather than reading them from the brain later: the brain's price can
-- change between the debit and the refund, and a refund that returns a
-- different number than it took is a bug that looks like theft.
create table if not exists generations (
  id           uuid primary key default gen_random_uuid(),
  brain_id     uuid not null references brains(id) on delete cascade,
  buyer_id     text not null references "user"(id) on delete cascade,
  -- Denormalised on purpose: the artist may transfer or delete the brain, and
  -- the payout still has to know who earned it.
  artist_id    text not null references "user"(id) on delete cascade,

  prompt       text not null,
  -- What we actually sent the image model: the style's own rules, compiled in
  -- front of the buyer's sentence. Kept because it is the evidence that the
  -- style was applied at all — the thing the buyer paid for.
  full_prompt  text,

  price_cents  int  not null,
  artist_cents int  not null,
  -- What the model charged us. Null until it answers; the margin is only real
  -- once this is filled in.
  cost_cents   int,

  status       text not null default 'queued'
                 check (status in ('queued', 'running', 'done', 'failed')),
  error        text,
  storage_key  text,
  -- apimart's task id, so a stuck run can be chased by hand.
  task_id      text,

  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);

-- The buyer's own history, newest first — the only listing this needs.
create index if not exists generations_buyer_idx
  on generations (buyer_id, created_at desc);

-- What an artist earned, and what a style is actually used for.
create index if not exists generations_brain_idx
  on generations (brain_id, created_at desc);

-- The ledger gains two more reasons for money to move. `generation` is the
-- buyer's debit; the artist's credit reuses `earning`, the same kind a sale
-- pays them under, so one payout query still sees everything they are owed.
alter table ledger drop constraint if exists ledger_kind_check;
alter table ledger add constraint ledger_kind_check
  check (kind in ('topup', 'purchase', 'earning', 'payout', 'refund',
                  'adjustment', 'plan', 'generation'));
