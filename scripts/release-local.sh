#!/usr/bin/env bash
# release-local.sh — build native installers for the current platform.
#
# What you get (by platform):
#   - Linux:   .deb, .rpm (if rpmbuild installed), .AppImage
#   - macOS:   .app, .dmg
#   - Windows: .msi (WiX), NSIS .exe (if NSIS installed)
#
# This delegates to `tauri build` after running the smoke harness as a
# pre-flight guard. Pass `--skip-smoke` to bypass it on a tight inner loop.

set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cd "$here/.."

skip_smoke=0
extra_args=()
for arg in "$@"; do
  case "$arg" in
    --skip-smoke) skip_smoke=1 ;;
    *) extra_args+=("$arg") ;;
  esac
done

if [[ "$skip_smoke" == "0" ]]; then
  echo "release-local: running smoke harness as preflight"
  bash "$here/smoke.sh"
fi

echo "release-local: bundling for $(uname -sm)"
bun run tauri build "${extra_args[@]+"${extra_args[@]}"}"

# Surface the output paths so a human / CI can locate the artifacts quickly.
bundle_dir="src-tauri/target/release/bundle"
if [[ -d "$bundle_dir" ]]; then
  echo
  echo "release-local: artifacts in $bundle_dir/"
  find "$bundle_dir" -type f \( -name "*.deb" -o -name "*.rpm" -o -name "*.AppImage" \
       -o -name "*.dmg" -o -name "*.app" -o -name "*.msi" -o -name "*.exe" \) \
       -printf "  %p  (%s bytes)\n" 2>/dev/null \
    || find "$bundle_dir" -type f \( -name "*.deb" -o -name "*.rpm" -o -name "*.AppImage" \
       -o -name "*.dmg" -o -name "*.app" -o -name "*.msi" -o -name "*.exe" \)
fi
