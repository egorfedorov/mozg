-- ═══════════════════════════════════════════════════════════════════════════
-- 0025 — mozgpay grows coins
--
-- BTC amounts need eight decimals (a satoshi is 1e-8), and an invoice now
-- names its coin so the watcher knows which chain to read and the page knows
-- what to print.
-- ═══════════════════════════════════════════════════════════════════════════

alter table topups alter column pay_amount type numeric(24, 8);
alter table topups add column if not exists pay_coin text;
