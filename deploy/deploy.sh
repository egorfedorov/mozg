#!/usr/bin/env bash
# Deploy the current origin/main to the server.
#
#   ./deploy/deploy.sh              # pull, rebuild changed services, migrate
#   ./deploy/deploy.sh --full       # rebuild everything including embed
#
# Runs from a laptop over ssh. Everything is idempotent, so re-running after a
# failure is safe.
set -euo pipefail

HOST="${MOZG_HOST:-mozg-server}"
DIR="${MOZG_DIR:-/opt/mozg}"
URL="${MOZG_URL:-https://mozg.sh}"

full=0
[ "${1:-}" = "--full" ] && full=1

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "1/5  local checks"
npm run typecheck
npm test 2>&1 | tail -3

if [ -n "$(git status --porcelain)" ]; then
  echo "✗ working tree is dirty — commit or stash first"
  exit 1
fi
git push -q origin main
echo "  pushed $(git rev-parse --short HEAD)"

say "2/5  pulling on $HOST"
ssh "$HOST" "cd $DIR && git fetch -q origin && git reset -q --hard origin/main && git log --oneline | head -1"

say "3/5  rebuilding"
sha=$(git rev-parse HEAD)
if [ "$full" = 1 ]; then
  ssh "$HOST" "cd $DIR && GIT_SHA=$sha docker compose -f docker-compose.prod.yml up -d --build"
else
  # The embed image carries torch and takes minutes to rebuild; its code
  # changes far less often than the app's.
  ssh "$HOST" "cd $DIR && GIT_SHA=$sha docker compose -f docker-compose.prod.yml up -d --build app worker"
  # Then bring up anything the compose file gained that the host does not run
  # yet, without rebuilding it. Naming services to rebuild silently skips new
  # ones: adding embed-query shipped an app pointed at a host that did not
  # exist, and search degraded to text-only while every smoke check stayed
  # green.
  ssh "$HOST" "cd $DIR && GIT_SHA=$sha docker compose -f docker-compose.prod.yml up -d"
fi

# A deploy that ships a cached layer is invisible otherwise: the server's git
# says one thing and the running bundle is another. This has happened once —
# a new route existed in the repository and 404ed in production — so the
# deploy now refuses to call itself finished unless the image agrees.
running=$(curl -s --max-time 25 "$URL/api/health" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
if [ "$running" != "$sha" ]; then
  echo "  ✗ deployed $sha but the app reports ${running:-nothing}"
  echo "    the image was built from a cached layer — rebuild it properly:"
  echo "    ssh $HOST 'cd $DIR && GIT_SHA=$sha docker compose -f docker-compose.prod.yml build --no-cache app worker && docker compose -f docker-compose.prod.yml up -d'"
  exit 1
fi
echo "  running $running"

say "4/5  backup + migrations"
# Never migrate against the only copy of the data: dump and restore-check the
# database first, so a bad migration means restoring a minutes-old backup from
# /var/backups/mozg instead of last night's.
ssh "$HOST" "$DIR/deploy/backup.sh"
ssh "$HOST" "cd $DIR && docker compose -f docker-compose.prod.yml exec -T app npm run db:migrate:prod 2>&1 | tail -3"

say "5/5  smoke test"
fail=0
# /.well-known/mcp-registry-auth is our domain proof for the MCP Registry: if it
# stops serving, the next publish cannot authenticate (see docs/REGISTRY.md).
for path in / /explore /mcp /robots.txt /.well-known/mcp-registry-auth; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$URL$path")
  printf '  %-14s %s\n' "$path" "$code"
  [ "$code" = 200 ] || fail=1
done

# Embeddings degrade quietly: without them search silently falls back to full
# text, answers get worse, and every page still returns 200. /api/health reports
# it as degraded rather than down (correctly — the site works), so the deploy has
# to be the one that objects.
embed=$(curl -s --max-time 25 "$URL/api/health" | sed -n 's/.*"embeddings":"\([^"]*\)".*/\1/p')
printf '  %-14s %s (expect ok)\n' "embeddings" "${embed:-unknown}"
[ "$embed" = ok ] || fail=1

# An unauthenticated MCP call must be refused — if this ever returns 200 the
# whole brain surface is public.
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 -X POST "$URL/mcp" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
printf '  %-14s %s (expect 401)\n' "/mcp no auth" "$code"
[ "$code" = 401 ] || fail=1

if [ "$fail" = 1 ]; then
  echo
  echo "✗ smoke test failed — check: ssh $HOST 'cd $DIR && docker compose -f docker-compose.prod.yml logs --tail 50 app'"
  exit 1
fi

echo
echo "✓ deployed $(git rev-parse --short HEAD) to $URL"
