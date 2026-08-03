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

# A backup nobody has ever restored is a hope, not a backup: verify the dump is
# readable and contains the tables that matter.
if ! gzip -t "$out" 2>/dev/null; then
  echo "$(date -Is)  FAIL  $out is not a valid gzip"
  exit 1
fi
for table in brains notes chunks '"user"'; do
  if ! zcat "$out" | grep -q "COPY public.$table"; then
    echo "$(date -Is)  FAIL  $out has no data for $table"
    exit 1
  fi
done

echo "$(date -Is)  ok  $out  $size"
