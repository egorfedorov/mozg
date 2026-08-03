# MOZG — план MVP

Общий мозг для ИИ-агентов. Рабочее название: **mozg**. Домены под проверку: `mozg.ai`, `getmozg.com`, `brainstack.dev`, `mindmcp.com`.

---

## 1. Что это, в одном абзаце

Сервис, где разработчик собирает «мини-мозг» — компактный пакет знаний по одной теме — из скриншотов, файлов и ссылок. Мозг подключается к Claude Code, Codex, Cursor и любому другому MCP-клиенту одним remote-сервером. Агент ищет в мозге, читает его и дописывает в него то, что узнал. Мозгами можно делиться по ссылке и по email, публиковать в открытый каталог и (в v3) продавать подписку.

**Ключевое отличие от всех существующих «памятей для ИИ»:** у мозга есть *точка Б* — описание того, что должно получиться, которое система превращает в набор контрольных вопросов и автоматически прогоняет после каждого ингеста. Мозг показывает процент обученности и то, каких данных не хватает. Память везде — чёрный ящик. Здесь — измеримо.

---

## 2. Wow-сценарий (60 секунд)

Это единственный сценарий, ради которого существует v1. Всё, что ему не помогает — режем.

```
0:00  Регистрация через GitHub OAuth
0:10  «Создать мозг» → название «HUD», точка Б в одно поле
0:20  Drag-n-drop папки с 20 скриншотами
0:25  Копирует команду подключения одной кнопкой
0:40  Ингест закончен, экзамен прогнан → «Мозг обучен на 71%»
0:45  claude mcp add --transport http mozg https://api.mozg.ai/mcp
0:55  В Claude Code: «используй mozg:hud, где рисовать баланс?»
1:00  Ответ, который без мозга получить было нельзя
```

Метрика успеха v1: **доля зарегистрировавшихся, дошедших до первого `brain_search` из внешнего клиента**. Цель — 40%. Всё остальное вторично.

---

## 3. Архитектура

```
┌──────────────┐   OAuth 2.1 + streamable HTTP    ┌─────────────────┐
│ Claude Code  │◄─────────────────────────────────►│                 │
│ Codex        │                                   │   MCP Server    │
│ Cursor       │   brain_brief / search / read /   │   /mcp          │
│ ChatGPT      │   write / list                    │                 │
└──────────────┘                                   └────────┬────────┘
                                                            │
┌──────────────┐                                            │
│  Dashboard   │  Next.js App Router                        │
│  (браузер)   │◄──────────────┐                            │
└──────────────┘               │                            │
                               ▼                            ▼
                     ┌─────────────────────────────────────────────┐
                     │  Postgres + pgvector                        │
                     │  brains / sources / notes / chunks /        │
                     │  checks / runs / grants / calls             │
                     └─────────────────────────────────────────────┘
                               ▲                            ▲
                               │                            │
              ┌────────────────┴──────┐        ┌────────────┴────────────┐
              │  Ingest worker        │        │  Embed service          │
              │  (pg-boss очередь)    │───────►│  bge-m3, локально       │
              │  secrets scan → VLM   │        │  1024 dims, ru+en       │
              │  → notes → dedup      │        └─────────────────────────┘
              └───────┬───────────────┘
                      │
                      ▼
              ┌───────────────┐        ┌──────────────────┐
              │  S3 / R2      │        │  Claude API      │
              │  скриншоты    │        │  vision + judge  │
              └───────────────┘        └──────────────────┘
```

Ничего экзотического: один Next.js-процесс отдаёт и дашборд, и MCP-эндпоинт; один воркер-процесс жуёт очередь; Postgres — единственное хранилище состояния (очередь тоже в нём, через `pg-boss` — отдельный Redis не нужен).

---

## 4. Модель данных

