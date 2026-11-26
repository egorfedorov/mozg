#!/usr/bin/env bash
#
# Puts the site on its host: the pages as files, the server as a container.
#
#   deploy/site/deploy.sh user@host
#
# On the host it needs Docker with compose, nginx, and rsync. It does not touch
# nginx's own configuration: the snippet in nginx.conf is put there by hand,
# once. Run it from the root of the repository.
#
# This is the one command of the repository that changes a public machine. It
# is never run by a build, a test, or an agent on its own.

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "use: deploy/site/deploy.sh user@host" >&2
  exit 2
fi
host="$1"
here="$(cd "$(dirname "$0")" && pwd)"

echo "▸ build everything here"
npm ci --ignore-scripts
npm run build
npm run build:site

echo "▸ copy the source and the deploy folder (the pages are built again on the host)"
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude out --exclude dist \
  --exclude .i18n-parts --exclude 'plugin/desk' --exclude 'plugin/dist' \
  --exclude 'backup-*.tar.gz' --exclude 'deploy/site/data' --exclude 'deploy/site/.env' \
  ./ "$host:/srv/mozg/src/"

echo "▸ the server, in its container"
ssh "$host" "cd /srv/mozg/src && test -f deploy/site/.env && docker compose -f deploy/site/docker-compose.yml up -d --build"

echo "▸ the pages, where nginx looks"
ssh "$host" "mkdir -p /srv/mozg/out && docker cp mozg-site:/mozg/out/. /srv/mozg/out/ && cp /srv/mozg/src/deploy/site/proxy-params.conf /srv/mozg/"

echo "▸ does it answer"
sleep 2
ssh "$host" "curl -fsS http://127.0.0.1:4318/api/health && echo"
echo "done. The panel: https://mozg.sh/admin/  (a link: docker compose -f /srv/mozg/src/deploy/site/docker-compose.yml exec site node dist/site-server.mjs token)"
