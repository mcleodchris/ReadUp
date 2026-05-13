#!/usr/bin/env bash
# dev.sh — run `bun run tauri dev` after killing stale dev processes.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
bash "$here/preflight.sh"

cd "$here/.."
exec bun run tauri dev "$@"