```sql
create extension if not exists vector;
create extension if not exists pg_trgm;

-- ───────────────────────────── МОЗГИ ─────────────────────────────

create table brains (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references users(id) on delete cascade,
  slug          text not null,                    -- 'hud' → хендл в MCP
  title         text not null,
  goal          text,                             -- точка Б, свободный текст
  visibility    text not null default 'private'
                check (visibility in ('private','link','public')),
  license       text not null default 'nc'        -- см. §9
                check (license in ('nc','mit','proprietary')),
  score         int,                              -- % обученности, кэш
  score_at      timestamptz,
  review_required boolean not null default true,  -- brain_write → в очередь
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, slug)
);
create index on brains (visibility) where visibility = 'public';

-- ──────────────────────────── ИСТОЧНИКИ ──────────────────────────

create table sources (
  id            uuid primary key default gen_random_uuid(),
  brain_id      uuid not null references brains(id) on delete cascade,
  kind          text not null check (kind in ('image','text','url','file')),
  storage_key   text,                             -- ключ в S3/R2
  original_name text,
  bytes         int,
  status        text not null default 'queued'
                check (status in ('queued','processing','ready','failed','rejected')),
  reject_reason text,                             -- 'secrets_detected' и т.п.
  error         text,
  created_at    timestamptz not null default now()
);
create index on sources (brain_id, status);

-- ─────────────────────── ИЗВЛЕЧЁННОЕ ЗНАНИЕ ──────────────────────

create table notes (
  id            uuid primary key default gen_random_uuid(),
  brain_id      uuid not null references brains(id) on delete cascade,
  source_id     uuid references sources(id) on delete set null,
  title         text not null,
  body          text not null,                    -- markdown
  kind          text not null default 'fact'
                check (kind in ('fact','rule','layout','example','pitfall')),
  confidence    real default 0.8,
  author        text not null default 'ingest'
                check (author in ('ingest','human','agent')),
  agent_client  text,                             -- 'claude-code' / 'codex'
  status        text not null default 'active'
                check (status in ('active','pending','superseded','rejected')),
  superseded_by uuid references notes(id),        -- версионирование, не удаление
  created_at    timestamptz not null default now()
);
create index on notes (brain_id, status);

-- ──────────────────────────── ЧАНКИ ──────────────────────────────

create table chunks (
  id            uuid primary key default gen_random_uuid(),
  brain_id      uuid not null references brains(id) on delete cascade,
  note_id       uuid not null references notes(id) on delete cascade,
  content       text not null,
  token_count   int not null,
  embedding     vector(1024),                     -- bge-m3
  tsv           tsvector generated always as (to_tsvector('simple', content)) stored
);
create index on chunks using hnsw (embedding vector_cosine_ops);
create index on chunks using gin (tsv);
create index on chunks (brain_id);
-- lazy: config 'simple' вместо 'russian'/'english' — без стемминга, зато один
-- индекс на оба языка. Апгрейд: колонка lang + partial-индексы по конфигам,
-- когда FTS начнёт заметно мазать.

-- ────────────────────── ЭКЗАМЕН (ТОЧКА Б) ────────────────────────

create table checks (
  id            uuid primary key default gen_random_uuid(),
  brain_id      uuid not null references brains(id) on delete cascade,
  category      text not null,                    -- группировка в UI
  question      text not null,
  expect        text not null,                    -- что должно быть в ответе
  weight        int not null default 1,
  origin        text not null default 'generated'
                check (origin in ('generated','manual')),
  enabled       boolean not null default true,
  created_at    timestamptz not null default now()
);

create table check_runs (
  id            uuid primary key default gen_random_uuid(),
  brain_id      uuid not null references brains(id) on delete cascade,
  score         int,
  model         text,
  cost_cents    int,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create table check_results (
  run_id        uuid not null references check_runs(id) on delete cascade,
  check_id      uuid not null references checks(id) on delete cascade,
  passed        boolean not null,
  got           text,
  reason        text,
  primary key (run_id, check_id)
);

-- ───────────────────────── ДОСТУПЫ ───────────────────────────────

create table grants (
  id            uuid primary key default gen_random_uuid(),
  brain_id      uuid not null references brains(id) on delete cascade,
  email         citext not null,
  role          text not null default 'viewer'
                check (role in ('viewer','contributor')),
  accepted_by   uuid references users(id),
  invited_at    timestamptz not null default now(),
  unique (brain_id, email)
);

-- ────────────────── ТОКЕНЫ И МЕТРИКА ВЫЗОВОВ ─────────────────────

create table mcp_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  token_hash    text not null unique,
  name          text,                             -- 'macbook claude code'
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- ВАЖНО: caller_id — тот, КТО вызвал, а не владелец мозга.
-- Это и квоты v1, и биллинг маркетплейса v3 — одна таблица.
create table calls (
  id            bigserial primary key,
  brain_id      uuid references brains(id) on delete set null,
  caller_id     uuid not null references users(id) on delete cascade,
  owner_id      uuid not null references users(id) on delete cascade,
  tool          text not null,
  latency_ms    int,
  tokens_out    int,
  cost_cents    int,
  created_at    timestamptz not null default now()
);
create index on calls (caller_id, created_at desc);
create index on calls (brain_id, created_at desc);
```

