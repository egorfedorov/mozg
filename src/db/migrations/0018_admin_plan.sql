-- ═══════════════════════════════════════════════════════════════════════════
-- 0018 — operator plan
--
-- The catalogue is seeded and maintained from the operator's own account, and
-- plan caps sized for customers (20 brains, $30/day of extraction) turn every
-- seeding session into a fight with the product's own guardrails. 'admin' is
-- a plan tier, not a bypass: every limit check keeps running, the numbers are
-- just sized for the person who pays the Anthropic bill directly.
-- ═══════════════════════════════════════════════════════════════════════════

alter table "user" drop constraint if exists user_plan_check;
alter table "user" add constraint user_plan_check
  check (plan in ('free', 'pro', 'team', 'admin'));
