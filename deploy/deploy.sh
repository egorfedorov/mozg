#!/usr/bin/env bash
# Deploy the current origin/main to the server.
#
#   ./deploy/deploy.sh              # pull, rebuild changed services, migrate
#   ./deploy/deploy.sh --full       # rebuild everything including embed
#
# Runs from a laptop over ssh. Everything is idempotent, so re-running after a
# failure is safe.
set -euo pipefail

HOST="${MOZG_HOST:-Mirca}"
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
if [ "$full" = 1 ]; then
  ssh "$HOST" "cd $DIR && docker compose -f docker-compose.prod.yml up -d --build"
else
  # The embed image carries torch and takes minutes to rebuild; its code
  # changes far less often than the app's.
  ssh "$HOST" "cd $DIR && docker compose -f docker-compose.prod.yml up -d --build app worker"
fi

say "4/5  migrations"
ssh "$HOST" "cd $DIR && docker compose -f docker-compose.prod.yml exec -T app npm run db:migrate 2>&1 | tail -3"

say "5/5  smoke test"
fail=0
for path in / /explore /mcp /robots.txt; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$URL$path")
  printf '  %-14s %s\n' "$path" "$code"
  [ "$code" = 200 ] || fail=1
done

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
