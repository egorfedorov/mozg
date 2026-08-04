# Self-hosting mozg

The complete operations manual: setup, the pipeline, deploys, scripts, and
the traps we already stepped in so you don't have to.

## The one-command path

```bash
cp .env.selfhost.example .env     # ANTHROPIC_API_KEY + BETTER_AUTH_SECRET
docker compose -f docker-compose.selfhost.yml up
```

Everything runs in containers and the schema migrates itself. Open
http://localhost:3300. Set `MOZG_PORT` in `.env` to use another port. That is
the whole story for trying it, and it is enough for a personal instance.

The rest of this document is the manual path — useful when you develop on the
code itself, or run it in production behind nginx.

## Setup (developing on the code)

You need Node 20+, Postgres 14+ and Python 3.11+.

### 1. Postgres with pgvector

`docker-compose.yml` ships a `db` service; a local Postgres works just as
well:

```bash
brew install postgresql@14 && brew services start postgresql@14

# pgvector builds against a specific Postgres major
git clone --depth 1 --branch v0.8.0 https://github.com/pgvector/pgvector.git /tmp/pgvector
cd /tmp/pgvector
PG_CONFIG=/opt/homebrew/opt/postgresql@14/bin/pg_config make && \
PG_CONFIG=/opt/homebrew/opt/postgresql@14/bin/pg_config make install

psql -d postgres -c "create role mozg login password 'mozg' createdb"
createdb -O mozg mozg
```

### 2. Config

```bash
cp .env.example .env
# set ANTHROPIC_API_KEY, and generate BETTER_AUTH_SECRET:
#   openssl rand -hex 32
```

### 3. Schema

The identity tables belong to better-auth, so its migration runs first:

```bash
npm install
npm run auth:migrate     # user / session / account / verification
npm run db:migrate       # brains, sources, notes, chunks, checks, grants, calls…
```

### 4. Embeddings

The model is fetched by a dedicated script rather than `huggingface_hub`: on
some networks the hub client hangs silently on the CDN — small files arrive,
the 2.2 GB weights sit at zero with no error. The script pulls with Range
requests and appends, so an interruption costs seconds, not the whole
download. Interrupt and re-run as often as you like.

```bash
./services/embed/fetch-model.sh   # resumable
./services/embed/run.sh           # http://localhost:8099
```

Until the model arrives, search still works — full-text only, and MCP
honestly tells the agent "semantic search is unavailable".

On top of hybrid search there is an optional reranker — the cross-encoder
`bge-reranker-v2-m3`, which re-reads the top candidates after RRF fusion.
Same script, same service (`POST /rerank`):

```bash
./services/embed/fetch-model.sh reranker   # ./models/bge-reranker-v2-m3
```

Without reranker weights everything still works: `/rerank` answers 503,
search returns RRF order, and MCP appends "reranking is unavailable".

### 5. Run

```bash
npm run dev        # http://localhost:3300
npm run worker     # the ingest queue
```

## Connect an agent

Mint a token on `/settings/tokens` (shown once):

```bash
claude mcp add --transport http mozg http://localhost:3300/mcp \
  --header "Authorization: Bearer mzg_..."
```

Tools: `brain_list`, `brain_brief`, `brain_search`, `brain_read`,
`brain_write`, `brain_feedback`, `brain_create`, `brain_add_source`.
Auth is a bearer token, not OAuth — `claude mcp add` supports `--header`,
and a full OAuth provider with dynamic client registration is a week of work
for the same result.

Quick check without an agent:

```bash
npm run seed     # demo brain + token, prints a ready-made command
```

## Prove the pipeline without the UI

The fastest way to see whether a brain learns anything:

```bash
npm run ingest -- --brain design \
  --goal "Reproduce our design system exactly: colors, type scale, spacing, component rules, empty and error states" \
  ~/Desktop/ui-shots/*.png

npm run ingest -- --brain design --show
```

The script creates the brain, uploads the files, runs ingest synchronously
(no queue) and prints how many notes came out, what it cost, and what the
secret scanner rejected.

## How it fits together

```
Next.js (dashboard + MCP endpoint)  ─┐
                                     ├─→  Postgres + pgvector
worker (pg-boss)  ───────────────────┘         ↑
   │                                           │
   ├─→ Claude API (vision, exam judge)         │
   ├─→ services/embed (bge-m3, 1024 dims) ─────┘
   └─→ S3/R2 or local disk (screenshots)
```

The queue lives inside Postgres (`pg-boss`) — no Redis, and a failed ingest
is debugged with plain SQL next to the data.

### The ingest pipeline

```
secret scan → vision extraction → scan AGAIN (over what the model wrote) →
embedding dedup → chunks → vectors → done
```

The scan runs twice on purpose: a model told not to copy a token will still
occasionally paraphrase it into a note.

### Where things live

