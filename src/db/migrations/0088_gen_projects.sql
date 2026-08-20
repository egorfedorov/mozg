-- 0088 — a project, and the plan inside it
--
-- gen.mozg.sh had exactly one verb: describe a game, get thirteen assets. One
-- action, createPack, wrote the brief and every generation in a single call.
-- That is a vending machine, and a studio does not work that way. They decide
-- what the set is, argue about the wild, redo the K three times, add a scatter
-- next week, and keep all of it in one place with the game's name on it.
--
-- So the unit becomes a project you keep, and the plan inside it exists before
-- any money moves. An item can be written, edited and re-specified while it
-- costs nothing; generating it is a separate act.
--
-- generations is untouched and stays the money: it debits inside the
-- transaction, refunds a failure, pays the artist and records what the call
-- cost us. Rewriting that because the flow above it changed would be replacing
-- the one part that has been right all along.

create table if not exists gen_projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    text not null references "user"(id) on delete cascade,

  title       text not null,
  -- What is being made. Only slots today; the column exists so the interview
  -- can branch without a migration the first time it is not a slot.
  kind        text not null default 'slot' check (kind in ('slot', 'other')),

  -- The shared half of every prompt: the world, the mood, the palette. An item
  -- with no spec of its own is drawn from this alone.
  style       text,
  palette     text,

  -- Generate in a bought artist's style; every asset then pays them per image,
  -- the same deal asset_packs ran.
  style_brain_id uuid references brains(id) on delete set null,

  -- An example the studio uploaded, and the anchor the set is drawn against.
  -- Two different things on purpose: `reference_key` is *theirs* — the picture
  -- they brought to say "like this" — and `anchor_key` is the first asset we
  -- made, which every sibling is then drawn against so the set matches. The
  -- old model could only ever have the second.
  reference_key text,
  anchor_key    text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists gen_projects_owner_idx
  on gen_projects (owner_id, created_at desc);

-- ─── the plan ───────────────────────────────────────────────────────────────
--
-- One row per asset the studio wants, written during the interview and edited
-- freely until it is generated. This is the table that makes "describe the K
-- yourself, leave the rest to the style" possible: spec is nullable, and null
-- means "the project's style is the whole instruction".
create table if not exists gen_items (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references gen_projects(id) on delete cascade,

  -- Drives the prompt preset and the export name — a symbol is cut out on flat
  -- chroma, a background is not. Values are lib/slotgen.ts ROLES.
  role        text not null,
  -- The studio's own word for it: "K", "wild", "scatter", "lobby tile".
  label       text not null,
  -- This asset in particular. Null: the project's style says it all.
  spec        text,

  -- Where it got to. 'planned' costs nothing and is the point of this table.
  status      text not null default 'planned'
                check (status in ('planned', 'generating', 'done', 'failed')),
  -- The generation that produced it, once one has. The money, the storage key
  -- and the failure reason all live there rather than being copied here.
  generation_id uuid references generations(id) on delete set null,

  -- Position in the set, so a paytable reads top to bottom the way it will
  -- in the game.
  sort        int not null default 0,

  created_at  timestamptz not null default now()
);

create index if not exists gen_items_project_idx
  on gen_items (project_id, sort, created_at);

-- One label per project: "two symbols both called K" is never a thing somebody
-- meant, and catching it here beats catching it in an export.
create unique index if not exists gen_items_label_key
  on gen_items (project_id, lower(label));

comment on table gen_projects is
  'A studio''s folder for one game: the shared style, their reference, and the '
  'anchor the set is drawn against. Assets live in gen_items; money lives in '
  'generations.';
comment on column gen_items.spec is
  'This asset in particular. Null means the project style is the whole '
  'instruction — which is the common case and must stay cheap to leave empty.';
