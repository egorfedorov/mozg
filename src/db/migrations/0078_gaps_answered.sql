-- ═══════════════════════════════════════════════════════════════════════════
-- 0078 — a gap can be closed by the material arriving
--
-- The three statuses assumed a person: pending until somebody accepted or
-- dismissed it. Nobody did, and 1074 rows accumulated — which is not a queue
-- of work, it is a wall.
--
-- Most of those are not decisions waiting to be made. They are questions the
-- brain could not answer at the time and can answer now, because the source
-- that covers them was read last week. 'answered' is that: closed by the
-- world moving, not by anyone's judgement, and kept distinct from 'accepted'
-- so the owner's own decisions stay legible.
-- ═══════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

alter table gap_suggestions drop constraint if exists gap_suggestions_status_check;
alter table gap_suggestions add constraint gap_suggestions_status_check
  check (status in ('pending', 'accepted', 'dismissed', 'answered'));