**Три вещи, которые дёшево заложить сейчас и дорого добавлять потом:** `visibility` + `grants`, `license`, и `calls.caller_id`. Остальное можно эволюционировать.

---

## 5. MCP-контракт

Remote MCP, streamable HTTP, OAuth 2.1 с dynamic client registration. Эндпоинт `POST /mcp`. Пять инструментов — больше не нужно.

Описания инструментов — **это промпт, а не документация**. От их текста напрямую зависит, будет ли агент вообще дёргать мозг. Тестировать отдельно на Claude Code, Codex и Cursor: они по-разному решают, когда звать инструмент.

### `brain_list`

```
List the knowledge brains available to you. Call this once at the start of a
session, or whenever the user mentions a brain by name or tag (e.g. "use
mozg:hud"). Returns each brain's handle, title, goal, and trained-score.
```

Вход: нет. Выход: `[{handle, title, goal, score, note_count, updated_at, access}]`.

### `brain_brief`

```
Get a compact map of one brain: its goal, the categories of knowledge it
contains, and its known gaps. Cheap — call this before searching so you know
whether this brain can answer the question at all, and which terms it uses.
Do not skip this and guess at search queries.
```

Вход: `{ handle }`. Выход: goal, список категорий с числом заметок, топ-20 ключевых терминов, список проваленных категорий экзамена (это и есть «известные пробелы»). ~400 токенов.

### `brain_search`

```
Search a brain for knowledge relevant to your current task. Call this whenever
the answer depends on project-specific conventions, layouts, rules, or
decisions that are not in the conversation — before answering from general
knowledge. Prefer several short, specific queries over one long one.
Returns ranked excerpts with note ids; use brain_read to expand any of them.
```

Вход: `{ handle, query, limit = 8, category? }`. Выход: `[{note_id, title, excerpt, score, source}]`.

### `brain_read`

```
Read the full text of one note returned by brain_search, when the excerpt is
not enough to act on.
```

Вход: `{ handle, note_id }`. Выход: полный markdown + ссылка на исходный скриншот.

### `brain_write`

```
Save a durable lesson back into the brain: a convention you confirmed, a
correction to something the brain got wrong, a pitfall you hit. Write one
self-contained fact per call, phrased so it is useful to someone who was not
in this conversation. Do not save what the repository or this chat already
records, and do not save secrets, credentials, or personal data.
```

Вход: `{ handle, title, body, kind }`. Требует роль `contributor`+. При `review_required = true` заметка ложится в `status = 'pending'` и ждёт ревью в дашборде. **Секрет-скан прогоняется и здесь**, не только на ингесте.

### Экспорт (не MCP, а кнопка в дашборде)

Мозг выгружается в `CLAUDE.md`, Claude Skill (`SKILL.md` + файлы), `AGENTS.md`. Это снимает страх вендор-лока и, парадоксально, продаёт подписку: люди платят за то, что мозг живой и обновляется, а не за файл.

---

## 6. Пайплайн ингеста

```
upload → S3 → sources(queued)
   │
   ▼
[1] секрет-скан имени файла и метаданных
   │
   ▼
[2] VLM: скриншот → структурированные заметки
      claude-opus-5, vision, structured output
      output_config.format → { notes: [{title, body, kind, confidence}] }
   │
   ▼
[3] секрет-скан извлечённого текста
      regex-набор gitleaks + энтропийный детектор
      попадание → sources.status = 'rejected', reason = 'secrets_detected'
      юзеру показываем ЧТО нашли (замаскированно) и предлагаем удалить строку
   │
   ▼
[4] дедуп: эмбеддинг новой заметки vs существующие
      cos > 0.93 → merge, старая → superseded_by
   │
   ▼
[5] чанкинг (~400 токенов, перекрытие 60) + эмбеддинги bge-m3
   │
   ▼
[6] если у мозга есть goal → триггер check_run
```

### Промпт извлечения (шаг 2)

Системный промпт получает `goal` мозга — извлечение должно быть **под задачу**, а не «опиши картинку»:

```
You are building a knowledge pack for this goal:
<goal>{{brain.goal}}</goal>

From the screenshot, extract only facts that someone working toward that goal
would need. For each fact write a self-contained note: a title, and a body that
makes sense without seeing the image. Prefer concrete values (pixel offsets,
color hex, exact wording, ordering) over descriptions of what the image
"shows". Ignore decoration, watermarks, and anything unrelated to the goal.
If the screenshot contains nothing relevant, return an empty list.
```

Последняя строка важна: без неё модель всегда что-нибудь выдумает, и мозг наполняется мусором.

---

## 7. Точка Б как экзамен

Главная фича. Три шага.

**Генерация проверок.** После первого ингеста (или по кнопке) модель получает `goal` + оглавление всех заметок и генерит 15–30 вопросов со сгруппированными категориями:

```
Given this goal and this list of note titles, write check questions that
verify whether the brain can actually support the goal. Each check has: a
question a user might ask, and `expect` — what a correct answer must contain.
Group checks into 4-7 categories. Include checks for aspects the goal implies
but the notes do NOT currently cover — those are the gaps we want to surface.
```

Последнее предложение — то, что превращает экзамен из самопроверки в **карту недостающих данных**.

**Прогон.** Для каждой проверки: `brain_search(question)` → маленькая модель отвечает **только по найденным чанкам** → судья сравнивает с `expect` → pass/fail + причина. Судья на `claude-opus-5` (можно спустить на `claude-haiku-4-5`, см. §11 — это твой выбор по цене).

**Показ.** На странице мозга:

```
Мозг HUD                                  обучен на 84%   ↑ +12 за сегодня
────────────────────────────────────────────────────────────────────────
✓ Позиция баланса и ставки                12/12
✓ Поведение при большом выигрыше           8/8
⚠ Адаптация под портретный режим           3/7   не хватает: скриншоты 9:16
✗ Поведение при buy-bonus                  0/5   нет ни одного источника
                                                  [ загрузить материалы ]
```

Строка «не хватает» — это не украшение. Это то, что заставляет пользователя вернуться и докинуть данные, а значит — привязывает его к продукту сильнее любого онбординга.

---

## 8. Поиск

Retrieval = продукт. Плохой поиск → агент игнорирует мозг → отвал на второй день.

**v1: гибрид через Reciprocal Rank Fusion.** Никакого reranker-а, ~15 строк:

```
vec  = top-30 по cosine(embedding, q_emb)
fts  = top-30 по ts_rank(tsv, plainto_tsquery(q))
score(doc) = Σ 1 / (60 + rank_in_list)
вернуть top-8 по score
```

RRF нечувствителен к тому, что скоры векторного и текстового поиска в разных шкалах — поэтому не нужно ничего калибровать. Работает на удивление хорошо.

**Апгрейд, когда экзамен покажет, что упирается:** cross-encoder `bge-reranker-v2-m3` локально поверх top-30. Отметить `lazy:`-комментарием в коде.

**Эмбеддинги.** У Anthropic нет embeddings API. Варианты:

| Вариант | Цена | Русский | Комментарий |
|---|---|---|---|
| **bge-m3 локально** | $0 | отлично | 1024 dims, ~2 ГБ RAM, рекомендую |
| multilingual-e5-large | $0 | отлично | альтернатива, 1024 dims |
| Voyage AI | ~$0.02/1M | хорошо | если не хочешь держать процесс |
| OpenAI text-embedding-3 | $0.02/1M | средне | и оплата картой — сейчас лишний геморрой |

**Берём bge-m3 локально**: мозги будут наполовину на русском, это бесплатно, и убирает ещё одну платёжную зависимость. Отдельный маленький Python-сервис (FastAPI + sentence-transformers), 60 строк.

---

## 9. Шаринг, лицензии, каталог

### Уровни доступа

| Уровень | Кто видит | Экспорт | Индексация |
|---|---|---|---|
| `private` | только владелец | да | нет |
| `link` | по ссылке + email-гранты | по роли | нет |
| `public` | все | по лицензии | да, SEO |

### Лицензия на каждый мозг

Твоя формулировка — «пусть копируют, но перепродажа запрещена» — это **не MIT**. MIT явно разрешает продажу и сублицензирование. Правильный выбор:

| Значение | Лицензия | Что можно |
|---|---|---|
| `nc` *(по умолчанию)* | CC BY-NC-SA 4.0 | использовать, копировать, изменять, делиться с указанием автора; **продавать нельзя**; производные — под той же лицензией |
| `mit` | MIT | всё, включая перепродажу и встраивание в коммерческий продукт |
| `proprietary` | своя | доступ только через MCP, экспорт и дамп отключены |

Лицензия показывается бейджем на карточке мозга, пишется в шапку любого экспорта (`CLAUDE.md`, `SKILL.md`) и возвращается в `brain_brief`, чтобы агент тоже её видел.

**Честно про enforcement:** лицензия — это правовой, а не технический барьер. Мозг, который можно читать, можно и выкачать. Технически мы можем только: отключить `brain_export` для `proprietary`, лимитировать `brain_search` по числу вызовов, и логировать аномальные паттерны (сотни запросов за минуту с одного токена). Это поднимает цену копирования, но не делает его невозможным. Реальная защита — **свежесть**: мозг, который автор обновляет, скопировать бессмысленно, копия протухает.

### Публичный каталог

Страница `/b/{user}/{slug}` для публичных мозгов: заголовок, цель, процент обученности, категории, число источников, лицензия, дата обновления, кнопка «подключить». Индексируется. Первые 20 публичных мозгов делаешь сам из того, что уже есть в `~/Downloads/claude` — Stake Engine, PixiJS 8, HUD-дизайн слотов, Spine-анимация, GMGN API. Это одновременно и наполнение, и лучший канал трафика.

---

## 10. Экраны

**`/` — лендинг.** Крупная типографика, цветные карточки-мозги в стиле IFTTT, но своя палитра (не их зелёный). Один экран: что это → демо-гифка 20 секунд → 6 публичных мозгов → «создать свой».

**`/brains` — список.** Сетка карточек. На каждой: название, цвет, кольцо прогресса обученности, число источников, бейдж лицензии/доступа. Пустое состояние не пустое: три демо-мозга, которые можно форкнуть в один клик.

**`/brains/[slug]` — страница мозга.** Главный экран продукта, четыре зоны:

1. **Шапка** — название, цель (редактируемая инлайн), кольцо «обучен на N%», кнопка «Подключить» → модалка с готовой командой и кнопкой копирования.
2. **Экзамен** — категории с чекбоксами pass/fail и строками «не хватает». Кнопка «прогнать заново».
3. **Источники** — таблица с drag-n-drop, статусами, кнопкой «пересобрать».
4. **Живой лог MCP-вызовов** — real-time (SSE), видно как Claude прямо сейчас дёргает `brain_search("где рисовать баланс")` и что вернулось. Дёшево делается, залипательно смотрится, наглядно доказывает ценность.

**`/brains/[slug]/review`** — очередь заметок от агентов на подтверждение. Три кнопки: принять / отклонить / объединить с существующей.

**`/brains/[slug]/share`** — уровень доступа, email-гранты, лицензия, ссылка.

**`/settings/tokens`** — MCP-токены, лимиты, потребление за месяц.

---

## 11. Тарифы, квоты и экономика

### Платежи в v1 — нет

Stripe нет и не нужен на старте. Делаем так:

- Квоты и лимиты работают с первого дня (они всё равно нужны, чтобы не разориться).
- Тариф хранится в `users.plan` и меняется руками из админки.
- Кнопка «Upgrade to Pro» ведёт на форму заявки → тебе на почту. Первые 50 Pro-юзеров ты подключаешь вручную и заодно узнаёшь, за что именно люди готовы платить.
- В коде — узкий интерфейс `BillingProvider { getPlan(userId), recordUsage(...) }` с единственной реализацией `ManualProvider`. Подключить потом Paddle / Lava / CryptoCloud — один файл.

Так и надо: пока не проверено, что мозгами вообще делятся и что кто-то упирается в лимит, платёжка — это месяц работы впустую.

### Квоты

| | Free | Pro |
|---|---|---|
| Мозгов | 1 | 20 |
| Источников на мозг | 50 | 1000 |
| MCP-вызовов / мес | 300 | 10 000 |
| `brain_write` | ✗ | ✓ |
| Прогонов экзамена / мес | 5 | 100 |
| Экспорт | ✗ | ✓ |
| Публикация | ✓ | ✓ |
| Шаринг по email | 1 человек | 20 |