| Path | What it is |
|---|---|
| `src/db/migrations/` | SQL migrations, applied in name order |
| `src/lib/scan.ts` | secrets, PII and prompt-injection scanner; the publication gate |
| `src/lib/extract.ts` | page/screenshot → notes; the prompt knows the brain's goal |
| `src/lib/chunk.ts` | note slicing for search |
| `src/lib/search.ts` | hybrid search: vector + FTS, RRF fusion, cross-encoder rerank |
| `src/lib/tsquery.ts` | tsquery building — **not** `plainto_tsquery`, see comment |
| `src/lib/mcp.ts` | MCP tool descriptions — prompts, not docstrings |
| `src/lib/access.ts` | who may do what with a brain — the single checkpoint |
| `src/lib/tokens.ts` | tokens (stored hashed) and monthly quotas |
| `src/lib/money.ts` | balance, purchases, adjustments — every money movement |
| `src/lib/money-math.ts` | pure share math: no DB import, unit-testable |
| `src/lib/families.ts` | parent and children; searching a parent searches the family |
| `src/lib/paywall.ts` | a parent's price covers its children |
| `src/lib/library.ts` | "add to my brains": a pointer, never a copy |
| `src/lib/goal.ts` | changing the goal discards the exam it no longer describes |
| `src/lib/review.ts` | approving a note = indexing it; shared by web and CLI |
| `src/lib/plans.ts` | plan limits, one table for every path |
| `src/lib/byok.ts` | bring-your-own-key context for the worker |
| `src/lib/secretbox.ts` | AES-GCM sealing for stored user keys |
| `src/lib/crawl.ts` | one link → every docs page: GitHub tree, llms.txt, sitemap, link walk |
| `src/worker/ingest.ts` | the whole pipeline |
| `src/worker/exam.ts` | check generation from the goal + sitting and judging |
| `src/worker/lesson.ts` | the lesson compiler for learn |
| `services/embed/` | bge-m3 behind FastAPI + optional reranker (`/rerank`) |
| `scripts/catalogue.ts` | seed the catalogue from documentation repositories |
| `scripts/check-*.ts` | end-to-end checks: MCP, money, access, payments, refresh, usage |

## Tests

```bash
npm test              # unit suite
npm run typecheck
npm run check:access  # brain isolation, end to end (needs a running server)
```

`check:access` creates a second user and knocks on a stranger's private
brain through the real MCP endpoint — by slug, by `owner/slug`, read and
write. A unit test on `access.ts` would only prove the function agrees with
itself; what actually leaks is a forgotten `where owner_id` in a query, and
only this catches that.

## Production deploy

A server with **8 GB RAM** is comfortable (4 works, barely): the embedding
model wants ~4 GB, the rest is app, worker and Postgres.

TLS and ports 80/443 belong to the host's nginx; the app listens on
localhost only.

**1. DNS.** One A record pointing at the server. If your registrar has a
"URL Redirect Record", delete it — it adds its own A record to a parking
IP, half the traffic (including the Let's Encrypt challenge) goes there,
and the certificate never issues.

**2. On the server:**

```bash
git clone https://github.com/egorfedorov/mozg.git && cd mozg
cp .env.example .env
```

Required in `.env`:

```
POSTGRES_PASSWORD=<long random>
BETTER_AUTH_SECRET=<openssl rand -hex 32>
BETTER_AUTH_URL=https://your.domain
NEXT_PUBLIC_APP_URL=https://your.domain
ANTHROPIC_API_KEY=<key>
```

**3. Run:**

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

**3a. nginx + certificate:**

```bash
sudo cp deploy/nginx-mozg.sh.conf /etc/nginx/sites-available/your.domain
sudo ln -s /etc/nginx/sites-available/your.domain /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your.domain
```

Two things in that config exist because their absence hurt:
`client_max_body_size 256m` (the 1 MB default 413'd screenshot uploads) and
disabled buffering for `/mcp` and the log stream (agents hang otherwise).

The embed service's first start downloads 2.2 GB of weights into a volume —
the only slow step. Weights live in a volume, not the image: 2.2 GB in a
layer would tax every deploy.

**4. Schema (once):**

```bash
docker compose -f docker-compose.prod.yml exec app npm run db:migrate:prod
```

**5. Verify:**

```bash
curl https://your.domain/api/health     # {"status":"ok",...}
docker compose -f docker-compose.prod.yml logs -f worker
```

`/api/health` returns 503 when the database, embeddings or queue are down,
and separately watches for sources stuck in `processing` for over an hour —
that means a worker died mid-job, and nothing else would ever tell you.

**6. Backups (once):**

```bash
crontab -e
17 3 * * *  /opt/mozg/deploy/backup.sh >> /var/log/mozg-backup.log 2>&1
```

The script restore-checks every fresh dump and counts rows in the key
tables — a backup nobody ever restored is a hope, not a backup. Keeps 14
dailies and 8 Sundays.

## Subsequent deploys

```bash
./deploy/deploy.sh          # checks → push → pull → rebuild → migrations → smoke
./deploy/deploy.sh --full   # embed service too (slow — torch)
```

The script refuses a dirty tree, and fails the deploy if `/mcp` without a
token stops answering 401 — the one regression that would mean every brain
just became public.

Regional note: some networks cannot pull Docker Hub images or Hugging Face
weights reliably. A server elsewhere downloads everything in a minute.
