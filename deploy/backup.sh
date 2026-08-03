#!/usr/bin/env bash
# Nightly database backup, run on the server by cron.
#
#   crontab -e
#   17 3 * * *  /opt/mozg/deploy/backup.sh >> /var/log/mozg-backup.log 2>&1
#
# Brains are the product: sources can be re-uploaded, but extracted notes cost
# real money to regenerate and agent-written notes cannot be recovered at all.
set -euo pipefail

DIR="${MOZG_DIR:-/opt/mozg}"
DEST="${MOZG_BACKUP_DIR:-/var/backups/mozg}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"

mkdir -p "$DEST/daily" "$DEST/weekly"
cd "$DIR"

stamp=$(date +%Y-%m-%d)
out="$DEST/daily/mozg-$stamp.sql.gz"

# --clean --if-exists so the dump can be restored over an existing database
# without hand-dropping it first, which is exactly when you are least calm.
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U mozg -d mozg --clean --if-exists --no-owner --no-privileges \
  | gzip -9 > "$out.tmp"

# Only replace the real file once the dump succeeded — a truncated backup that
# looks present is worse than an obviously missing one.
mv "$out.tmp" "$out"
size=$(du -h "$out" | cut -f1)

# Sunday's copy is kept longer, so a problem noticed weeks later is still
# recoverable.
[ "$(date +%u)" = 7 ] && cp "$out" "$DEST/weekly/mozg-$stamp.sql.gz"

find "$DEST/daily"  -name 'mozg-*.sql.gz' -mtime +$KEEP_DAILY  -delete
find "$DEST/weekly" -name 'mozg-*.sql.gz' -mtime +$((KEEP_WEEKLY * 7)) -delete

# A backup nobody has ever restored is a hope, not a backup.
if ! gzip -t "$out" 2>/dev/null; then
  echo "$(date -Is)  FAIL  $out is not a valid gzip"
  exit 1
fi

# One pass, no `grep -q` inside a pipeline: grep exits at the first match and
# SIGPIPEs zcat, which under `set -o pipefail` makes a perfectly good backup
# report FAIL. That is worse than no check — it teaches you to ignore the log.
tables=$(zcat "$out" | grep '^COPY public\.' | sed 's/^COPY public\.\([^ (]*\).*/\1/' || true)
for table in brains notes chunks user; do
  if ! printf '%s\n' "$tables" | grep -qx "\"\?$table\"\?"; then
    echo "$(date -Is)  FAIL  $out has no data for $table"
    exit 1
  fi
done

# The real test: restore into a throwaway database and count what came back.
# Greping the text only proves the dump mentions a table, not that it can be
# read back — and the day you find that out is the worst possible day.
scratch="mozg_restore_check"
cd "$DIR"
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U mozg -d postgres -c "drop database if exists $scratch" >/dev/null
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U mozg -d postgres -c "create database $scratch" >/dev/null

if ! zcat "$out" | docker compose -f docker-compose.prod.yml exec -T db \
     psql -U mozg -d "$scratch" -v ON_ERROR_STOP=0 >/dev/null 2>&1; then
  echo "$(date -Is)  FAIL  $out did not restore"
  docker compose -f docker-compose.prod.yml exec -T db \
    psql -U mozg -d postgres -c "drop database if exists $scratch" >/dev/null
  exit 1
fi

restored=$(docker compose -f docker-compose.prod.yml exec -T db \
  psql -U mozg -d "$scratch" -tAc \
  "select count(*) from brains" 2>/dev/null | tr -d '\r' || echo 0)

docker compose -f docker-compose.prod.yml exec -T db \
  psql -U mozg -d postgres -c "drop database if exists $scratch" >/dev/null

if [ "${restored:-0}" -lt 1 ]; then
  echo "$(date -Is)  FAIL  $out restored but holds no brains"
  exit 1
fi

echo "$(date -Is)  ok  $out  $size  ($restored brains restored)"
