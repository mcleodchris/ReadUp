import type MarkdownIt from "markdown-it";

/**
 * markdown-it plugin that replaces ```mermaid fenced blocks with a placeholder
 * div for client-side rendering by Mermaid.
 *
 * The diagram source is HTML-escaped and dropped into the div's text node, so
 * Mermaid can read it from `textContent` after the page is in the DOM.
 */
export function mermaidPlugin(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence;
  if (!defaultFence) throw new Error("markdown-it default fence rule missing");

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token.info.trim().toLowerCase() === "mermaid") {
      const escaped = md.utils.escapeHtml(token.content);
      return `<div class="mermaid" data-mermaid>${escaped}</div>\n`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };
}
