-- Topics: what field a brain belongs to, so the catalogue can be browsed by
-- someone who does not already know what they are looking for.
--
-- Deliberately no check constraint. The list of topics is product copy that
-- will change more often than the schema should — src/lib/topics.ts is the
-- authority, and an unknown value degrades to "Other" in the UI rather than
-- rejecting a write.

alter table brains add column if not exists topic text not null default 'other';

create index if not exists brains_topic_idx on brains (topic)
  where visibility = 'public';
