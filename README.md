# mozg

Общий мозг для ИИ-агентов. Собираешь мозг из скриншотов и файлов — подключаешь
к Claude Code, Codex, Cursor через MCP. У каждого мозга есть **точка Б**, из
которой генерируется экзамен: после каждого ингеста мозг пересдаёт его и
показывает процент обученности и то, каких материалов не хватает.

План продукта и экономика — [PLAN.md](./PLAN.md).

---

## Setup

Нужны Node 20+, Postgres 14+ и Python 3.11+.

### 1. Postgres с pgvector

Docker Hub из РФ часто не отдаёт слои, поэтому основной путь — локальный
Postgres из brew. `docker-compose.yml` с сервисом `db` тоже есть, если у тебя
образы тянутся.

```bash
brew install postgresql@14 && brew services start postgresql@14

# pgvector собирается под конкретную мажорную версию Postgres
git clone --depth 1 --branch v0.8.0 https://github.com/pgvector/pgvector.git /tmp/pgvector
cd /tmp/pgvector
PG_CONFIG=/opt/homebrew/opt/postgresql@14/bin/pg_config make && \
PG_CONFIG=/opt/homebrew/opt/postgresql@14/bin/pg_config make install

psql -d postgres -c "create role mozg login password 'mozg' createdb"
createdb -O mozg mozg
```

### 2. Конфиг

```bash
cp .env.example .env
# впиши ANTHROPIC_API_KEY, сгенерируй BETTER_AUTH_SECRET:
#   openssl rand -hex 32
```

### 3. Схема

Таблицы идентичности принадлежат better-auth, поэтому его миграция идёт первой.

```bash
npm install
npm run auth:migrate     # user / session / account / verification
npm run db:migrate       # brains, sources, notes, chunks, checks, grants, calls
```

### 4. Эмбеддинги

Модель качаем отдельным скриптом, а не через `huggingface_hub`: с части сетей
он виснет на CDN — мелкие файлы приходят, а веса на 2.2 ГБ стоят на нуле без
ошибки. Скрипт тянет Range-запросами с дописыванием в конец, поэтому обрыв
стоит секунды, а не всей загрузки. Прерывать и перезапускать можно сколько
угодно.

```bash
./services/embed/fetch-model.sh   # можно прервать и запустить снова
./services/embed/run.sh           # http://localhost:8099
```

Пока модель не скачалась, поиск работает — но только полнотекстовый. MCP в
этом случае честно предупреждает агента строкой «semantic search is
unavailable».

### 5. Запуск

```bash
npm run dev        # http://localhost:3300
npm run worker     # очередь ингеста
```

---

## Подключить агента

Токен — на `/settings/tokens`, показывается один раз.

```bash
claude mcp add --transport http mozg http://localhost:3300/mcp \
  --header "Authorization: Bearer mzg_..."
```

Инструменты: `brain_list`, `brain_brief`, `brain_search`, `brain_read`,
`brain_write`. Авторизация — bearer-токен, а не OAuth: `claude mcp add` умеет
`--header`, а полноценный OAuth-провайдер с динамической регистрацией клиентов
— это отдельная неделя работы ради того же результата. Заложено на потом.

Быстрая проверка без агента:

```bash
npm run seed     # демо-мозг + токен, печатает готовую команду
```

## Проверить пайплайн без UI

Самый быстрый способ понять, учится ли мозг чему-нибудь:

```bash
npm run ingest -- --brain design \
  --goal "Точно повторять нашу дизайн-систему: цвета, шкала типографики, отступы, правила компонентов, пустые и ошибочные состояния" \
  ~/Desktop/ui-shots/*.png

npm run ingest -- --brain design --show
```

Скрипт создаёт мозг, заливает файлы, прогоняет ингест синхронно (без очереди) и
печатает, сколько заметок получилось, во что это обошлось и что было отклонено
сканером секретов.

---

## Как устроено

```
Next.js (дашборд + MCP-эндпоинт)  ─┐
                                   ├─→  Postgres + pgvector
worker (pg-boss)  ─────────────────┘         ↑
   │                                         │
   ├─→ Claude API (vision, судья экзамена)    │
   ├─→ services/embed (bge-m3, 1024 dims) ────┘
   └─→ S3/R2 или локальный диск (скриншоты)
```

