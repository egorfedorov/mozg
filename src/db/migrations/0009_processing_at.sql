-- When a source last started being processed.
--
-- The health check called a source stuck when its status was 'processing' and
-- its row was over an hour old. Those are different things: a source created
-- yesterday and requeued a minute ago is not stuck, it is busy — and once a
-- brain has any old source, retrying it makes the monitor permanently red.
-- A monitor that cries wolf is the one nobody reads on the day it is right.

alter table sources add column if not exists processing_at timestamptz;

create index if not exists sources_processing_idx on sources (processing_at)
  where status = 'processing';
