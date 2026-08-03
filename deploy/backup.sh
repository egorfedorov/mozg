#!/usr/bin/env bash
# Nightly backup, run on the server by cron. Dumps postgres and tars the
# storage volume (the uploaded screenshot originals); optionally pushes both
# off the machine with rclone.
#
#   crontab -e
#   17 3 * * *  /opt/mozg/deploy/backup.sh >> /var/log/mozg-backup.log 2>&1
#
# Brains are the product: sources can be re-uploaded, but extracted notes cost
# real money to regenerate and agent-written notes cannot be recovered at all.
#
# Backups on the same disk protect against postgres, not against the machine.
# Set BACKUP_RCLONE_REMOTE to any configured rclone remote (e.g.
# "b2:mozg-backups") and fresh dumps are copied off the box. Without it the
# offsite step logs a note and skips — rclone is not required.
set -euo pipefail

DIR="${MOZG_DIR:-/opt/mozg}"
DEST="${MOZG_BACKUP_DIR:-/var/backups/mozg}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
# Named volumes are prefixed with the compose project name, which defaults to
# the directory name: /opt/mozg -> mozg_storage. Override if MOZG_DIR differs.
STORAGE_VOLUME="${MOZG_STORAGE_VOLUME:-mozg_storage}"

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

# The storage volume holds the uploaded screenshot originals. They can
# theoretically be re-uploaded, but nobody will — losing them leaves every
# brain with notes whose source image is gone. Tarred through a throwaway
# container because a named volume has no host path you can safely tar.
sout="$DEST/daily/storage-$stamp.tar.gz"
docker run --rm -v "$STORAGE_VOLUME:/data:ro" -v "$DEST/daily:/backup" alpine \
  tar -czf "/backup/storage-$stamp.tar.gz.tmp" -C /data .

# Same rule as the database dump: replace the real file only once the tar
# succeeded.
mv "$DEST/daily/storage-$stamp.tar.gz.tmp" "$sout"
ssize=$(du -h "$sout" | cut -f1)

# Sunday's copy is kept longer, so a problem noticed weeks later is still
# recoverable. Storage gets no weekly: the originals are re-uploadable in
# principle, and eight weeks of screenshots costs real disk.
[ "$(date +%u)" = 7 ] && cp "$out" "$DEST/weekly/mozg-$stamp.sql.gz"

find "$DEST/daily"  -name 'mozg-*.sql.gz'    -mtime +$KEEP_DAILY          -delete
find "$DEST/daily"  -name 'storage-*.tar.gz' -mtime +$KEEP_DAILY          -delete
find "$DEST/weekly" -name 'mozg-*.sql.gz'    -mtime +$((KEEP_WEEKLY * 7)) -delete

# A backup nobody has ever restored is a hope, not a backup.
if ! gzip -t "$out" 2>/dev/null; then
  echo "$(date -Is)  FAIL  $out is not a valid gzip"
  exit 1
fi
if ! gzip -t "$sout" 2>/dev/null; then
  echo "$(date -Is)  FAIL  $sout is not a valid gzip"
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

# Offsite copy: without it every backup dies together with the machine it is
# meant to save you from. rclone is optional by design — an unconfigured
# remote means a note in the log, not a failed cron.
if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  if command -v rclone >/dev/null 2>&1; then
    rclone copy "$out"  "$BACKUP_RCLONE_REMOTE/daily/"
    rclone copy "$sout" "$BACKUP_RCLONE_REMOTE/storage/"
    if [ "$(date +%u)" = 7 ]; then
      rclone copy "$DEST/weekly/mozg-$stamp.sql.gz" "$BACKUP_RCLONE_REMOTE/weekly/"
    fi
    echo "$(date -Is)  ok  pushed to $BACKUP_RCLONE_REMOTE"
  else
    echo "$(date -Is)  warn  BACKUP_RCLONE_REMOTE is set but rclone is not installed — local copies only"
  fi
else
  echo "$(date -Is)  note  BACKUP_RCLONE_REMOTE unset — backups stay on this machine"
fi

echo "$(date -Is)  ok  $out  $size  ($restored brains restored)  $sout  $ssize"
