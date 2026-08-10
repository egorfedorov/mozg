-- ═══════════════════════════════════════════════════════════════════════════
-- 0077 — what the money was actually spent on
--
-- sources.cost_cents is a single number, and a single number cannot answer the
-- only question that matters when a bill looks big: was it the reading or the
-- writing? Working that out took a detour through chunks.token_count and a
-- pile of arithmetic, and it landed on "two thirds of extraction is output" —
-- which changes what you would cut. Nobody should have to do that twice, and
-- no dashboard can show it from one column.
--
-- Cheap to keep: two ints on a row that is written once per source.
-- ═══════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

alter table sources add column if not exists input_tokens  int;
alter table sources add column if not exists output_tokens int;

comment on column sources.input_tokens is
  'Model input tokens spent reading this source, summed over its segments.';
comment on column sources.output_tokens is
  'Model output tokens spent writing its notes. Output bills ~5x input.';
