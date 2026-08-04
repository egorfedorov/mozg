-- Checks born from real use: a search that returned nothing is a gap report
-- from an actual caller, and the exam should measure it like any other.
alter table checks drop constraint checks_origin_check;
alter table checks add constraint checks_origin_check
  check (origin in ('generated', 'manual', 'usage'));
