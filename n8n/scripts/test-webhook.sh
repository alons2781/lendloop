#!/usr/bin/env bash
# Sends a correctly signed LendLoop event to the local n8n webhook.
#
#   ./scripts/test-webhook.sh                     valid event (email lands in Mailpit)
#   ./scripts/test-webhook.sh --replay            same delivery twice (2nd is a duplicate)
#   ./scripts/test-webhook.sh --tamper            body changed after signing   -> 401
#   ./scripts/test-webhook.sh --stale             timestamp 1h old             -> 401
#   ./scripts/test-webhook.sh --bad-token         wrong X-LendLoop-Token       -> 401
#   ./scripts/test-webhook.sh --event loan.returned --email me@example.com
set -euo pipefail
cd "$(dirname "$0")/.."

env_val() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
SECRET=$(env_val LENDLOOP_WEBHOOK_SECRET)
TOKEN=$(env_val LENDLOOP_WEBHOOK_TOKEN)
URL="${WEBHOOK_URL:-http://localhost:5678/webhook/lendloop/loan-event}"

EVENT="loan.requested"; EMAIL="owner@example.com"; MODE="valid"
while [ $# -gt 0 ]; do
  case "$1" in
    --event) EVENT="$2"; shift ;;
    --email) EMAIL="$2"; shift ;;
    --replay|--tamper|--stale|--bad-token) MODE="${1#--}" ;;
    *) echo "unknown option $1"; exit 1 ;;
  esac
  shift
done

# A fresh key per run, except --replay which reuses one key twice.
KEY="test-$(date +%s)-$RANDOM:$EVENT"
BODY=$(printf '{"idempotencyKey":"%s","event":"%s","occurredAt":"%s","loan":{"id":"test","toolName":"Drill","startDate":"2026-11-11","endDate":"2026-11-12","status":"requested"},"recipient":{"role":"owner","username":"owner-test","email":"%s"},"counterparty":{"username":"borrower-test"}}' \
  "$KEY" "$EVENT" "$(date -u +%FT%TZ)" "$EMAIL")

send() {
  local ts body="$BODY" token="$TOKEN"
  ts=$(date +%s); [ "$MODE" = stale ] && ts=$((ts - 3600))
  local sig="sha256=$(printf '%s' "$ts.$body" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')"
  [ "$MODE" = tamper ] && body="${body/Drill/Hammer}"
  [ "$MODE" = bad-token ] && token="wrong"
  curl -s -w "  -> HTTP %{http_code}\n" -X POST "$URL" \
    -H "Content-Type: application/json" \
    -H "X-LendLoop-Token: $token" -H "X-LendLoop-Timestamp: $ts" \
    -H "X-LendLoop-Signature: $sig" -d "$body"
}

send
[ "$MODE" = replay ] && send
echo "Inbox: http://localhost:8025"
