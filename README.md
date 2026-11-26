# mozg

**Own what your AI writes.**

A coding agent now writes more of the code than a person can read, and
approving a change is not the same as understanding it. mozg finds the changes
with the most at stake and asks you one question about each. You answer in your
own words. An examiner that did not write the code grades the answer. A pass
makes that module yours.

It is a Claude Code plugin. Local only: no keys, no accounts, and nothing sent
anywhere.

## How it works

1. **Watch.** mozg reads the session logs Claude Code already writes. For
   every edit it notes the file, the module, the size, and who let it through:
   you, for that one change, or a rule that did not ask.
2. **Explain.** A turn that leaves changes in modules you have not explained is
   mentioned at the end. Say `explain` and the agent asks one question about
   the change with the most at stake. About a minute.
3. **Own.** The answer goes to a separate examiner agent, in its own context,
   with no tools. `explained` makes the module yours. A miss costs nothing,
   and it teaches: the examiner says what the answer was missing, in a few
   plain sentences, and the same question comes once more. Two answers at most
   per round; then the module stays on the list for another day.

Then the part that changes how the agent behaves. **Where a module is not
yours, its first edit there in a session stops and asks you**, the way Claude
Code asks before any edit, with the reason: what module, how much the agent has
changed there, how to make it yours. An explained module costs no prompt from
mozg: there it says nothing, and the permission settings of the session apply
as they are. It asks once per module per session.

The desk counts what that buys. **Ran free** is this week's agent edits in
modules that are yours, where the log says nobody was asked. An edit you
approved yourself is not counted, even in a module that is yours now: nobody
is said to have gone unasked where the log says otherwise. It goes up with
every module you explain.

A module stops being yours once the agent has changed 100 lines in it since
you explained it, and comes up for a re-check after 1, 3, 7, 14 and 30 days.

## Install

Needs Claude Code, and Node 20 or newer.

```
/plugin marketplace add egorfedorov/mozg-plugin
/plugin install mozg@mozg
```

From a copy of this repository, after `npm run pack` (the marketplace has the
same name as the public one, so this is for a machine that has not added it):

```
/plugin marketplace add /path/to/this/folder
/plugin install mozg@mozg
```

Then, in any project, say `status`, `explain`, `map` or `desk` to your agent.
The plugin also adds them as slash commands, `/mozg:explain` and so on.

The **desk** is a page on your own machine, at <http://127.0.0.1:4317>, opened
by `desk`. It has five parts, each with its own address: **Today** (the
score, what the brain says about it, and the one thing to do next), **Modules**
(every module in one list), **Activity**, **History** and **Settings**.
Under **Connection and settings** it says whether the plugin is attached: when
the agent last called mozg, when a session last started, and what is being
read. Nothing there is probed or guessed. Each line is something a process
wrote down when it happened, or a plain "not yet" with the thing to do about
it.

## What is claimed, and what is not

- mozg never says whether you read a change. The log records who approved it,
  and that is all it records, so that is all mozg says.
- "Went ahead with nobody asked" means the configuration let the change
  through. An "always allow" rule made earlier counts as that, because nobody
  was asked at that moment.
- Timing is shown only as timing. Under two seconds is never called "not read".
- A README is not a module to own. A change that is only words (a README, a
  licence, a changelog) is noted and counted for nothing: not in the score,
  not on the map, not offered for an explain-back, and not put to the person
  before it happens.
- A day with nothing to own shows an empty score. It is not hidden, because
  hidden reads as "never measured".
- Everything the brain says is computed from the numbers beside it. A desk at
  48% says so, and names what it cannot vouch for.
- Claude Code deletes its own transcripts after 30 days, by default. mozg keeps
  what it read; after that the text of an old change can no longer be shown for
  an explain-back, only its path and size, and the tool says so.
- The sample on the landing is the same view-model on a sample session,
  labelled as a sample.

## Privacy

| | |
|---|---|
| Read | `~/.claude/projects`, the session logs, and nothing else |
| Written | `~/.mozg`, and nothing else |
| Network | none. The desk listens on `127.0.0.1` and answers only that address. The site's chat is a page of the site talking to the site's server, and the plugin has no part in it |

Source code is never stored. A change keeps a pointer into its log line and
goes back for the text only when somebody is about to explain it.

The desk accepts exactly one write, the settings, and guards it three ways:
the `Host` has to name the machine (so a domain rebound onto `127.0.0.1` is
refused), the `Origin` has to be a local page, and the body has to be JSON,
which a page on another site cannot make a browser send here.

Uninstall the plugin, or delete `~/.mozg`, and nothing is left.

## The site's server

The pages are files. Beside them, on the host of mozg.sh, runs one small
server, `dist/site-server.mjs`, built from the same source with
`npm run build:site`: one file, no dependencies, and never part of the plugin.
It does what a page cannot do alone.

- **The chat.** A floating brain on every public page opens a thread with the
  person behind mozg. No account: the first message makes a thread, and the
  browser keeps the secret that opens it. A visitor may confirm an email to get
  the reply by mail as well. The operator is told by mail.
