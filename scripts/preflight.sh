#!/usr/bin/env bash
# preflight.sh — clean up stale processes that would block a fresh dev run.
#
# `bun run tauri dev` fails with "Port 1420 is already in use" if a previous
# Vite instance was left behind. Run this before any dev/smoke command.

set -euo pipefail

PORTS=(1420 1421)
NAMES=("vite" "tauri-cli" "readup")

killed_any=0

for port in "${PORTS[@]}"; do
  pids=$(lsof -tiTCP:"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "preflight: freeing port $port (PIDs: $pids)"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.3
    pids=$(lsof -tiTCP:"$port" 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
    killed_any=1
  fi
done

for name in "${NAMES[@]}"; do
  pids=$(pgrep -f "$name" || true)
  if [[ -n "$pids" ]]; then
    # Don't kill our own shell or this script.
    for pid in $pids; do
      [[ "$pid" == "$$" ]] && continue
      cmd=$(ps -p "$pid" -o args= 2>/dev/null || true)
      case "$cmd" in
        *node*vite*|*tauri*dev*|*readup_lib*|*target/debug/readup*|*target/release/readup*)
          echo "preflight: killing $pid ($cmd)"
          kill "$pid" 2>/dev/null || true
          killed_any=1
          ;;
      esac
    done
  fi
done

if [[ "$killed_any" == "0" ]]; then
  echo "preflight: nothing to clean up"
fi
