<div align="center">

<img src="public/brand/devto-cover.jpg" alt="mozg — a brain assembled from notes, stamped with a passing grade" width="720" />

# mozg.

**Exam-scored knowledge brains for AI coding agents.**
Paste one docs URL → get a searchable brain your agent queries over MCP —
with a measured score and a public list of what it does *not* know.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-14161a)](LICENSE)
[![CI](https://github.com/egorfedorov/mozg/actions/workflows/ci.yml/badge.svg)](https://github.com/egorfedorov/mozg/actions)
[![Cloud](https://img.shields.io/badge/cloud-mozg.sh-f15060)](https://mozg.sh)
[![Learn](https://img.shields.io/badge/humans-learn.mozg.sh-3ec300)](https://learn.mozg.sh)
[![MCP](https://img.shields.io/badge/protocol-MCP-14161a)](https://mozg.sh/connect)

[Start here](https://mozg.sh/start) · [Catalogue](https://mozg.sh/explore) ·
[Why not a context file](https://mozg.sh/vs) · [Self-host guide](docs/SELFHOST.md)

</div>

---

Your agent answers from memory, and memory has a date on it. Context files
rot silently, cost tokens on every session, and can never tell you what they
actually cover. mozg is built on one mechanism applied everywhere:

> **Knowledge must be measured.**

```text
$ claude mcp add --transport http mozg https://mozg.sh/mcp
✓ connected · 4 brains available

> what does /wallet/play expect for the amount field?

  brain_search(brain: "mozg/stake-engine", query: "play amount units")
  → 3 notes · 96 ms

  Amounts are integers in RGS minor units — $1.00 is 1_000_000 at
  6-decimal scale, and the same scale applies to every wallet endpoint.
```

## The loop

```mermaid
flowchart LR
    A[one docs URL] --> B[crawler<br/>github tree · llms.txt · sitemap]
    B --> C[atomic notes<br/>+ embeddings]
    C --> D{{the exam<br/>~30 questions from the goal}}
    D -->|score + failed questions| E[focused re-read<br/>chases the gaps]
    E --> C
    F[agents querying over MCP] -->|zero-hit searches| D
    F -->|corrections| G[owner review] --> C
```

- **The exam is the product.** The brain's goal becomes control questions,
  re-sat after every ingest. *Trained 92%* is a fact, not a claim — and the
  failures are listed publicly, so agents are told the gaps before they
  search. Anti-bluff questions verify it refuses what it doesn't know.
- **Zero-context search.** Retrieval is server-side (hybrid + reranker).
  A brain can hold 3,000 notes; an answer costs the three it needed.
- **The collective mind.** A search that returns nothing becomes an exam
  question. Corrections agents file become owner-reviewed notes. Nothing is
  ever deleted — every version is kept, and the diff between sittings shows
  on the brain's page.
- **learn.** Any brain doubles as a spaced-repetition course for humans at
  [learn.mozg.sh](https://learn.mozg.sh) — read → recall → quiz, streaks, a
  certificate at 80%, and a scoreboard against your own agent.
- **Injection-hardened.** Published notes are scanned for credential leaks,
  PII and prompt-injection language; third-party notes arrive framed as
  data, not instructions; AI training crawlers are refused in robots.txt.

## Cloud, or your own metal

| | [mozg.sh](https://mozg.sh) cloud | self-host (this repo) |
|---|---|---|
| Read, connect, study | free | yours |
| Official catalogue | free, curated, kept current | seed it yourself (`scripts/catalogue.ts`) |
| Build brains | free trial brain, then plans **or bring your own API key** | your keys, no limits |
| Marketplace | outside authors sell, 95% to them | n/a |
| Ops | ours | [`docs/SELFHOST.md`](docs/SELFHOST.md) |

The deal is honest: building brains spends model tokens. On the cloud you
either pay a plan (we spend), set your own API key in settings (you spend),
or teach through a Claude Code subscription with the plugin's `/mozg:train`.

## Stack

Next.js 16 · Postgres 14 + pgvector (HNSW) · pg-boss (queue in Postgres) ·
better-auth · bge-m3 embeddings + bge-reranker (self-hosted FastAPI) ·
Playwright render service for JS-shell docs sites · esbuild-bundled worker.
178 tests, CI on every push.

## Contributing

Bug reports with reproduction beat everything; `brain_feedback` reports from
real use beat those. Small PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
New catalogue packs are data entries, not code.

## License

[AGPL-3.0](LICENSE). Run it, change it, self-host it; host it for others and
your changes stay open. The hosted cloud at mozg.sh sells convenience and
inference — never locks.
