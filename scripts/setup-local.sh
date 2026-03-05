#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

ensure_env_file() {
  local example_file="$1"
  local target_file="$2"

  if [[ -f "${target_file}" ]]; then
    return
  fi

  cp "${example_file}" "${target_file}"
  echo "created ${target_file} from ${example_file}"
}

ensure_env_file "apps/api/.env.example" "apps/api/.env"
ensure_env_file "apps/web/.env.example" "apps/web/.env"

docker compose up -d
pnpm db:migrate
pnpm db:seed

echo
echo "Local setup complete."
echo "Run 'pnpm dev' to start web + api, or use 'pnpm demo:local' for one-command startup."
