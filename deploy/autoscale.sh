#!/usr/bin/env bash
# Scale ingest workers to the queue, not to a guess. Cron, every 10 minutes:
#
#   */10 * * * *  /opt/mozg/deploy/autoscale.sh >> /var/log/mozg-autoscale.log 2>&1
#
# One worker is the resting state; a seeding session that queues hundreds of
# pages gets more hands, and they go away when the queue does. Scaling down
# mid-job is safe by design: a stopped worker's source is requeued by the
# orphan sweep and the advisory lock keeps a double-run out.
set -euo pipefail
cd /opt/mozg

queued=$(docker compose -f docker-compose.prod.yml exec -T db psql -U mozg -t -A \
  -c "select count(*) from sources where status in ('queued','processing')")

if   [ "$queued" -gt 400 ]; then want=4
elif [ "$queued" -gt 100 ]; then want=3
elif [ "$queued" -gt 15 ];  then want=2
else want=1; fi

have=$(docker compose -f docker-compose.prod.yml ps --format '{{.Name}}' | grep -c worker || true)

if [ "$have" != "$want" ]; then
  GIT_SHA=$(git rev-parse HEAD) docker compose -f docker-compose.prod.yml \
    up -d --scale worker="$want" --no-recreate worker > /dev/null 2>&1
  echo "$(date -Is)  queued=$queued workers: $have -> $want"
else
  echo "$(date -Is)  queued=$queued workers=$have (no change)"
fi
