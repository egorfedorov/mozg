-- The hands a brain's knowledge needs.
--
-- A brain teaches how something is done; some of them teach things that a tool
-- on the reader's own machine does far better. spine-2d-animation explains how
-- to author Spine JSON by hand — good knowledge, and mostly the wrong move if
-- the reader has the Spine CLI sitting on their disk and does not know that an
-- MCP server for it exists. The agent hand-writes a skeleton next to a machine
-- that would have exported one.
--
-- It is not a one-off. Of the four most-searched brains in the catalogue, three
-- have a companion tool: stake-engine has the Stake MCP, spine-2d-animation has
-- the Spine one, ai-asset-pipeline has the generation skills. Only pixijs-casino
-- is knowledge alone.
--
-- So the brain says what its hands are, and the brief hands that to the agent
-- before it starts. mozg does not run any of it and cannot: these are local
-- tools against local files, and in Spine's case a licensed desktop app. The
-- honest thing to ship is the knowledge that they exist, not a promise to be
-- them.
--
-- jsonb rather than a table: at most a handful per brain, always read whole,
-- always written whole, never joined or searched across. A table here would be
-- three files of CRUD for a list that is one column.
alter table brains add column if not exists tools jsonb;

comment on column brains.tools is
  'Companion tools this brain''s knowledge is executed with, owner-authored: '
  '[{name, what, needs?, install?}]. Rendered into brain_brief for the agent '
  'and onto the public page for a human. Runs on the reader''s machine, never '
  'ours. Treated as untrusted text — see lib/brain-tools.ts.';