Ориентир цены Pro: $15/мес. Team ($30/место) — v3.

### Реальная себестоимость

Цены Claude API (за 1M токенов):

| Модель | Вход | Выход |
|---|---|---|
| `claude-opus-5` | $5 | $25 |
| `claude-sonnet-5` | $3 ($2 до 31.08.26) | $15 ($10) |
| `claude-haiku-4-5` | $1 | $5 |

**Скриншот через vision.** Полное разрешение на Opus 5 — до ~4784 входных токенов на картинку. Плюс промпт (~300) и выход (~700):

| Конфигурация | $/скриншот | 50 скриншотов |
|---|---|---|
| Opus 5, полное разрешение | ~$0.043 | $2.15 |
| Opus 5, даунсемпл до 1568px | ~$0.027 | $1.35 |
| Opus 5, даунсемпл + Batch API (−50%) | ~$0.014 | $0.68 |
| Haiku 4.5, даунсемпл + Batch | ~$0.003 | $0.14 |

Free-тариф в 50 источников на Opus 5 без батча стоит $2 с юзера — при тысяче регистраций это $2000 в месяц на халявщиках. **Решение:**

- Ингест всегда идёт через **Batch API** (−50%, задержка до часа — для фонового ингеста нормально).
- Изображения даунсемплятся до 1568px по длинной стороне перед отправкой. Для скриншотов UI этого хватает; если пользователь жалуется на потерю мелкого текста — на Pro включается полное разрешение (2576px) как отдельная опция.
- Free-тариф: 50 источников — но **20 в месяц**, остальное только после апгрейда.

**Экзамен.** 25 проверок × (поиск + ответ + судья) ≈ 25 × 3k входных + 25 × 400 выходных. На Opus 5 ≈ $0.63 за прогон, с батчем ≈ $0.31.

**Prompt caching — обязателен.** Системный промпт извлечения одинаковый для всех скриншотов одного мозга. Ставим `cache_control` на системный блок: чтение кэша ~0.1× от цены входа. Минимальный кэшируемый префикс на Opus 5 — 512 токенов, наш промпт с целью мозга в него укладывается. Экономия на ингесте пачки — ещё ~20%.

**Итого на активного Free-юзера:** ~$0.35/мес. На Pro-юзера с 1000 источников и 100 прогонами: ~$45/мес — что дороже подписки в $15. **Поэтому у Pro тоже стоят квоты**, а не «безлимит». Формулировка на сайте: 1000 источников и 10 000 вызовов, дальше — Team или overage.

**Если хочешь резать себестоимость в разы** — переключить извлечение и судью на `claude-haiku-4-5` ($1/$5): ингест дешевеет в ~5 раз. Качество извлечения из скриншотов при этом заметно падает, судья становится менее строгим. Мой совет: **извлечение на Opus 5** (это качество всего продукта), **судья на Haiku 4.5** (там задача простая — сравнить ответ с эталоном). Решение за тобой — обе модели в конфиге, меняются одной переменной.

---

## 12. Безопасность

Не там, где можно лениться.

1. **Секрет-скан на ингесте и на `brain_write`.** Скриншоты терминалов и IDE полны токенов. Набор правил gitleaks (AWS, GitHub PAT, OpenAI/Anthropic ключи, JWT, приватные ключи, connection strings) + энтропийный детектор для строк длиннее 20 символов. Найдено → источник в `rejected`, юзеру показываем маскированный фрагмент. **Публикация мозга без пройденного скана невозможна.**
2. **PII-скан перед публикацией.** Email, телефоны, имена в скриншотах переписок.
3. **Изоляция мозгов.** Каждый запрос к `chunks` обязан нести `brain_id` + проверку доступа. Row-level security в Postgres как второй рубеж — дешевле, чем один забытый `where`.
4. **Rate limit на MCP-токен.** Не только квота в месяц, но и всплеск: 60 вызовов/мин. Защита и от бага в агенте, и от выкачивания мозга.
5. **Токены хранятся хешем.** Показываются один раз при создании.
6. **Отзыв доступа моментальный.** Убрал грант → следующий вызов с этого токена по этому мозгу падает.

---

## 13. Стек