Очередь живёт в самом Postgres (`pg-boss`) — отдельный Redis не нужен, а
упавший ингест разбирается обычным SQL рядом с данными.

### Пайплайн ингеста

```
скан секретов → извлечение через vision → скан ещё раз (по тому, что написала
модель) → дедуп по эмбеддингу → чанки → векторы → готово
```

Скан идёт дважды намеренно: модель, которой сказали не переписывать токен, всё
равно иногда перескажет его своими словами в заметку.

### Что где

| Путь | Что это |
|---|---|
| `src/db/migrations/` | SQL-миграции, применяются по порядку имён |
| `src/lib/scan.ts` | сканер секретов и PII, гейт публикации |
| `src/lib/extract.ts` | скриншот → заметки, промпт знает цель мозга |
| `src/lib/chunk.ts` | нарезка заметок под поиск |
| `src/lib/search.ts` | гибридный поиск: вектор + FTS, слияние через RRF |
| `src/lib/tsquery.ts` | построение tsquery — **не** `plainto_tsquery`, см. комментарий |
| `src/lib/mcp.ts` | описания инструментов MCP — это промпт, а не докstring |
| `src/lib/access.ts` | кто что может с мозгом — единственная точка проверки |
| `src/lib/tokens.ts` | токены (хранятся хешем) и месячные квоты |
| `src/lib/money.ts` | баланс, покупки, ручные корректировки — все движения денег |
| `src/lib/money-math.ts` | чистая математика долей: без импорта БД, поэтому тестируется юнитом |
| `src/lib/topics.ts` | список разделов каталога; неизвестный ключ читается как «Other» |
| `src/lib/dashboard.ts` | что произошло и что требует владельца — данные для `/brains` |
| `src/lib/admin.ts` | доступ в `/admin` (по `ADMIN_EMAILS`) и операторские выборки |
| `src/app/mcp/route.ts` | JSON-RPC эндпоинт для агентов |
| `src/worker/ingest.ts` | пайплайн целиком |
| `src/worker/exam.ts` | генерация проверок из цели + прогон и судейство |
| `services/embed/` | bge-m3 за FastAPI |
| `scripts/ingest.ts` | прогон пайплайна из терминала |
| `scripts/seed.ts` | демо-мозг и токен для проверки MCP |
| `scripts/check-access.ts` | сквозная проверка изоляции мозгов |
| `scripts/check-money.ts` | леджер сходится с балансами |
| `scripts/check-purchase.ts` | покупка под конкуренцией, овердрафт, идемпотентность |

### Страницы

| Путь | Что это |
|---|---|
| `/` | лендинг |
| `/explore`, `/b/{handle}/{slug}` | каталог (разделы, free/paid, сортировка) и публичная страница мозга |
| `/brains` | дашборд: что произошло и что требует внимания |
| `/brains/new`, `/brains/{slug}` | создание, мозг |
| `/brains/{slug}/notes` | что лежит внутри: поиск, фильтр, удаление |
| `/brains/{slug}/share` | доступ, раздел, лицензия, цена, экспорт |
| `/settings`, `/settings/tokens`, `/settings/balance` | тариф, токены, баланс |
| `/admin`, `/admin/users`, `/admin/brains` | операторская: здоровье, люди, мозги |

`/admin` открыт только адресам из `ADMIN_EMAILS`; всем остальным — 404, а не
403: посторонний не должен узнать, что страница вообще есть. Каждое действие
проверяет права заново — гейт на рендере не защищает POST.

---

## Тесты

```bash
npm test              # сканер секретов, чанкер, построение tsquery
npm run typecheck
npm run check:access  # сквозная проверка изоляции мозгов (нужен запущенный сервер)
```

`check:access` заводит второго пользователя и его токеном стучится в чужой
приватный мозг через настоящий MCP-эндпоинт: по слагу, по `owner/slug`, на
чтение и на запись. Юнит-тест на `access.ts` доказал бы только, что функция
согласована сама с собой; утекает же — забытый `where owner_id` в запросе,
и ловится это только так.

---

## Деплой на mozg.sh

Нужен сервер с **8 ГБ памяти** (можно 4, но впритык): модели эмбеддингов
одной нужно около 4 ГБ, остальное — приложение, воркер и Postgres.

