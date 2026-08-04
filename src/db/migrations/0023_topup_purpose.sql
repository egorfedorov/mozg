-- ═══════════════════════════════════════════════════════════════════════════
-- 0023 — top-ups that know what they are for
--
-- Direct crypto checkout: an invoice can carry the intent "buy this brain".
-- The money still lands as an ordinary balance credit first — the purchase is
-- a follow-up that draws from it, so a failed follow-up (price changed, brain
-- deleted) degrades to money on the balance, never money lost.
-- ═══════════════════════════════════════════════════════════════════════════

alter table topups add column if not exists purpose text not null default 'topup';
alter table topups add column if not exists buy_brain_id uuid
  references brains(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'topups_purpose_check') then
    alter table topups add constraint topups_purpose_check
      check (purpose in ('topup', 'buy'));
  end if;
end $$;
