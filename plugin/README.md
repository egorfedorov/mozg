# mozg plugin for Claude Code

Connects your knowledge brains to the agent over MCP.

## Install

```bash
/plugin marketplace add egorfedorov/mozg-plugin
/plugin install mozg@mozg
```

Then set your token — make one at <https://mozg.sh/connect>, which fills it into
the command for you:

```bash
export MOZG_TOKEN=mzg_...
```

Put that line in your shell profile so it survives a new terminal. Restart
Claude Code and `/brains` will list what you can read.

## What the agent gets

Eight tools. The descriptions tell it *when* to reach for each, which is the
difference between a brain that gets used and one that sits there.

| Tool | For |
|---|---|
| `brain_list` | What am I allowed to read? |
| `brain_brief` | What does this brain cover, and what is it known to be missing? |
| `brain_search` | Find what this project actually decided, before answering from general knowledge |
| `brain_read` | Open one note in full |
| `brain_write` | Save a convention or a pitfall worth keeping |
| `brain_write_batch` | Save a whole set of notes from a training session in one call |
| `brain_create` | Start a new brain without leaving the editor |
| `brain_add_source` | Feed it documentation pages or a block of text |

## Commands

- `/brains` — the map: what you can read and which one fits what you are doing
- `/learn [handle]` — save what this session worked out back into a brain

## Nothing is downloaded

A brain is read live over MCP. It stays with its author and keeps improving as
they add to it, which a copy on your disk would not. If you do want it offline,
export any brain you can read as `CLAUDE.md`, a Claude Skill or `AGENTS.md` from
its page — that snapshot keeps working with no account at all.