TLS и порты 80/443 остаются за nginx, который уже стоит на машине и обслуживает
другие сайты. Приложение слушает только localhost и наружу доступно
исключительно через nginx.

**1. DNS.** Одна A-запись `mozg.sh` → IP сервера (и такая же для `www`, если
нужен). **URL Redirect Record надо удалить**: он заводит свою A-запись на
парковку регистратора, домен начинает резолвиться сразу в два адреса, и
примерно половина запросов уходит мимо сервера — включая проверку
Let's Encrypt, из-за чего сертификат не выпустится.

**2. На сервере:**

```bash
git clone git@github.com:egorfedorov/mozg.git && cd mozg
cp .env.example .env
```

В `.env` обязательно:

```
POSTGRES_PASSWORD=<длинный случайный>
BETTER_AUTH_SECRET=<openssl rand -hex 32>
BETTER_AUTH_URL=https://mozg.sh
NEXT_PUBLIC_APP_URL=https://mozg.sh
ANTHROPIC_API_KEY=<ключ>
ANTHROPIC_BASE_URL=https://api.apimart.ai   # если через apimart
```

**3. Запуск:**

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

**3a. nginx и сертификат:**

```bash
sudo cp deploy/nginx-mozg.sh.conf /etc/nginx/sites-available/mozg.sh
sudo ln -s /etc/nginx/sites-available/mozg.sh /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d mozg.sh -d www.mozg.sh
```

В конфиге специально прописаны две вещи, о которые легко споткнуться:
`client_max_body_size 256m` (по умолчанию 1 МБ — загрузка скриншотов падала бы
с 413) и отключённая буферизация для `/mcp` и потока лога (иначе агенты висят,
а лог не отображается).

Первый старт сервиса эмбеддингов качает 2.2 ГБ весов в volume — это
единственный долгий шаг, минут пять на нормальном канале. Веса лежат в
volume, а не в образе: 2.2 ГБ в слое сделали бы больно каждому деплою.

**4. Схема (один раз):**

```bash
docker compose -f docker-compose.prod.yml exec app npm run auth:migrate
docker compose -f docker-compose.prod.yml exec app npm run db:migrate
```

**5. Проверить:**

```bash
curl https://mozg.sh/api/health     # {"status":"ok","checks":{...}}
docker compose -f docker-compose.prod.yml logs -f worker
```

`/api/health` отдаёт 503, если база, эмбеддинги или очередь легли. Отдельно
следит за источниками, застрявшими в `processing` больше часа: это значит, что
воркер умер посреди задачи — строка не доходит ни до `ready`, ни до `failed`,
и больше об этом не узнать никак.

**6. Бэкапы** (один раз):

```bash
crontab -e
17 3 * * *  /opt/mozg/deploy/backup.sh >> /var/log/mozg-backup.log 2>&1
```

Скрипт проверяет свежий дамп на читаемость и на наличие данных в ключевых
таблицах — бэкап, который никто ни разу не восстанавливал, это надежда, а не
бэкап. Держит 14 ежедневных и 8 воскресных копий.

## Последующие деплои

```bash
./deploy/deploy.sh          # проверки → push → pull → пересборка → миграции → smoke
./deploy/deploy.sh --full   # с пересборкой сервиса эмбеддингов (долго, торч)
```

Скрипт откажется деплоить грязное дерево и падает, если после выката
`/mcp` без токена перестал отвечать 401 — это единственная проверка, провал
которой означает, что все мозги стали публичными.

Замечание про регион: если сервер в РФ, Docker Hub и Hugging Face могут не
отдать образы и веса — та же беда, что была локально. Зарубежный хостинг
скачивает всё за минуту.

## Состояние

Проверено вживую: схема на pgvector с HNSW, сканер секретов и чанкер (16
тестов), MCP-эндпоинт целиком — авторизация, `tools/list`, поиск, запись с
отклонением секрета, очередь ревью, — регистрация, все страницы.

Написано, но не прогнано на реальных данных: извлечение через vision и экзамен
(нужен `ANTHROPIC_API_KEY`), векторная половина поиска (ждёт докачки bge-m3).

Дальше по [плану](./PLAN.md): проверка ингеста на настоящих скриншотах,
публичные мозги для наполнения каталога, платежи.