- **Errors.** A page that throws reports it: three reports per load, one line
  per message.
- **Announcements.** Posted by the operator, a strip along the top of every
  page while they are live. A piece of news may end at a date, and then the
  strip counts down to it: the only clock on the site.
- **The operator's panel**, at `/admin/`: System, Chat, Errors, Announcements,
  Launches. It opens by a link mailed to one address; the link works once and
  holds fifteen minutes. It speaks English and Russian, and its words are kept
  apart from the site's, so they never decide which languages the site offers.

Nothing on a person's machine talks to it. The plugin makes no request of any
kind, and "nothing leaves your machine" is said of the plugin, as before. The
pages say where the chat is the exception (docs, Privacy and data).

It keeps, in one folder (`MOZG_DATA`): one file per thread, the errors, the
announcements, the drafts, and two lists of single-use tokens. The browser's
secret is kept as a hash. The caller's address is hashed with a salt that
lives in the process and is never written. **Download it as one file** in the
panel is a backup.

Every request passes, in order:

- Only the site's own Origin is answered, and a write needs one.
- A body is JSON, and no larger than its route needs.
- A thread is opened by its secret, and a wrong secret is "not found": whether
  a thread exists is not told.
- The panel needs the session of a link that arrived by mail: a signed cookie,
  `HttpOnly`, `SameSite=Strict`, thirty days.
- Everything is counted per address, and over the count is refused: five
  threads and twenty messages an hour from one address, thirty an hour and
  fifteen seconds apart in one thread, five asks for the link.

To run it on a machine of your own: `deploy/site/` holds the image, the
compose file, the nginx snippet, a deploy script and a README. It is built and
tested here, and it is on mozg.sh only once `deploy/site/deploy.sh` has been
run: nothing in this repository puts it there by itself.

## Settings

On the desk, under **Connection and settings**:

- **The agent asks first.** On by default. In a session started with
  `--dangerously-skip-permissions` or `--permission-mode dontAsk` there is
  nobody to ask: the gate stays quiet, and those changes count as unasked.

- **At the end of a turn.** `gentle` (default) says one line, at most once in
  20 minutes. `firm` also has the agent offer an explain-back before it stops,
  once per turn. `off` says nothing; the desk still fills in.
- **Projects on the desk.** A hidden project is left off the desk and out of
  every number on it. Its logs are still read, and nothing is deleted.

- **Language.** What language the desk and the end-of-turn lines are in.
  `System` is the language the shell names in `LANG`.

The examiner's model is `model:` in `plugin/agents/mozg-examiner.md`.

## Not in this release

- Other agents. Claude Code today, including the subagents it starts. Codex and
  Cursor keep their logs in other shapes.
- Team maps, and a receipt on a pull request.
- Payment. The pricing on the site is a proposal and says so; nothing is for
  sale yet.
