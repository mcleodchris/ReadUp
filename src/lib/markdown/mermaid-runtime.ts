import type { Mermaid } from "mermaid";
import { escapeHtml } from "../util/escape";

let mermaidLib: Mermaid | null = null;
let counter = 0;

async function load(): Promise<Mermaid> {
  if (mermaidLib) return mermaidLib;
  const mod = await import("mermaid");
  mermaidLib = mod.default;
  mermaidLib.initialize({ startOnLoad: false, securityLevel: "strict" });
  return mermaidLib;
}

/**
 * Render every `.mermaid` block under `root` for the given theme.
 *
 * Idempotent: nodes already rendered for the current theme are skipped. On
 * theme switch, nodes whose `data-mermaid-rendered-theme` no longer matches
 * are re-rendered from their stashed source (`data-mermaid-source`), so
 * Mocha↔Latte transitions actually reach the SVG.
 */
export async function renderMermaidIn(
  root: HTMLElement,
  theme: "default" | "dark",
): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(".mermaid"));
  if (nodes.length === 0) return;

  const mermaid = await load();
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme });

  for (const node of nodes) {
    // First encounter: stash the raw diagram source (the plugin escaped it
    // into the node's text content). Subsequent re-renders read from this
    // attribute because the node's textContent has been replaced by SVG.
    if (!node.dataset.mermaidSource) {
      node.dataset.mermaidSource = node.textContent ?? "";
    }
    // Skip if this node is already showing the current theme.
    if (node.dataset.mermaidRenderedTheme === theme) continue;

    const source = node.dataset.mermaidSource;
    node.dataset.mermaidRenderedTheme = theme;
    // `data-mermaid` was the plugin's parse marker; it has no further use
    // after first render but keeping it costs nothing.
    const id = `mermaid-${++counter}`;
    try {
      const { svg, bindFunctions } = await mermaid.render(id, source);
      node.innerHTML = svg;
      bindFunctions?.(node);
    } catch (err) {
      node.innerHTML = `<pre class="mermaid-error">Mermaid error: ${escapeHtml(
        (err as Error)?.message ?? String(err),
      )}</pre>`;
    }
  }
}
