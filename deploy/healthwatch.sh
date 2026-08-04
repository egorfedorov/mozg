#!/usr/bin/env bash
# Alert by mail when https://mozg.sh/api/health stops answering, and when it
# recovers. Cron, every 5 minutes:
#
#   */5 * * * *  /opt/mozg/deploy/healthwatch.sh >> /var/log/mozg-health.log 2>&1
#
# Mail goes through Resend with the same key the app uses — no new accounts,
# no new secrets. Alerts fire on state *transitions* (plus an hourly reminder
# while down), because a mail every five minutes trains its reader to delete
# mail every five minutes.
set -u

ENV_FILE="${MOZG_ENV:-/opt/mozg/.env}"
URL="${MOZG_URL:-https://mozg.sh}/api/health"
STATE_FILE="/var/tmp/mozg-healthwatch.state"

# Key and sender come from the app's env file, parsed rather than sourced —
# the file is not a shell script and quoting in it must not break the cron.
RESEND_API_KEY=$(sed -n 's/^RESEND_API_KEY=//p' "$ENV_FILE" | tr -d '"')
EMAIL_FROM=$(sed -n 's/^EMAIL_FROM=//p' "$ENV_FILE" | tr -d '"')
if [ -z "$RESEND_API_KEY" ] || [ -z "$EMAIL_FROM" ]; then
  echo "$(date -Is)  no RESEND_API_KEY/EMAIL_FROM in $ENV_FILE — cannot alert"
  exit 1
fi

# Who gets the alert: OPERATOR_EMAIL from the environment, then from the env
# file, then the legacy MOZG_ALERT_TO, then the built-in operator address.
ALERT_TO="${OPERATOR_EMAIL:-$(sed -n 's/^OPERATOR_EMAIL=//p' "$ENV_FILE" | tr -d '"')}"
ALERT_TO="${ALERT_TO:-${MOZG_ALERT_TO:-}}"

body=$(curl -s --max-time 20 "$URL")
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$URL")

if [ "$code" = "200" ] && printf '%s' "$body" | grep -q '"status":"ok"'; then
  now="up"
else
  now="down"
fi

# The agent's-eye check: /api/health can be green while the thing agents
# actually do — search a brain over MCP — is broken (dead embedder auth,
# a bad deploy of the tool layer). One real search against a known brain;
# a result containing note_id proves the whole read path. Needs
# MOZG_WATCH_TOKEN in the env file; silently skipped without it.
WATCH_TOKEN="${MOZG_WATCH_TOKEN:-$(sed -n 's/^MOZG_WATCH_TOKEN=//p' "$ENV_FILE" | tr -d '"')}"
if [ "$now" = "up" ] && [ -n "$WATCH_TOKEN" ]; then
  mcp=$(curl -s --max-time 30 "${URL%/api/health}/mcp"     -H "content-type: application/json" -H "accept: application/json"     -H "authorization: Bearer $WATCH_TOKEN"     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"brain_search","arguments":{"brain":"mozg/stake-engine","query":"authenticate wallet session"}}}')
  if ! printf '%s' "$mcp" | grep -q 'note_id'; then
    now="down"
    body="MCP probe failed: brain_search returned no notes. Raw: $(printf '%s' "$mcp" | head -c 200)"
  fi
fi

# state file: "<up|down> <consecutive checks in this state>"
prev="up"; prev_count=0
if [ -f "$STATE_FILE" ]; then
  read -r prev prev_count < "$STATE_FILE" || true
fi
if [ "$now" = "$prev" ]; then count=$((prev_count + 1)); else count=1; fi
echo "$now $count" > "$STATE_FILE"

send() {
  curl -s -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(printf '{"from":"%s","to":"%s","subject":"%s","text":"%s"}' \
      "$EMAIL_FROM" "$ALERT_TO" "$1" "$2")" > /dev/null
}

if [ "$now" = "down" ] && [ "$count" = "1" ]; then
  # One failed check is usually a deploy restart caught mid-flight. Log it,
  # alert only if the next check agrees — a real outage survives five minutes.
  echo "$(date -Is)  down once (HTTP $code) — waiting for a second strike"
elif [ "$now" = "down" ] && [ "$count" = "2" ]; then
  send "mozg.sh is DOWN" \
    "health check failed twice in a row (HTTP $code), first seen ~5 minutes ago.\\n\\nResponse: $(printf '%s' "$body" | head -c 300 | tr '"' "'")\\n\\nLook: ssh <your-server> 'cd /opt/mozg && docker compose -f docker-compose.prod.yml logs --tail 50 app worker'"
  echo "$(date -Is)  DOWN (HTTP $code) — alert sent"
elif [ "$now" = "down" ] && [ $((count % 12)) -eq 0 ]; then
  send "mozg.sh is still down (~$((count * 5)) min)" \
    "health check has been failing for about $((count * 5)) minutes."
  echo "$(date -Is)  still down ($count checks) — reminder sent"
elif [ "$now" = "up" ] && [ "$prev" = "down" ] && [ "$prev_count" -ge 2 ]; then
  send "mozg.sh recovered" \
    "health is back to ok at $(date -u -Is) after about $((prev_count * 5)) minutes down."
  echo "$(date -Is)  recovered — alert sent"
elif [ "$now" = "up" ] && [ "$prev" = "down" ]; then
  echo "$(date -Is)  recovered from a single blip — no alert was owed"
else
  echo "$(date -Is)  $now"
fi