- A language that is not finished. It is offered nowhere until its last
  sentence is done. See [Languages](#languages).

## The site

<https://mozg.sh> is the landing, and three pages more:

| | |
|---|---|
| `/` | the landing, with the pricing at `#pricing` and the questions at `#questions` |
| `/changelog/` | what shipped, and what is planned, kept apart and marked |
| `/docs/` | eleven pages in four groups, with a search (Ctrl K or Cmd K), a table of contents, and **Copy as Markdown** on every page |
| `/sitemap.xml`, `/llms.txt`, `/changelog.xml` | the same pages for a search engine, for an agent, and as a feed. Made before every build from the pages' own data, so they cannot drift from it |

The plans are in `src/content/pricing.ts`: Free is everything in this README,
Pro is $5 a month or $49 a year and marked "Not on sale yet", Team is "Coming
later". A part of Pro that is not built is marked planned, on the page.

## Languages

The site is in thirteen languages: English, German, Spanish, French, Italian,
Dutch, Portuguese, Turkish, Chinese (Simplified and Traditional), Japanese,
Korean and Russian. The picker lists only languages translated in full, so a
fourteenth appears on the day its last sentence is done, and
`npm run i18n:check` says where each one stands. The translations were made
with a helper and checked sentence by sentence; they have not been read by a
native speaker of each language.

- The key of a sentence is the English itself. A language is a dictionary from
  it: `src/i18n/messages/<lang>.ts` for everything a reader sees outside the
  documentation, `src/i18n/docs/<lang>.ts` for the documentation. The plugin
  bundles the messages and none of the docs.
- `t("…")` in a page, `msg("…")` for a sentence chosen in data, `fill()` for a
  `<0/>` slot, `count()` for a counted sentence. Under `src/content`, a string
  in double quotes is a sentence; in single quotes it is a name, a path or a
  kind, and is left alone.
- A language is offered for a surface only at full coverage. The check writes
  `coverage.generated.ts` and the two index files; nobody edits them by hand.
  A half-translated language is bundled nowhere and routed nowhere, and a
  sentence without a translation is shown in English.
- And a language never leaves the site by accident. The first time one is
  complete, the check writes it to `src/i18n/offered.json`, and from then on
  only adds to that file. If the English changes later and a sentence loses
  its translation, `npm run build` stops and says how many are left;
  `npm run i18n:check -- --todo` lists them. To stop offering a language on
  purpose, take it out of that file.
- English is at `/`, every other language at `/<lang>/`, with its own address
  and its own `<html lang>`, and each page names its other languages for
  search engines. `scripts/i18n-routes.mts` writes a route folder per finished
  language before each build, and `scripts/site-map.mts` the four files above.
- The plugin has a language too: **Language** on the desk, or `language` in
  `~/.mozg/state.json`, is a language code or `system`. The desk and the hooks
  use it. The MCP tools are always English; the agent relays in the language
  the person writes in.

The operator's panel is the third surface, `src/i18n/operator/`, in English
and Russian only; `npm run i18n:check -- --skeleton xx --surface operator`
starts one, and it gates nothing.

To add one: `npm run i18n:check -- --skeleton xx` writes the two empty
dictionaries with every sentence in the order of the source. Translate them,
run the check until the column reads complete, and the language is on the site,
in the picker and in the plugin at the next build.

A helper does better with batches than with a whole dictionary: asked for 441
long keys in one go, it loses its place before the end. So it writes the
translations alone, and a script files them:

```
npm run i18n:parts -- make xx messages     .i18n-parts/xx/messages/00.en.txt …: the index, a tab, the English
                                          the helper writes 00.txt …: the index, a tab, the translation
npm run i18n:parts -- merge xx messages    each translation that could be shown goes under its
                                          sentence; each of the others is named with its line
```

The index is the sentence's place in the English list, so a batch stays put
while the English does. A line is refused on its own: empty, a `<0/>` lost, the
English itself. `npm run i18n:check -- --mend` names a translation that sits
under a mistyped key, and `--write` files it under its sentence.

## Development

```
npm install
npm run check        typecheck, lint, tests, and the server build
npm run pack         builds everything into plugin/ and checks that it loads
npm run dev:api      the packed plugin's desk on a throwaway store
                     → http://127.0.0.1:4317/desk/
npm run dev          the landing and the desk on the Next dev server, :3320
npm run dev:site      after npm run build: the pages and the site's server on :4318,
                     on a throwaway folder, and a link that opens the panel
npm run i18n:check   what is translated, and what is not
npm run i18n:parts   translation in batches for a helper (see Languages)
npm run story         after npm run pack: the whole story of the plugin on a made-up
                     session, through every door, each answer printed and checked
```

`npm run dev:api` never touches `~/.mozg` or a real log: it writes the sample
session into a temporary folder the way the plugin would, and points the plugin
at that. `npm run dev` shows the page with live reload; run `dev:api` beside it
for the numbers, since the page asks the desk server for those.

### One file, four doors

(The site's server is a fifth thing built from the same source and never installed; see [The site's server](#the-sites-server).)

`src/server/main.ts` is bundled by esbuild into one dependency-free file,
`dist/server.mjs`. Claude Code starts it, and the first word says which it is:

| | |
|---|---|
| `mcp` | the MCP server on stdio, one per session. Five tools: `mozg_status`, `mozg_next`, `mozg_record`, `mozg_map`, `mozg_desk` |
| `hook` | a `SessionStart`, `Stop` or `PreToolUse` hook: JSON in on stdin, JSON out on stdout, and always exit 0 |
| `desk` | the local desk on `127.0.0.1`, one per machine |
| `index` | read every session log, then exit |

### Four builds from one source

- `plugin/` is what a person installs: the manifests, the hooks, the examiner,
  the commands, `dist/server.mjs` and the built desk page.
- `out/` is the Next.js static export: the landing, the changelog and the docs
  in every finished language, to publish on their own; the desk, which goes
  into the plugin; and the operator's panel, served by the site's server.
- `dist/site-server.mjs` is the site's server: bundled with esbuild like the
  plugin's, and shipped to one host instead of to everybody.
- `src/` is TypeScript throughout. `src/core` is pure and tested: reading logs,
  modules, ownership, the schedule, the store. `src/hooks`, `src/server` and
  `src/app` sit on top of it.

### The store

`~/.mozg` holds `changes.ndjson` (append-only, one change per line),
`state.json` (explain-backs, where each log has been read to, the settings),
one `pulse-*` file per part of the plugin, and two lock files. Several
processes write here: the hook at every turn's end, the MCP server of every
open session, and the desk. Every write re-reads `state.json` under the lock
first, and before appending a change reads the changes file back, so a change
is never written twice however many readers started together. A long-lived
process calls `sync()` before it answers, to take what the others wrote.

### Tests

`npm test` runs everything under `node:test`. No test reads a real session
log: every test file that could reach one sets `MOZG_CLAUDE_PROJECTS` to an
empty temporary folder before anything else.

## Licence

AGPL-3.0.