| Слой | Выбор | Почему |
|---|---|---|
| Фронт + API | Next.js 16, App Router | у тебя уже стоит (yakex), одна кодовая база на дашборд и MCP |
| MCP | `@modelcontextprotocol/sdk`, streamable HTTP | официальный SDK, route handler в том же приложении |
| Auth | Better Auth или Clerk | GitHub OAuth + OAuth-провайдер для MCP-клиентов |
| БД | Postgres 16 + pgvector | Neon или Supabase; хранит и данные, и очередь |
| Очередь | `pg-boss` | Redis не нужен, одна зависимость долой |
| Хранилище | Cloudflare R2 | без egress-платы, S3-совместимо |
| Эмбеддинги | bge-m3, FastAPI-сервис | бесплатно, отличный русский |
| LLM | Claude API (`claude-opus-5`) | vision + judge + генерация проверок |
| Деплой | Vercel (веб) + Fly.io/Railway (воркер, embed) | воркер на Vercel не живёт |
| Аналитика | PostHog | воронка «регистрация → первый search» |

---

## 14. План работ

**Неделя 1 — фундамент.**
Схема БД и миграции. GitHub OAuth. CRUD мозгов. Загрузка файлов в R2. Очередь `pg-boss`. Embed-сервис на bge-m3. Пайплайн ингеста: секрет-скан → vision-извлечение → дедуп → чанки → эмбеддинги.
*Готово, когда:* закинул 20 скриншотов, в БД лежат осмысленные заметки с векторами.

**Неделя 2 — MCP.**
OAuth-провайдер для MCP-клиентов. Route handler `/mcp`. Пять инструментов. Гибридный поиск на RRF. Токены и проверка доступа. Тест-подключение из Claude Code, Codex и Cursor.
*Готово, когда:* из Claude Code приходит ответ, который без мозга получить нельзя. **Это середина проекта и точка невозврата — если retrieval мажет, дальше идти нельзя, надо чинить здесь.**

**Неделя 3 — точка Б.**
Генерация проверок из цели. Прогон экзамена. Подсчёт процента. Страница мозга с прогресс-баром, категориями и строками «не хватает».
*Готово, когда:* докинул скриншоты портретного режима → категория позеленела, процент вырос.

**Неделя 4 — обратная запись и шаринг.**
`brain_write` + очередь ревью + дедуп при записи. Уровни доступа, email-гранты, лицензии. Публичные страницы мозгов. Живой лог MCP-вызовов через SSE.
*Готово, когда:* Codex записал в мозг, Claude на следующий день это использовал, ты подтвердил заметку в дашборде.

**Неделя 5 — товарный вид.**
Квоты и счётчики. Экспорт в `CLAUDE.md` / Skill / `AGENTS.md`. Лендинг. Онбординг с копированием команды. 20 публичных мозгов из твоих материалов. Демо-гифка.
*Готово, когда:* можно давать ссылку незнакомому человеку.

Итого **5 недель** при работе через Claude Code, если резать по списку ниже.

---

## 15. Что режем из v1 (и когда возвращаем)

| Фича | Возврат |
|---|---|
| Мини-агенты на мозг | v2, после того как retrieval стабилен |
| IFTTT-подобные автоматизации и триггеры | v2 |
| Платежи, Stripe/Paddle, подписки | v2, когда упрутся в лимиты |
| Продажа мозгов, выплаты, ревшара | v3, после доказанного бесплатного шаринга |
| Командные фичи, роли, аудит | v3 |
| Cross-encoder reranker | когда экзамен покажет упор в поиск |
| Интеграции кроме MCP (REST API, webhooks) | по запросу |
| Мобильная версия дашборда | адаптив есть, приложения нет |

---

## 16. Открытые вопросы

1. **Домен и название.** `mozg` — рабочее. Для англоязычного рынка нужно что-то произносимое.
2. **Триал Pro.** 14 дней без карты (карты всё равно нет) или сразу платно по заявке?
3. **Форк публичного мозга.** Разрешаем копировать чужой публичный мозг себе с сохранением атрибуции? Под `nc`-лицензией — да. Это ещё один канал роста, но и способ размывать авторство. Склоняюсь к «да, с обязательной ссылкой на оригинал в карточке».
4. **Что делать с мозгом на 200 источников.** `brain_brief` перестанет влезать в разумный размер. Нужна иерархия категорий. Проблема появится не сразу, но заложить `notes.category` стоит уже сейчас.

---

*Написано 2026-08-03. Следующий шаг — неделя 1.*
