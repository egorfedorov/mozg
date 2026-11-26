# mozg

**Own what your AI writes.**

A coding agent writes more than a person can read, and approving a change is
not the same as understanding it. mozg finds the changes with the most at
stake and asks you one question about each. You answer in your own words. An
examiner that did not write the code grades the answer. A pass makes that
module yours.

Local only. There is no key, no account and nothing to configure, and nothing
about you or your code leaves the machine.

## What you get

- **`explain`** — a one-minute explain-back. The agent asks one question about
  the change with the most at stake, then hands your answer to the examiner.
- **`status`** — what you own today, what the agent changed, and what is worth
  explaining.
- **`map`** — every module the agent touched, whether you have explained it,
  and whether mozg asks before an edit there or says nothing.
- **`desk`** — a page on your own machine (<http://127.0.0.1:4317>): today's
  score, your modules, what happened, your history and the settings, each on
  its own part of the page.

Say any of them to your agent in Claude Code, or use them as slash commands
(`/mozg:explain`). At the end of a turn that left changes in modules you
have not explained, mozg says so.

## Setup

Claude Code, and Node 20 or newer. In Claude Code:

```
/plugin marketplace add egorfedorov/mozg-plugin
/plugin install mozg@mozg
```

That is all. After one session that edits files, the desk has your numbers.

## Language

The desk and the end-of-turn lines follow your machine's language when it is
one mozg speaks, and English otherwise. To choose one, open the desk and set
**Language** under **Connection and settings**; it is kept on your machine.
The agent asks its question in the language you write to it in, and the
examiner writes its verdict in that language too.

## How it works

mozg reads the session logs Claude Code already writes. For every edit it
notes the file, the module, the size, and who let it through: you, for that
one change, or a rule that did not ask.

A module is yours once you have explained it. It stops being yours when the
agent rewrites it, and it comes up for a re-check after 1, 3, 7, 14 and 30
days. A `not yet` costs nothing, and it teaches: the examiner says what your
answer was missing, in a few plain sentences, and the same question comes once
more. Then the module stays on the list.

And the agent behaves accordingly. **Where a module is not yours, its first
edit there in a session stops and asks you**, with the reason: what module, how
much the agent has changed there, how to make it yours. An explained module
costs no prompt from mozg: there the session's own permission settings apply.
You can switch the asking off on the desk.

## What it does not claim

mozg never says whether you read a change. The log records who approved it,
and that is all it records, so that is all mozg says.

A README is not a module to own. A change that is only words is noted and
counted for nothing, and never asked about.

## Where things live

| | |
|---|---|
| Read | `~/.claude/projects` (the session logs), and nothing else |
| Written | `~/.mozg`, and nothing else |
| Network | none; the desk listens on `127.0.0.1` only |

Claude Code deletes its own transcripts after 30 days. mozg keeps what it read.

Source code is never stored: a change keeps a pointer into its log line and
goes back for the text only when you are about to explain it. Uninstall the
plugin, or delete `~/.mozg`, and nothing is left.

## Not in this release

- Other agents. Claude Code today; Codex and Cursor keep their logs in other
  shapes.
- Asking in a session that skips permissions. There is nobody to ask there, so
  mozg keeps quiet and counts those changes as unasked.
- Payment. Nothing is for sale: everything in this plugin is free, and the
  plans on the site are a proposal marked as one.

Licenced AGPL-3.0. The source and the development notes are in the repository
this plugin is packed from.
