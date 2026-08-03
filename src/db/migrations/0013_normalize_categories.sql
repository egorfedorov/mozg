-- notes.category was free text the extraction model invented, so one idea
-- accumulated as "Type scale", "type scale" and "type  scale" — three rows in
-- every GROUP BY, and a category filter that matched only one of them.
--
-- Writes now go through normalizeCategory (src/lib/category.ts); this brings
-- existing rows to the same canonical form: trimmed, whitespace collapsed,
-- "/" separators tidied, lowercase, 80-char cap. Duplicates need no separate
-- merge — the update itself makes the variant spellings equal, so later
-- GROUP BYs see one category. Empty results become null rather than "".
-- Title and body are deliberately untouched.

update notes
   set category = left(
         nullif(
           trim(both '/' from
             lower(
               regexp_replace(
                 regexp_replace(
                   regexp_replace(trim(category), '\s+', ' ', 'g'),
                   '\s*/\s*', '/', 'g'),
                 '/{2,}', '/', 'g'))),
           ''),
         80)
 where category is not null;
