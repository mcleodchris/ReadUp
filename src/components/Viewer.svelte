<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";
  import type { Document, ThemeName } from "../lib/store";
  import { render } from "../lib/markdown/renderer";
  import { highlightCode, initHighlighter, ensureLanguage } from "../lib/markdown/highlight";
  import { renderMermaidIn } from "../lib/markdown/mermaid-runtime";
  import { mermaidThemeFor } from "../lib/themes/theme";
  import { classifySrc, joinDocPath, siblingPath } from "../lib/markdown/images";
  import { fsUrl, inTauri } from "../lib/ipc";
  import type { Flavour } from "../lib/markdown/flavours";
  import {
    resolveWikilink as resolveWikilinkPure,
    type WikilinkIndex,
  } from "../lib/markdown/wikilinks";

  export let document: Document;
  export let flavour: Flavour;
  export let theme: ThemeName;
  export let wikilinkIndex: WikilinkIndex | null = null;

  const dispatch = createEventDispatcher<{ wikilink: string }>();

  let container: HTMLDivElement;
  let html = "";

  function resolveImageSrc(raw: string): string {
    const kind = classifySrc(raw);
    if (kind === "remote" || kind === "data") return raw;
    const abs = kind === "absolute" ? raw : joinDocPath(document.dir, raw);
    return inTauri() ? fsUrl(abs) : abs;
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c] as string);
  }

  function highlight(code: string, lang: string): string {
    const out = highlightCode(code, lang);
    if (out) return out;
    // Plain fallback while Shiki is still loading.
    return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  }

  function resolveWikilink(target: string): string | null {
    if (!wikilinkIndex) return null;
    return resolveWikilinkPure(target, wikilinkIndex, document.dir);
  }

  function renderDoc(): string {
    return render(document.source, {
      flavour,
      docDir: document.dir,
      resolveImageSrc,
      highlight,
      resolveWikilink: wikilinkIndex ? resolveWikilink : undefined,
    });
  }

  $: {
    // The expression-form dependency list is implicit: any reactive value
    // referenced inside `renderDoc` (via closure) re-triggers this block.
    void document;
    void flavour;
    void wikilinkIndex;
    html = renderDoc();
  }

  function onContainerClick(e: Event) {
    // The viewer container is non-interactive; this delegation only fires
    // when an inner <a.wikilink> (which *is* interactive) is clicked.
    const target = e.target as HTMLElement | null;
    const a = target?.closest("a.wikilink") as HTMLAnchorElement | null;
    if (!a || !container?.contains(a)) return;
    const path = a.getAttribute("data-wikilink-target");
    if (!path) return;
    e.preventDefault();
    dispatch("wikilink", path);
  }

  $: void runPostRender(html, theme);

  async function runPostRender(_h: string, t: ThemeName) {
    // Wait for the new HTML to be in the DOM before we look up images and mermaid blocks.
    await tick();
    if (!container) return;
    wireImageFallbacks(container);
    await renderMermaidIn(container, mermaidThemeFor(t));
    await rehighlightUnknownLangs(container);
  }

  function wireImageFallbacks(root: HTMLElement) {
    const imgs = Array.from(root.querySelectorAll<HTMLImageElement>("img[data-raw-src]"));
    for (const img of imgs) {
      if (img.dataset.fallbackWired === "1") continue;
      img.dataset.fallbackWired = "1";

      const raw = img.dataset.rawSrc ?? "";
      const docDir = img.dataset.docDir ?? document.dir ?? "";
      const kind = classifySrc(raw);

      img.addEventListener("error", () => onImageError(img, raw, docDir, kind), { once: false });
    }
  }

  function onImageError(
    img: HTMLImageElement,
    raw: string,
    docDir: string,
    kind: ReturnType<typeof classifySrc>,
  ) {
    if (img.dataset.fallbackStage === "sibling") {
      // Sibling attempt already failed → show placeholder.
      replaceWithPlaceholder(img, raw);
      return;
    }
    if (kind === "remote" && docDir) {
      img.dataset.fallbackStage = "sibling";
      const sibling = siblingPath(docDir, raw);
      img.src = inTauri() ? fsUrl(sibling) : sibling;
      return;
    }
    replaceWithPlaceholder(img, raw);
  }

  function replaceWithPlaceholder(img: HTMLImageElement, raw: string) {
    const span = window.document.createElement("span");
    span.className = "image-fallback";
    span.title = raw;
    span.textContent = `🖼 missing: ${raw}`;
    img.replaceWith(span);
  }

  async function rehighlightUnknownLangs(root: HTMLElement) {
    // Find any unhighlighted code blocks (plain fallback) and try again after
    // Shiki finishes loading or after the requested language has been fetched.
    const plain = root.querySelectorAll<HTMLPreElement>("pre.shiki > code");
    if (plain.length === 0) return;
    await initHighlighter();
    // Re-render the whole document now that the highlighter is up; this is
    // simpler than per-block patching and keeps the dual-theme markup tidy.
    const requestedLangs = new Set<string>();
    root.querySelectorAll<HTMLElement>("[class*='language-']").forEach((el) => {
      const m = el.className.match(/language-([\w+-]+)/);
      if (m) requestedLangs.add(m[1]);
    });
    await Promise.all([...requestedLangs].map(ensureLanguage));
    html = renderDoc();
  }
</script>

<svelte:body on:click={onContainerClick} />

<div class="prose" bind:this={container}>
  {@html html}
</div>
