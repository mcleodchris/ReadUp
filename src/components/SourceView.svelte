<script lang="ts">
  import { tick } from "svelte";
  import type { Document } from "../lib/store";
  import {
    highlightCode,
    getHighlighter,
    initHighlighter,
    ensureLanguage,
  } from "../lib/markdown/highlight";
  import { escapeHtml } from "../lib/util/escape";

  interface Props {
    document: Document;
  }

  const { document }: Props = $props();

  let renderEpoch = $state(0);

  let html = $derived.by(() => {
    void renderEpoch;
    const hl = highlightCode(document.source, "markdown");
    return hl ?? `<pre><code>${escapeHtml(document.source)}</code></pre>`;
  });

  $effect(() => {
    void document;
    void rehighlight();
  });

  async function rehighlight() {
    await tick();
    if (getHighlighter() !== null) return;
    await initHighlighter();
    await ensureLanguage("markdown");
    renderEpoch++;
  }
</script>

<div class="source">
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
