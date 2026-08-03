-- Brain families.
--
-- A whole documentation site in one brain produces a vague goal, a vague exam
-- and answers nobody trusts — which is the first rule in our own guide. But
-- "Stake Engine" really is one thing to a person, even though "RGS wallet
-- endpoints" and "maths model" are separate jobs to a brain.
--
-- So: one level of nesting. A parent groups children and holds the shared
-- context; each child keeps its own goal, its own exam and its own score.
-- Agents address either — the parent to find out which child to ask.

alter table brains add column if not exists parent_id uuid
  references brains(id) on delete set null;

create index if not exists brains_parent_idx on brains (parent_id)
  where parent_id is not null;

-- One level, same owner, no cycles. Enforced here rather than in the app
-- because two paths write brains — the web form and MCP — and a rule only one
-- of them applies is not a rule.
create or replace function brains_parent_guard() returns trigger as $$
declare
  parent_owner text;
  parent_parent uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'a brain cannot be its own parent';
  end if;

  select owner_id, parent_id into parent_owner, parent_parent
    from brains where id = new.parent_id;

  if parent_owner is null then
    raise exception 'parent brain does not exist';
  end if;

  if parent_owner <> new.owner_id then
    raise exception 'a brain can only be grouped under one of its owner''s brains';
  end if;

  if parent_parent is not null then
    raise exception 'brains nest one level deep, and % is already a child', new.parent_id;
  end if;

  -- A brain that already has children cannot become a child itself, or the
  -- one-level promise breaks from the other direction.
  if exists (select 1 from brains where parent_id = new.id) then
    raise exception 'this brain already has children, so it cannot become one';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists brains_parent_guard_trigger on brains;
create trigger brains_parent_guard_trigger
  before insert or update of parent_id, owner_id on brains
  for each row execute function brains_parent_guard();
