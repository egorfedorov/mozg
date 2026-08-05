-- ═══════════════════════════════════════════════════════════════════════════
-- 0057 — gamification + operator settings
--
-- Achievements grow a second shape: account-wide badges ("made ten brains")
-- alongside the existing per-brain duel win. Global rows carry brain_id null,
-- so the old unique(user_id, brain_id, kind) can't referee them — a partial
-- unique index does. seen_at powers the mascot's notification badge: earned
-- but unseen is what the brain in the corner counts.
--
-- app_settings is a plain key/value drawer for the few things the operator
-- should be able to change without a deploy — first tenant: the mozgpay
-- receiving addresses.
-- ═══════════════════════════════════════════════════════════════════════════

alter table achievements alter column brain_id drop not null;
alter table achievements drop constraint if exists achievements_kind_check;
alter table achievements add column if not exists seen_at timestamptz;

-- Rows that predate the notification are old news, not a badge to pop.
update achievements set seen_at = now() where seen_at is null;

create unique index if not exists achievements_global_key
  on achievements (user_id, kind) where brain_id is null;

create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
