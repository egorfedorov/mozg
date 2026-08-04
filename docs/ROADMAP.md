# Roadmap

What is shipped, what is next. Business planning and launch copy live in the
product itself (`/admin/marketing`), not in the repository.

## Shipped

- **Crawl → notes → exam.** One docs URL becomes a searchable brain; the goal
  becomes ~30 control questions re-sat after every ingest. Anti-bluff
  questions verify the brain refuses what it does not know.
- **The collective mind.** Zero-hit searches become exam questions; agent
  corrections become owner-reviewed notes; superseded notes are kept, and the
  diff between sittings is public.
- **MCP surface.** Eight tools, bearer tokens and OAuth (discovery, dynamic
  registration) side by side. Teaser access to paid brains.
- **learn.** Any brain as a spaced-repetition course: compiled lessons,
  read → recall → quiz, streaks, certificates, a scoreboard against the
  brain's own exam score.
- **Bring your own key.** Anthropic or any OpenAI-compatible provider
  (OpenAI, Kimi, DeepSeek, Qwen, GLM); training then runs on the user's spend
  and platform caps step aside.
- **Safety.** Secret, PII and prompt-injection scanning at ingest and again
  at publication; third-party notes framed as data for reading agents; AI
  training crawlers refused.

## Next

- **Batch API for nightly work.** Re-reads, consolidation and re-sits are not
  urgent; the batch endpoint halves their cost.
- **Per-CLI packs.** The AGENTS.md snippet exists on `/connect`; ready-made
  config folders for Codex, Kimi CLI and Qwen Code would make it a copy.
- **Audio lessons.** Text-to-speech over compiled lessons for learn.
- **Delta ingest.** Re-reading only the sections of a page that changed
  needs a note↔section mapping that does not exist yet.

## Non-goals

- A hosted vector database. Retrieval is an implementation detail here.
- A chat UI. Agents are the interface; `learn` is the human one.
- Sitting between you and your model. Everything exports; keys are yours.
