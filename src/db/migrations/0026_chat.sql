-- ═══════════════════════════════════════════════════════════════════════════
-- 0026 — chatmozg
--
-- One thread per user, straight to the operator. Email is the wrong shape
-- for a product whose users live in chat windows all day — but a chat with
-- no friction fills with "hi". The friction lives in the write path: a
-- minimum of substance and a daily cap, stated honestly in the UI.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists chat_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null references "user"(id) on delete cascade,
  author     text not null check (author in ('user', 'operator')),
  body       text not null,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index if not exists chat_user_idx on chat_messages (user_id, created_at);
create index if not exists chat_unread_idx on chat_messages (created_at desc)
  where author = 'user' and read_at is null;
