<script lang="ts">
  import { state, type ViewMode, type ThemeName } from "../lib/store";
  import { FLAVOURS, type Flavour } from "../lib/markdown/flavours";
  import { inTauri, pickFile, pickFolder } from "../lib/ipc";
  import { basename } from "../lib/files/paths";

  interface Props {
    onOpenFile: (path: string) => Promise<void>;
    onOpenFolder: (path: string) => Promise<void>;
  }

  const { onOpenFile, onOpenFolder }: Props = $props();

  async function openFile() {
    if (!inTauri()) {
      state.update((s) => ({ ...s, error: "Open dialog requires the desktop app." }));
      return;
    }
    const p = await pickFile();
    if (p) await onOpenFile(p);
  }

  async function openFolder() {
    if (!inTauri()) {
      state.update((s) => ({ ...s, error: "Open dialog requires the desktop app." }));
      return;
    }
    const p = await pickFolder();
    if (p) await onOpenFolder(p);
  }

  function setView(v: ViewMode) {
    state.update((s) => ({ ...s, view: v }));
  }

  function setFlavour(e: Event) {
    const f = (e.target as HTMLSelectElement).value as Flavour;
    state.update((s) => ({ ...s, flavour: f }));
  }

  function setTheme(t: ThemeName) {
    state.update((s) => ({ ...s, theme: t }));
  }

  function handleKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
      e.preventDefault();
      if (e.shiftKey) openFolder();
      else openFile();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
      e.preventDefault();
      setView($state.view === "rendered" ? "source" : "rendered");
    }
  }
</script>

<svelte:window onkeydown={handleKey} />

<div class="toolbar">
  <div class="group">
    <button onclick={openFile} title="Open file (Ctrl/Cmd+O)">Open File…</button>
    <button onclick={openFolder} title="Open folder (Ctrl/Cmd+Shift+O)">Open Folder…</button>
  </div>

  <div class="title">
    {$state.current ? basename($state.current.path) : "ReadUp"}
  </div>

  <div class="group">
    <div class="seg">
      <button
        type="button"
        aria-pressed={$state.view === "rendered"}
        onclick={() => setView("rendered")}>Rendered</button
      >
      <button
        type="button"
        aria-pressed={$state.view === "source"}
        onclick={() => setView("source")}>Source</button
      >
    </div>

    <select value={$state.flavour} onchange={setFlavour} title="Markdown flavour">
      {#each FLAVOURS as f}
        <option value={f.value}>{f.label}</option>
      {/each}
    </select>

    <div class="seg">
      <button
        type="button"
        aria-pressed={$state.theme === "latte"}
        onclick={() => setTheme("latte")}
        title="Latte (light)">☀</button
      >
      <button
        type="button"
        aria-pressed={$state.theme === "mocha"}
        onclick={() => setTheme("mocha")}
        title="Mocha (dark)">☾</button
      >
    </div>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.4rem 0.75rem;
    background: var(--rd-bg-elevated);
    border-bottom: 1px solid var(--rd-border);
    flex-shrink: 0;
  }

  .group {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .title {
    flex: 1;
    text-align: center;
    color: var(--rd-fg-muted);
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .seg {
    display: flex;
    border: 1px solid var(--rd-border);
    border-radius: 4px;
    overflow: hidden;
  }

  .seg button {
    border: 0;
    border-radius: 0;
    border-right: 1px solid var(--rd-border);
  }

  .seg button:last-child {
    border-right: 0;
  }
</style>
