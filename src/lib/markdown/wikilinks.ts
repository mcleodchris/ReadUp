import type { DirNode, TreeNode } from "../files/tree";
import { isMarkdownFile } from "../files/entry";

export interface ParsedWikilink {
  /** Raw target text — may contain `/` (relative path) or include `.md`. */
  target: string;
  /** Optional alias (display text). When absent the renderer shows `target`. */
  alias?: string;
}

/**
 * Parse the content between `[[` and `]]`.
 * Returns null when the content is empty or contains a newline.
 *
 * Examples:
 *   "foo"             → { target: "foo" }
 *   "foo|bar"         → { target: "foo", alias: "bar" }
 *   "subdir/foo"      → { target: "subdir/foo" }
 *   "  spaced  "      → { target: "spaced" }
 *   ""                → null
 *   "foo\nbar"        → null
 */
export function parseWikilink(content: string): ParsedWikilink | null {
  if (!content || content.includes("\n")) return null;
  const pipe = content.indexOf("|");
  const target = (pipe < 0 ? content : content.slice(0, pipe)).trim();
  if (!target) return null;
  if (pipe < 0) return { target };
  const alias = content.slice(pipe + 1).trim();
  return alias ? { target, alias } : { target };
}

export interface WikilinkIndex {
  /** Lowercased basename-without-extension → list of absolute paths. */
  byStem: Map<string, string[]>;
  /** Lowercased relative path (with and without extension) → absolute path. */
  byRelative: Map<string, string>;
  /** Absolute path of the index root. */
  rootPath: string;
}

/**
 * Build a wikilink resolution index from a directory tree.
 *
 * Only markdown files are indexed. Stems are case-folded so `[[Foo]]` resolves
 * to `foo.md`. Relative paths are indexed both with and without the extension
 * to keep `[[subdir/foo]]` and `[[subdir/foo.md]]` interchangeable.
 */
export function buildWikilinkIndex(tree: DirNode): WikilinkIndex {
  const byStem = new Map<string, string[]>();
  const byRelative = new Map<string, string>();
  const rootPath = tree.path;
  const rootPathNorm = normSlashes(rootPath);

  walk(tree, (node) => {
    if (node.kind !== "file") return;
    if (!isMarkdownFile(node.name)) return;

    const stem = stripExt(node.name).toLowerCase();
    const list = byStem.get(stem);
    if (list) list.push(node.path);
    else byStem.set(stem, [node.path]);

    const abs = normSlashes(node.path);
    if (abs.startsWith(rootPathNorm)) {
      const rel = abs.slice(rootPathNorm.length).replace(/^\/+/, "");
      byRelative.set(rel.toLowerCase(), node.path);
      const noExt = stripExt(rel);
      if (noExt !== rel) byRelative.set(noExt.toLowerCase(), node.path);
    }
  });

  // Pre-sort candidate lists so `resolveWikilink` doesn't sort on every call.
  // Deterministic order also gives stable proximity tie-breaks.
  for (const list of byStem.values()) {
    list.sort();
  }

  return { byStem, byRelative, rootPath };
}

/**
 * Resolve a wikilink target against an index.
 *
 * Resolution order:
 *   1. Exact relative-path hit (with or without `.md`).
 *   2. Unique basename hit anywhere in the tree.
 *   3. Ambiguous basename → the candidate whose directory is closest to
 *      `fromDir` (deepest common prefix), tie-broken alphabetically.
 *
 * Returns null when no candidate is found.
 */
export function resolveWikilink(
  target: string,
  index: WikilinkIndex,
  fromDir?: string,
): string | null {
  const t = target.trim();
  if (!t) return null;

  // Relative-path lookup only applies when the user wrote a path-shaped
  // target (contains a slash). Bare basenames must go through the stem
  // index so that proximity to `fromDir` can break ties between duplicates.
  if (/[\\/]/.test(t)) {
    const direct = index.byRelative.get(normSlashes(t).toLowerCase());
    if (direct) return direct;
  }

  const basenameStem = stripExt(basename(t)).toLowerCase();
  const candidates = index.byStem.get(basenameStem);
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  if (fromDir) {
    // Candidates are pre-sorted in `buildWikilinkIndex` so iteration order is
    // already alphabetical — a single linear pass picks the closest match.
    const fromNorm = normSlashes(fromDir);
    let best = candidates[0];
    let bestScore = -1;
    for (const c of candidates) {
      const score = commonPrefixDepth(fromNorm, normSlashes(dirname(c)));
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    return best;
  }
  return candidates[0];
}

// ---- helpers --------------------------------------------------------------

function walk(node: TreeNode, visit: (n: TreeNode) => void): void {
  visit(node);
  if (node.kind === "dir") for (const child of node.children) walk(child, visit);
}

function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  if (i <= 0) return name;
  const slash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  return i > slash ? name.slice(0, i) : name;
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function dirname(p: string): string {
  const m = p.match(/^(.*)[\\/][^\\/]+$/);
  return m ? m[1] : "";
}

function normSlashes(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

function commonPrefixDepth(a: string, b: string): number {
  const ap = a.split("/").filter(Boolean);
  const bp = b.split("/").filter(Boolean);
  let i = 0;
  while (i < ap.length && i < bp.length && ap[i] === bp[i]) i++;
  return i;
}
