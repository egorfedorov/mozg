-- The library: brains someone added to their own working set.
--
-- The catalogue could be browsed and a paid brain could be bought, but there
-- was no way to say "I want this one" about a free brain — so brain_list never
-- mentioned it and an agent never knew it existed. Reading a public brain
-- already worked if you knew its handle, which is not discovery.
--
-- A row here means "show this to my agents". Ownership and grants are not
-- stored here: those are already relationships, and duplicating them would
-- create two answers to the same question.

create table if not exists library (
  user_id  text not null references "user"(id) on delete cascade,
  brain_id uuid not null references brains(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, brain_id)
);

create index if not exists library_user_idx on library (user_id, added_at desc);

-- Everything already bought belongs in the library — a purchase is the
-- strongest possible statement that someone wants a brain in their set.
insert into library (user_id, brain_id, added_at)
select buyer_id, brain_id, created_at from purchases
on conflict do nothing;
