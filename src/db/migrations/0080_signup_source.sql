-- Where each account came from.
--
-- Nothing recorded it: 36 accounts arrived, 35 of them in one week, and there
-- was no way to tell whether that week was a forum post, a directory listing
-- or one person telling another. Every decision about where to spend effort on
-- reach was being made blind, and the cheapest possible fix is one column.
--
-- First touch, not last: the referrer that brought somebody to the site is the
-- thing worth crediting, and by the time they sign up the referrer is our own
-- sign-in page. The cookie in middleware.ts holds it across the visit.
alter table "user" add column if not exists signup_source text;

comment on column "user".signup_source is
  'First-touch origin: utm_source/ref parameter, else the referring host. Null for accounts created before this was recorded.';
