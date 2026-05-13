import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import { parseWikilink } from "./wikilinks";

export interface WikilinkPluginOptions {
  /**
   * Resolve a wikilink target to an absolute filesystem path, or null if no
   * matching document exists. The Viewer uses this null-vs-string return to
   * decide between a working link and a "broken" placeholder span.
   */
  resolve: (target: string) => string | null;
}

/**
 * Resolved wikilinks render with `href="#"`; navigation happens via a click
 * handler that reads `data-wikilink-target`. Using a fragment-only href keeps
 * middle-click / "open in new tab" from trying to navigate to a custom scheme
 * (which the CSP would block anyway), and keeps the link keyboard-focusable.
 */
const WIKILINK_HREF = "#";

/** markdown-it plugin: `[[target]]` and `[[target|alias]]` → anchor or span. */
export function wikilinksPlugin(md: MarkdownIt, opts: WikilinkPluginOptions): void {
  md.inline.ruler.before("emphasis", "wikilink", (state, silent) => parseRule(state, silent, opts));
}

function parseRule(state: StateInline, silent: boolean, opts: WikilinkPluginOptions): boolean {
  const start = state.pos;
  const src = state.src;
  if (src.charCodeAt(start) !== 0x5b /* [ */) return false;
  if (src.charCodeAt(start + 1) !== 0x5b /* [ */) return false;

  // Scan to the matching `]]`. Bail out on `\n` (block-level boundary).
  let i = start + 2;
  const max = state.posMax;
  while (i < max) {
    const c = src.charCodeAt(i);
    if (c === 0x0a /* \n */) return false;
    if (c === 0x5d /* ] */ && src.charCodeAt(i + 1) === 0x5d /* ] */) break;
    i++;
  }
  if (i >= max) return false;

  const content = src.slice(start + 2, i);
  const parsed = parseWikilink(content);
  if (!parsed) return false;

  if (!silent) {
    const resolved = opts.resolve(parsed.target);
    const display = parsed.alias ?? parsed.target;

    const open = state.push("wikilink_open", resolved ? "a" : "span", 1);
    open.markup = "[[";
    if (resolved) {
      open.attrSet("href", WIKILINK_HREF);
      open.attrSet("data-wikilink-target", resolved);
      open.attrSet("class", "wikilink");
    } else {
      open.attrSet("class", "wikilink wikilink-broken");
      open.attrSet("title", `No document for [[${parsed.target}]]`);
      open.attrSet("data-wikilink-missing", parsed.target);
    }

    const text = state.push("text", "", 0);
    text.content = display;

    state.push("wikilink_close", resolved ? "a" : "span", -1).markup = "]]";
  }

  state.pos = i + 2;
  return true;
}
