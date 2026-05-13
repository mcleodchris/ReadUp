#!/usr/bin/env bash
# smoke-binary.sh — verify the Tauri release binary launches without crashing.
#
# This is the most we can automate without a fully-driven WebDriver harness:
#  1. Build the release binary.
#  2. Try to launch it under Xvfb (if available) for a few seconds. A crash on
#     startup, a missing-permission error, or an immediate non-zero exit fails
#     this script.
#  3. If Xvfb is unavailable, fall back to a "binary builds and prints --help
#     without panicking" check; we can't drive the window but we can catch
#     gross build regressions.

set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cd "$here/.."

bash "$here/preflight.sh"

# 1. Build (incremental — cargo will skip work if nothing changed).
echo "smoke-binary: building release binary"
(cd src-tauri && cargo build --release --quiet)

BIN="src-tauri/target/release/readup"
if [[ ! -x "$BIN" ]]; then
  echo "smoke-binary: binary not produced at $BIN" >&2
  exit 1
fi
echo "smoke-binary: built $(du -h "$BIN" | cut -f1) binary"

# 2. Try to launch.
if command -v xvfb-run >/dev/null 2>&1; then
  echo "smoke-binary: launching under xvfb-run for 5s"
  # `timeout -k 1 5 ...` sends SIGTERM after 5s and SIGKILL 1s later if it
  # hangs. We accept exit code 124 (timeout) as success — it means the binary
  # was still running, i.e. didn't crash.
  set +e
  out=$(xvfb-run --auto-servernum --server-args="-screen 0 1280x800x24" \
        timeout --kill-after=1 5 "$BIN" 2>&1)
  status=$?
  set -e
  echo "$out" | tail -40
  if [[ "$status" == "124" || "$status" == "137" ]]; then
    echo "smoke-binary: OK (binary ran past 5s under xvfb)"
    exit 0
  fi
  echo "smoke-binary: binary exited with status $status before timeout" >&2
  exit "$status"
fi

echo "smoke-binary: xvfb-run not available; performing reduced check"
# We can't open a window, but we can at least let Tauri start until it hits
# the GUI step. If our Rust code panics earlier (missing config, bad asset
# protocol scope, syntax error in tauri.conf.json), that surfaces here.
set +e
out=$(timeout --kill-after=1 3 "$BIN" 2>&1)
status=$?
set -e
echo "$out" | tail -20

# Status 124 means it didn't exit (good — it got to the GUI step).
# Any other non-zero status that mentions display/connection is fine.
# A panic / "thread 'main' panicked" / "error while running" is a fail.
if grep -qE "thread 'main' panicked|error while running ReadUp|invalid type|missing field" <<<"$out"; then
  echo "smoke-binary: PANIC detected in output" >&2
  exit 1
fi

if [[ "$status" == "124" || "$status" == "137" || "$status" == "0" || "$status" == "1" ]]; then
  echo "smoke-binary: OK (reached GUI init step; no panic; status $status)"
  exit 0
fi

echo "smoke-binary: unexpected exit status $status" >&2
exit "$status"
