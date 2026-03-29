#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

API_URL="${API_URL:-http://localhost:3001}"
SMOKE_EMAIL="${SMOKE_EMAIL:-agent@acme.com}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-AgentPass123!}"
SMOKE_AUTH_EMAIL="${SMOKE_AUTH_EMAIL:-0}"
SMOKE_AUTH_EMAIL_OUTBOX_DIR="${SMOKE_AUTH_EMAIL_OUTBOX_DIR:-apps/api/.auth-email-outbox}"
COOKIE_FILE="$(mktemp)"
cleanup() {
  rm -f "${COOKIE_FILE}"
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

echo "Smoke checks passed."
