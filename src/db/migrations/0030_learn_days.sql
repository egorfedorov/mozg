-- One row per person per day with any grading activity. learn_progress only
-- keeps each card's latest state, so streaks need their own memory — a date
-- set, not a log.
create table learn_days (
  user_id text not null references "user"(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
