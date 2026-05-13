#!/usr/bin/env bash
# smoke.sh — full local CI: kill stale procs, typecheck, unit tests, build,
# end-to-end browser tests, Tauri binary launch check. Use `bun run smoke`.
#
# This is what catches the failure modes we've seen so far:
#   - Port 1420 already in use         → preflight
#   - vite-plugin-svelte mismatch      → bundle size check
#   - TypeScript / Svelte type drift   → svelte-check
#   - Pure-logic regressions           → vitest
#   - Rust regressions                 → cargo test
#   - Frontend runtime errors / wiring → playwright e2e
#   - Tauri config / icon / panic      → smoke-binary

set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cd "$here/.."

step() { printf "\n\033[1;34m▸ %s\033[0m\n" "$1"; }

step "preflight"
bash "$here/preflight.sh"

step "svelte-check"
bun run check

step "vitest (frontend unit tests)"
bun run test

step "cargo test (rust unit tests)"
(cd src-tauri && cargo test --lib --quiet)

step "vite production build"
bun run build > /tmp/readup-build.log 2>&1
tail -10 /tmp/readup-build.log

step "bundle sanity check"
# Tripwire for the vite-plugin-svelte v4-vs-v5 footgun: components must end up
# in the bundle. Look for at least one signature string from each layer.
js=$(find dist/assets -name "index-*.js" | head -1)
if [[ -z "$js" ]]; then
  echo "bundle sanity: index-*.js not found in dist/assets" >&2
  exit 1
fi
required=("Open File" "Open Folder" "CommonMark" "Extended" "prose" "mermaid")
for s in "${required[@]}"; do
  if ! grep -q "$s" "$js"; then
    echo "bundle sanity: missing string '$s' in $js (component tree-shaken?)" >&2
    exit 1
  fi
done
echo "bundle sanity: OK ($(du -h "$js" | cut -f1))"

step "playwright e2e (headless)"
bash "$here/preflight.sh"
bun run test:e2e:fast

step "Tauri binary launch check"
bash "$here/smoke-binary.sh"

printf "\n\033[1;32m✓ smoke OK\033[0m\n"
