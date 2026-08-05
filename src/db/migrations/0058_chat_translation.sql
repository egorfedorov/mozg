-- ═══════════════════════════════════════════════════════════════════════════
-- 0058 — chat translation
--
-- The operator reads and writes Russian; the audience mostly doesn't. Two
-- columns make the bridge:
--
--   translation  — cached Russian rendering of a user-authored message,
--                  filled lazily the first time the operator views it. Equal
--                  to body when the message was already Russian (the marker
--                  that stops re-asking the model on every render).
--   source_body  — the operator's original Russian when body is the
--                  translated text that was actually sent. The user sees
--                  body; the operator sees both.
-- ═══════════════════════════════════════════════════════════════════════════

alter table chat_messages add column if not exists translation text;
alter table chat_messages add column if not exists source_body text;
