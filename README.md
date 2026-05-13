# ReadUp

A multiplatform markdown reader built with Tauri 2, Svelte 5, and TypeScript.

## Features

- Opens a single `.md` file or a folder of markdown files
- Folder entry resolution: `index.md` → `README.md` → first by name
- Directory-tree sidebar in folder mode
- Rendered view by default; toggle to raw source (Ctrl/Cmd+E)
- Three markdown flavours: CommonMark, GFM, Extended (footnotes, definition
  lists), selectable from the toolbar
- Native Mermaid diagrams via `` ```mermaid `` fences
- Syntax highlighting via Shiki with Catppuccin themes
- Image fallback chain: remote → local sibling → placeholder badge
- Obsidian-style wikilinks: `[[note-name]]` and `[[note-name|alias]]` resolve
  against the open folder; broken targets render in a distinct style
- Built-in Catppuccin Latte (light) and Mocha (dark) themes
- Keyboard shortcuts: `Ctrl/Cmd+O` open file, `Ctrl/Cmd+Shift+O` open folder

## Stack

| Layer | Choice |
| --- | --- |
| Shell | Tauri 2 (Rust + system webview) |
| Frontend | Svelte 5 + TypeScript |
| Build / dev | Vite, Bun |
| Markdown | markdown-it + plugins |
| Highlighting | Shiki (Catppuccin themes) |
| Diagrams | Mermaid |
| Tests | Vitest + cargo test |

## Development

```bash
bun install
bun x playwright install chromium   # one-time, for e2e tests

bun run dev:clean                   # tauri dev, but kills stale Vite/Tauri first
bun run tauri dev                   # same thing without preflight
bun run tauri dev -- ./fixtures/sample  # open a folder on launch
```

The `fixtures/` directory contains sample folders that exercise the entry-file
resolver, Mermaid, code highlighting, tables, footnotes, and image fallback.

## Test harness

`bun run smoke` runs the whole pipeline locally, in order:

1. **preflight** — kills stale dev servers holding ports 1420/1421
2. **svelte-check** — type-checks `.ts` / `.svelte`
3. **vitest** — frontend unit tests (45+ tests covering entry resolver, tree
   pruning, markdown flavours, mermaid plugin, image-src classification)
4. **cargo test** — Rust unit tests (entry resolver + tree builder)
5. **vite build** — produces `dist/`
6. **bundle sanity check** — greps the production JS for known UI strings so we
   notice if components get tree-shaken (this caught a real
   `vite-plugin-svelte` v4-vs-v5 mismatch where the bundle dropped to 12 kB)
7. **playwright e2e** — Chromium loads the built bundle with a mocked Tauri
   IPC, then drives real interactions: open folder, switch flavour, toggle
   source view, render Mermaid, syntax highlighting, image fallback, etc.
8. **Tauri binary launch check** — builds the release binary and launches it
   for 3 s; a panic / missing-config / bad-icon failure exits non-zero

Faster targeted runs:

```bash
bun run test                # unit tests only
bun run test:e2e            # build + e2e
bun run test:e2e:fast       # e2e against existing dist/
bun run test:e2e:headed     # e2e with a visible browser
bun run smoke:bin           # binary smoke only
bun run preflight           # just clean up ports
```

The e2e tests mock Tauri's IPC bridge (`window.__TAURI_INTERNALS__`) and the
dialog plugin so the same UI code runs inside Chromium with no Tauri runtime.
See `e2e/tauri-mock.ts` for the contract; add a new handler when you add a new
`#[tauri::command]`.

## Project layout

```
src/                 # frontend (Svelte + TS)
  lib/files/         # entry-file resolver, tree pruning, path utils
  lib/markdown/      # renderer, plugins (mermaid, images), highlighter
  lib/themes/        # Catppuccin CSS + prose stylesheet
  lib/ipc.ts         # typed wrappers over Tauri commands
  components/        # App, Toolbar, Sidebar, Viewer, SourceView
src-tauri/           # Rust backend
  src/fs_commands.rs # read_file, list_dir, resolve_entry + tests
  src/lib.rs         # Tauri builder + CLI argv plumbing
fixtures/            # sample folders for manual + e2e testing
e2e/                 # Playwright tests + Tauri IPC mock
scripts/             # preflight, dev, smoke, smoke-binary
```

## Packaging

### Local builds (current platform only)

```bash
bun run release:local            # runs smoke harness, then `tauri build`
bun run release:local --skip-smoke  # skip the harness for a tighter loop
bun run tauri build              # raw equivalent, no smoke
```

Artifacts land in `src-tauri/target/release/bundle/<format>/`:

| Platform | Outputs | Required tools |
| --- | --- | --- |
| **Linux** | `.deb`, `.rpm`, `.AppImage` | `dpkg-dev`, `rpmbuild`, `libwebkit2gtk-4.1-dev`, `librsvg2-dev`, `patchelf` |
| **macOS** | `.app`, `.dmg` | Xcode command-line tools |
| **Windows** | `.msi` (WiX), `.exe` (NSIS) | WiX 3 toolset (auto-fetched by Tauri); NSIS installer for `.exe` |

You can scope the bundle types from the CLI: `bun run tauri build -- --bundles deb,appimage`.

### Cross-platform releases via GitHub Actions

`.github/workflows/release.yml` builds **all three platforms in parallel** and
attaches the artifacts to a draft GitHub Release. Two entry points:

1. **Tag release** — push a `v*` tag (e.g. `git tag v0.1.0 && git push origin v0.1.0`).
   A draft release is created at `ReadUp v0.1.0` with all platform bundles
   attached. Promote it to "published" after smoke-testing the artifacts.
2. **Manual dispatch** — Actions → "release" → "Run workflow". Builds the
   artifacts and stores them as workflow artifacts (no Release published).

The workflow uses [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action),
which handles the platform-specific build commands and bundle assembly. macOS
produces a universal binary (Apple silicon + Intel) by building against
`universal-apple-darwin`.

#### Code signing (optional)

The workflow consumes these repo secrets when present. If absent, builds are
**unsigned** — fine for early testing, but macOS will Gatekeeper-block and
Windows will SmartScreen-warn end users.

| Platform | Secrets to set |
| --- | --- |
| macOS | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` |
| Windows | `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD` |

See the Tauri signing docs:
- macOS: https://v2.tauri.app/distribute/sign/macos/
- Windows: https://v2.tauri.app/distribute/sign/windows/

#### Linux signing

Tauri doesn't sign Linux bundles by default. If you want signed `.deb` /
`.AppImage`, do it after the workflow finishes — pull the artifact, sign with
`dpkg-sig` or your AppImage update key, and attach the signed file back to the
release.

### Updating the version

Bump `version` in three places before tagging:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

(There's no auto-sync; a `scripts/bump-version.sh` is a fair follow-up if you
release often.)

## Status

Prototype. No editing capabilities; reader-only. Drag-drop and file watching
are not implemented yet.
