import type { Mermaid } from "mermaid";

let mermaidLib: Mermaid | null = null;
let counter = 0;

async function load(): Promise<Mermaid> {
  if (mermaidLib) return mermaidLib;
  const mod = await import("mermaid");
  mermaidLib = mod.default;
  mermaidLib.initialize({ startOnLoad: false, securityLevel: "strict" });
  return mermaidLib;
}

/** Render every `.mermaid[data-mermaid]` block under `root`. Idempotent: nodes
 *  that have already rendered are skipped. */
export async function renderMermaidIn(root: HTMLElement, theme: "default" | "dark"): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(".mermaid[data-mermaid]"));
  if (nodes.length === 0) return;

  const mermaid = await load();
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme });

  for (const node of nodes) {
    node.removeAttribute("data-mermaid");
    const source = node.textContent ?? "";
    const id = `mermaid-${++counter}`;
    try {
      const { svg, bindFunctions } = await mermaid.render(id, source);
      node.innerHTML = svg;
      bindFunctions?.(node);
    } catch (err) {
      node.innerHTML = `<pre class="mermaid-error">Mermaid error: ${escape(
        (err as Error)?.message ?? String(err),
      )}</pre>`;
    }
  }
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
