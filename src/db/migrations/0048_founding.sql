-- Founding members: the first fifty accounts to ever pay for a plan keep a
-- lifetime half price. A flag on the user, set inside the payment
-- transaction, so the fifty-first concurrent buyer can never sneak in.
alter table "user" add column founding boolean not null default false;
