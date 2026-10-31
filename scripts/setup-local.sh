#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

command -v node >/dev/null || { echo "Install Node.js 20.9+ before running setup." >&2; exit 1; }
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 20 || (major === 20 && minor < 9)) process.exit(1)' || {
  echo "TeamFlow requires Node.js 20.9 or newer." >&2
  exit 1
}

npm ci
node --import tsx scripts/setup-local.ts
