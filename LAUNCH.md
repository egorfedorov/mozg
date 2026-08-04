# Launch kit

Тексты для запуска. Правь голос под себя — но факты в них проверенные, не
обещания: каждая цифра из продакшена.

---

## Show HN (news.ycombinator.com/submit)

**Title:** Show HN: Mozg – give your coding agents a brain that sits an exam

**URL:** https://mozg.sh

**First comment (post it yourself right after submitting):**

Hi HN. I build slot games for a living, and my agents kept confidently
answering from stale training data — the platform docs they needed were newer
than the model. So I built mozg: paste one link to any documentation, and it
crawls the whole thing (GitHub tree, llms.txt, sitemap, or a link walk),
extracts it into searchable notes, and connects to Claude Code, Codex, Cursor
or anything else over MCP.

The part I haven't seen elsewhere: every brain sits an exam. You state what
the brain is *for*, that becomes ~30 control questions, and after every
ingest it re-sits them — so you get a measured score ("trained 92%") and a
list of exactly which material is missing, instead of guessing why your agent
still gives bad answers. The exam deliberately asks about things the brain
does NOT yet cover; the failures are the point.

Details people usually ask about:
- Searching a brain costs zero tokens — retrieval is server-side, the agent
  reads only the few notes it asked for.
- Agents write lessons back (owner approves them), and can flag a note as
  wrong when reality disagrees — thousands of sessions become QA.
- Everything exports as CLAUDE.md / AGENTS.md / a Claude Skill, so leaving is
  cheap by design.
- There's a marketplace: free brains (MCP spec, Svelte 5, Tailwind v4) and
  paid ones (deep slot-game engineering, since that's my field). Paid brains
  answer 5 real queries free before asking to be bought.

Stack: Next.js + Postgres/pgvector + a local bge-m3 embedder; extraction and
the exam judge are Claude via API. Happy to answer anything about the exam
mechanics or the crawler.

---

## Product Hunt

**Name:** Mozg
**Tagline:** Brains for AI agents — trained from one link, scored by an exam
**Description (260):** Paste a docs link → mozg crawls it, builds a searchable
brain, and connects to Claude Code, Codex or Cursor over MCP. Every brain sits
an exam, so you see a measured score and what's missing. Free catalogue +
marketplace where authors keep 95%.

**First comment:** маленькая история: делал слот-игры, агенты путались в доках
платформы → построил себе память с экзаменом → понял, что это продукт.

---

## Stake Engine community (Discord)

Построил slot-game на Stake Engine с агентами? Я собрал все их доки в
подключаемый «мозг» для Claude Code/Cursor — агент отвечает по спеке RGS
дословно, а не по памяти модели. Бесплатно: https://mozg.sh/explore (раздел
gamedev). Отдельно есть платная семья Slot Studio — механики+математика,
чеклист аппрува (за что реально реджектят), фронтенд, комплаенс. Первые 5
запросов к платным — бесплатно, прямо из агента. Фидбек крайне welcome —
я сам с этих доков шипплю.

---

## X/Twitter (тред, 3 твита)

1/ Your coding agent doesn't need a bigger context window. It needs a brain
that actually knows your stack — and can prove it. mozg.sh: paste one docs
link → trained, exam-scored, connected over MCP. [видео]

2/ The exam is the trick: your goal becomes ~30 control questions, re-sat
after every upload. "Trained 92%" is measured, not claimed. The failing 8%
tells you exactly what to feed it next.

3/ Free brains: MCP spec, Svelte 5, Tailwind v4. Paid: deep slot-game
engineering ($19–29, authors keep 95%). Agents get 5 free queries into any
paid brain — the product is the demo.

---

## Чеклист перед постингом

- [ ] Каталог: у каждого мозга оценка ≥70% и заполненные демо-вопросы
- [ ] Видео залито (лендинг + твит)
- [ ] /pricing и тизер проверены глазами на чистом аккаунте
- [ ] Алерты healthwatch приходят (упадём под трафиком — узнаем первыми)
- [ ] Ответы на первые комменты: экзамен, «чем не RAG», «чем не CLAUDE.md» —
      см. /vs и /why, аргументы уже написаны там
