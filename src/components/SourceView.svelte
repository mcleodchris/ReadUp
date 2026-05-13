<script lang="ts">
  import { tick } from "svelte";
  import type { Document } from "../lib/store";
  import { highlightCode, initHighlighter, ensureLanguage } from "../lib/markdown/highlight";

  export let document: Document;

  let container: HTMLDivElement;
  let html = "";

  function escapeHtml(s: string): string {
    return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
  }

  $: {
    const hl = highlightCode(document.source, "markdown");
    html = hl ?? `<pre><code>${escapeHtml(document.source)}</code></pre>`;
  }

  $: void rehighlight(document.source);

  async function rehighlight(_s: string) {
    await tick();
    if (highlightCode("", "markdown") === null) {
      await initHighlighter();
      await ensureLanguage("markdown");
      html = highlightCode(document.source, "markdown") ?? html;
    }
  }
</script>

<div class="source" bind:this={container}>
  {@html html}
</div>

<style>
  .source {
    padding: 1.5rem 2rem;
    font-size: 14px;
    color: var(--rd-fg);
  }

  .source :global(pre) {
    margin: 0;
    background: var(--rd-bg);
    border: 0;
    padding: 0;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .source :global(code) {
    font-family: "JetBrains Mono", ui-monospace, monospace;
  }
</style>
