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

Eleven tools. The descriptions tell it *when* to reach for each, which is the
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
| `brain_refresh` | Re-read a brain you own against its sources; only changed pages cost anything |
| `library_add` | Put a catalogue brain on your shelf without opening a browser |
| `library_remove` | Take one off again; the brain itself is untouched |

## Commands

- `/mozg:brains` — the map: what you can read and which one fits what you are doing
- `/mozg:add [subject]` — find a brain in the catalogue and shelve it from here
- `/mozg:sync` — write the shelf into `.mozg/brains.md` so every session starts knowing it
- `/mozg:update [handle]` — re-read your brains against their sources, then re-sync the map
- `/mozg:learn [handle]` — save what this session worked out back into a brain
- `/mozg:train <handle> <material>` — teach a brain from docs you point at, on your own subscription
- `/mozg:teach [handle]` — an interview that fills the brain's known gaps

## The shelf, locally

`/mozg:sync` writes `.mozg/brains.md` and offers to import it from `CLAUDE.md`.
After that the session-start hook names your brains offline, in milliseconds,
without a call — including private ones and whatever you added yesterday, which
no amount of guessing from `package.json` could know. Add a brain on the web or
with `/mozg:add`, re-run `/mozg:sync`, and this project knows about it.

The file is a map, never a copy: handles, goals and exam scores. Notes stay on
the server, where they keep being updated.

## Nothing is downloaded

A brain is read live over MCP. It stays with its author and keeps improving as
they add to it, which a copy on your disk would not. If you do want it offline,
export any brain you can read as `CLAUDE.md`, a Claude Skill or `AGENTS.md` from
its page — that snapshot keeps working with no account at all.
