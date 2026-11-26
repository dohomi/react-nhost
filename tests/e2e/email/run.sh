#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."

random_hex() { node -p "require('node:crypto').randomBytes($1).toString('hex')"; }
export DB_PASS JWT_KEY ENC_KEY GQL_ADMIN
DB_PASS=$(random_hex 24)
JWT_KEY=$(random_hex 32)
ENC_KEY=$(random_hex 16)
GQL_ADMIN=$(random_hex 24)
project="nhost-email-e2e-$(random_hex 8)"
compose=(docker compose -p "$project" -f tests/e2e/email/compose.yaml)

suite=${1:-email}
if [[ "$suite" == elevation ]]; then
  compose+=(-f tests/e2e/elevation/compose.yaml)
fi

docker compose version >/dev/null
trap '"${compose[@]}" down --volumes' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"${compose[@]}" up -d --wait --wait-timeout 120
VITE_NHOST_AUTH_URL=http://localhost:19902/v1 VITE_TURNSTILE_SITE_KEY='' node "tests/e2e/$suite/verify.mjs"
