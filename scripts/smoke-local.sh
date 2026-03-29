#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

API_URL="${API_URL:-http://localhost:3001}"
SMOKE_REALTIME="${SMOKE_REALTIME:-0}"
SMOKE_REALTIME_PUBLISH_API_URL="${SMOKE_REALTIME_PUBLISH_API_URL:-${API_URL}}"
SMOKE_REALTIME_SSE_API_URL="${SMOKE_REALTIME_SSE_API_URL:-${API_URL}}"
SMOKE_EMAIL="${SMOKE_EMAIL:-agent@acme.com}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-AgentPass123!}"
SMOKE_AUTH_EMAIL="${SMOKE_AUTH_EMAIL:-0}"
SMOKE_AUTH_EMAIL_OUTBOX_DIR="${SMOKE_AUTH_EMAIL_OUTBOX_DIR:-apps/api/.auth-email-outbox}"
COOKIE_FILE="$(mktemp)"
SSE_FILE="$(mktemp)"
cleanup() {
  if [[ -n "${SSE_PID:-}" ]]; then
    kill "${SSE_PID}" >/dev/null 2>&1 || true
    wait "${SSE_PID}" >/dev/null 2>&1 || true
  fi
  rm -f "${COOKIE_FILE}"
  rm -f "${SSE_FILE}"
}
trap cleanup EXIT

echo "Smoke: checking health at ${API_URL}/health"
curl -fsS "${API_URL}/health" >/dev/null

echo "Smoke: logging in with seeded agent user"
LOGIN_PAYLOAD="$(printf '{"email":"%s","password":"%s"}' "${SMOKE_EMAIL}" "${SMOKE_PASSWORD}")"
curl -fsS -c "${COOKIE_FILE}" \
  -X POST "${API_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "${LOGIN_PAYLOAD}" >/dev/null

echo "Smoke: validating session"
curl -fsS -b "${COOKIE_FILE}" "${API_URL}/auth/session" >/dev/null

echo "Smoke: listing conversations"
curl -fsS -b "${COOKIE_FILE}" "${API_URL}/conversations" >/dev/null

if [[ "${SMOKE_AUTH_EMAIL}" == "1" ]]; then
  echo "Smoke: requesting a password reset email preview"
  mkdir -p "${SMOKE_AUTH_EMAIL_OUTBOX_DIR}"
  before_count="$(find "${SMOKE_AUTH_EMAIL_OUTBOX_DIR}" -type f | wc -l | tr -d ' ')"
  curl -fsS \
    -X POST "${API_URL}/auth/password-reset/request" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${SMOKE_EMAIL}\"}" >/dev/null
  sleep 1
  after_count="$(find "${SMOKE_AUTH_EMAIL_OUTBOX_DIR}" -type f | wc -l | tr -d ' ')"

  if [[ "${after_count}" -le "${before_count}" ]]; then
    echo "Smoke failed: expected a new auth email preview in ${SMOKE_AUTH_EMAIL_OUTBOX_DIR}" >&2
    exit 1
  fi
fi

if [[ "${SMOKE_REALTIME}" == "1" ]]; then
  echo "Smoke: validating realtime SSE delivery"
  CONVERSATIONS_JSON="$(curl -fsS -b "${COOKIE_FILE}" "${SMOKE_REALTIME_PUBLISH_API_URL}/conversations")"
  CONVERSATION_ID="$(
    printf '%s' "${CONVERSATIONS_JSON}" | node -e '
      let input = "";
      process.stdin.on("data", (chunk) => {
        input += chunk;
      });
      process.stdin.on("end", () => {
        const conversations = JSON.parse(input);
        if (!Array.isArray(conversations) || !conversations[0]?.id) {
          process.exit(1);
        }
        process.stdout.write(conversations[0].id);
      });
    '
  )"
  UNIQUE_NOTE="smoke-realtime-$(date +%s)"

  curl -NsS -b "${COOKIE_FILE}" "${SMOKE_REALTIME_SSE_API_URL}/events/stream" > "${SSE_FILE}" &
  SSE_PID=$!
  sleep 1

  curl -fsS -b "${COOKIE_FILE}" \
    -X POST "${SMOKE_REALTIME_PUBLISH_API_URL}/conversations/${CONVERSATION_ID}/notes" \
    -H "Content-Type: application/json" \
    -d "{\"body\":\"${UNIQUE_NOTE}\"}" >/dev/null

  found_realtime_event=0
  for _ in $(seq 1 30); do
    if grep -q "${UNIQUE_NOTE}" "${SSE_FILE}"; then
      found_realtime_event=1
      break
    fi
    sleep 1
  done

  if [[ "${found_realtime_event}" != "1" ]]; then
    echo "Smoke failed: realtime event was not observed on ${SMOKE_REALTIME_SSE_API_URL}" >&2
    exit 1
  fi

  kill "${SSE_PID}" >/dev/null 2>&1 || true
  wait "${SSE_PID}" >/dev/null 2>&1 || true
  unset SSE_PID
fi

echo "Smoke checks passed."
