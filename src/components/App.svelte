<script lang="ts">
  import { onMount } from "svelte";
  import { state } from "../lib/store";
  import Toolbar from "./Toolbar.svelte";
  import Sidebar from "./Sidebar.svelte";
  import Viewer from "./Viewer.svelte";
  import SourceView from "./SourceView.svelte";
  import { applyTheme } from "../lib/themes/theme";
  import { initHighlighter } from "../lib/markdown/highlight";
  import {
    inTauri,
    listDir,
    readFile,
    readInitTarget,
    resolveEntryPath,
  } from "../lib/ipc";
  import { pruneTree } from "../lib/files/tree";
  import { buildWikilinkIndex } from "../lib/markdown/wikilinks";

  $: applyTheme($state.theme);

  async function loadFile(path: string) {
    try {
      const r = await readFile(path);
      const dir = path.replace(/[\\/][^\\/]+$/, "");
      state.update((s) => ({
        ...s,
        current: { path: r.path, source: r.content, dir },
        error: null,
      }));
    } catch (err) {
      state.update((s) => ({ ...s, error: `Failed to read ${path}: ${err}` }));
    }
  }

  async function openFolderRoot(path: string) {
    try {
      const raw = await listDir(path);
      const pruned = pruneTree(raw);
      const entry = await resolveEntryPath(path);
      const wikilinkIndex = pruned ? buildWikilinkIndex(pruned) : null;
      state.update((s) => ({
        ...s,
        root: { kind: "folder", path },
        tree: pruned,
        wikilinkIndex,
        error: pruned ? null : "No markdown files found in folder.",
      }));
      if (entry) await loadFile(entry);
      else state.update((s) => ({ ...s, current: null }));
    } catch (err) {
      state.update((s) => ({ ...s, error: `Failed to open folder: ${err}` }));
    }
  }

  async function openFileRoot(path: string) {
    state.update((s) => ({
      ...s,
      root: { kind: "file", path },
      tree: null,
      wikilinkIndex: null,
    }));
    await loadFile(path);
  }

  onMount(async () => {
    // Highlight engine is async; we begin loading immediately so the first
    // render has a chance to use it, with a synchronous plain fallback if not.
    initHighlighter().catch(() => {
      /* highlighting becomes a no-op */
    });

    if (!inTauri()) return;
    try {
      const init = await readInitTarget();
      if (!init) return;
      if (init.kind === "file") await openFileRoot(init.path);
      else await openFolderRoot(init.path);
    } catch (err) {
      state.update((s) => ({ ...s, error: `Startup error: ${err}` }));
    }
  });

  function onSelect(event: CustomEvent<string>) {
    loadFile(event.detail);
  }

  function onWikilink(event: CustomEvent<string>) {
    loadFile(event.detail);
  }
</script>

<div class="layout">
  <Toolbar onOpenFile={openFileRoot} onOpenFolder={openFolderRoot} />
  <div class="body">
    {#if $state.tree && $state.root?.kind === "folder"}
      <aside class="sidebar">
        <Sidebar tree={$state.tree} current={$state.current?.path ?? null} on:select={onSelect} />
      </aside>
    {/if}
    <main class="content">
      {#if $state.current}
        {#if $state.view === "rendered"}
          <Viewer
            document={$state.current}
            flavour={$state.flavour}
            theme={$state.theme}
            wikilinkIndex={$state.wikilinkIndex}
            on:wikilink={onWikilink}
          />
        {:else}
          <SourceView document={$state.current} />
        {/if}
      {:else if $state.error}
        <div class="empty">
          <p>{$state.error}</p>
        </div>
      {:else}
        <div class="empty">
          <h1>ReadUp</h1>
          <p>Open a file or folder to begin.</p>
        </div>
      {/if}
    </main>
  </div>
</div>

<style>
  .layout {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  .sidebar {
    width: 260px;
    border-right: 1px solid var(--rd-border);
    background: var(--rd-bg-elevated);
    overflow: auto;
  }

  .content {
    flex: 1;
    overflow: auto;
    background: var(--rd-bg);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--rd-fg-muted);
    text-align: center;
    padding: 2rem;
  }

  .empty h1 {
    color: var(--rd-fg);
    margin: 0 0 0.5em;
  }
</style>
