-- ═══════════════════════════════════════════════════════════════════════════
-- 0017 — secret-scan waiver
--
-- Documentation about credentials contains things that look exactly like
-- credentials (the MCP inspector page ships example tokens), and the scanner
-- cannot tell an example from a leak. The owner can: waiving a source is a
-- deliberate, recorded decision to let a specific source through the gate.
-- The findings stay stored so the decision is auditable, and the flag lives
-- on the source — it never widens to the brain or the account.
-- ═══════════════════════════════════════════════════════════════════════════

alter table sources add column if not exists scan_waived boolean not null default false;
