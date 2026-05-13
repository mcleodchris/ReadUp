<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { Document, ThemeName } from "../lib/store";
  import { render } from "../lib/markdown/renderer";
  import {
    highlightCode,
    getHighlighter,
    initHighlighter,
    ensureLanguage,
  } from "../lib/markdown/highlight";
  import { renderMermaidIn } from "../lib/markdown/mermaid-runtime";
  import { mermaidThemeFor } from "../lib/themes/theme";
  import { classifySrc, joinDocPath, siblingPath } from "../lib/markdown/images";
  import { fsUrl, inTauri } from "../lib/ipc";
  import type { Flavour } from "../lib/markdown/flavours";
  import {
    resolveWikilink as resolveWikilinkPure,
    type WikilinkIndex,
  } from "../lib/markdown/wikilinks";
  import { escapeHtml } from "../lib/util/escape";

  interface Props {
    document: Document;
    flavour: Flavour;
    theme: ThemeName;
    wikilinkIndex?: WikilinkIndex | null;
    onWikilink?: (path: string) => void;
  }

  const {
    document,
    flavour,
    theme,
    wikilinkIndex = null,
    onWikilink,
  }: Props = $props();

  let container: HTMLDivElement;

  function resolveImageSrc(raw: string): string {
    const kind = classifySrc(raw);
    switch (kind) {
      case "remote":
      case "data":
      case "protocol-relative":
        return raw;
      case "other":
        // Unknown scheme — don't path-join it into the doc directory.
        return raw;
      case "absolute":
        return inTauri() ? fsUrl(raw) : raw;
      case "relative": {
        const abs = joinDocPath(document.dir, raw);
        return inTauri() ? fsUrl(abs) : abs;
      }
    }
  }

  function highlight(code: string, lang: string): string {
    const out = highlightCode(code, lang);
    if (out) return out;
    return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  }

  function resolveWikilink(target: string): string | null {
    if (!wikilinkIndex) return null;
    return resolveWikilinkPure(target, wikilinkIndex, document.dir);
  }

  // Counter bumped when Shiki finishes loading languages, to force the
  // derived html to recompute even though `highlight` reads a hidden global.
  let renderEpoch = $state(0);

  // `$derived.by` tracks reads inside the function — so document/flavour/
  // wikilinkIndex/renderEpoch changes all trigger a recompute.
  let html = $derived.by(() => {
    void renderEpoch;
    return render(document.source, {
      flavour,
      docDir: document.dir,
      resolveImageSrc,
      highlight,
      resolveWikilink: wikilinkIndex ? resolveWikilink : undefined,
    });
  });

  /** Click delegation, scoped to the prose container. */
  function onContainerClick(e: Event) {
    const target = e.target as HTMLElement | null;
    const a = target?.closest("a.wikilink") as HTMLAnchorElement | null;
    if (!a) return;
    const path = a.getAttribute("data-wikilink-target");
    if (!path) return;
    e.preventDefault();
    onWikilink?.(path);
  }

  onMount(() => {
    container?.addEventListener("click", onContainerClick);
    return () => container?.removeEventListener("click", onContainerClick);
  });

  // After every render-cycle settles, run the post-render passes (Mermaid,
  // Shiki upgrade, image fallbacks). `theme` is read here so a Mocha↔Latte
  // switch re-renders existing Mermaid diagrams (see mermaid-runtime).
  $effect(() => {
    // Track dependencies explicitly so the effect re-fires on theme changes.
    void html;
    void theme;
    void runPostRender(theme);
  });

  async function runPostRender(t: ThemeName) {
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

  /**
   * Fallback chain when an `<img>` fails to load:
   *   1. If the original src was remote AND we have a doc directory, try a
   *      file with the same basename inside the doc dir. Useful for vaults
   *      that keep an offline copy alongside the markdown.
   *   2. Otherwise (or after step 1 also fails) replace the `<img>` with a
   *      placeholder badge so the failure is visible.
   */
  function onImageError(
    img: HTMLImageElement,
    raw: string,
    docDir: string,
    kind: ReturnType<typeof classifySrc>,
  ) {
    if (img.dataset.fallbackStage === "sibling") {
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
    const plain = root.querySelectorAll<HTMLPreElement>("pre.shiki > code");
    if (plain.length === 0) return;
    if (getHighlighter() === null) await initHighlighter();
    const requestedLangs = new Set<string>();
    root.querySelectorAll<HTMLElement>("[class*='language-']").forEach((el) => {
      const m = el.className.match(/language-([\w+-]+)/);
      if (m) requestedLangs.add(m[1]);
    });
    await Promise.all([...requestedLangs].map(ensureLanguage));
    // Invalidate the derived `html`. The Shiki highlighter is a hidden
    // global, so bumping a tracked counter is the cleanest way to refresh.
    renderEpoch++;
  }
</script>

<div class="prose" bind:this={container}>
  {@html html}
</div>
