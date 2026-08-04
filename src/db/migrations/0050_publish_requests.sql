-- Publication moderation: everyone's brains are private by default, and the
-- public catalogue is curated. A user asking for public creates a request;
-- an operator's approval is what actually flips visibility. One open request
-- per brain — asking twice is a click, not a queue.
create table publish_requests (
  id uuid primary key default gen_random_uuid(),
  brain_id uuid not null references brains(id) on delete cascade,
  requested_by text not null references "user"(id) on delete cascade,
  status text not null default 'pending'
         check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

create unique index publish_requests_open
  on publish_requests (brain_id) where status = 'pending';
