import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import deflist from "markdown-it-deflist";
import taskLists from "markdown-it-task-lists";
import type { Flavour } from "./flavours";
import { mermaidPlugin } from "./mermaid-plugin";
import { wikilinksPlugin } from "./wikilinks-plugin";

export interface RendererOptions {
  flavour: Flavour;
  /** Absolute directory of the document, used by `resolveImageSrc`. */
  docDir?: string;
  /** Rewrite `<img>` src values (e.g. relative → fs URL). */
  resolveImageSrc?: (rawSrc: string) => string;
  /** Synchronous syntax highlighter; emit `<pre><code>` fallback if absent. */
  highlight?: (code: string, lang: string) => string;
  /** Resolve a wikilink target to an absolute path, or null if missing. */
  resolveWikilink?: (target: string) => string | null;
  /** Allow raw HTML in the source. Default off — content is untrusted. */
  allowHtml?: boolean;
}

const BAD_SCHEME = /^(?:javascript|vbscript|file|data|about|chrome|chrome-extension):/i;
const GOOD_DATA = /^data:image\/(?:gif|png|jpe?g|webp);/i;

/**
 * Reject dangerous link schemes. Stricter than markdown-it's default — we
 * also block `data:image/svg+xml` because SVG can execute JS, and we block
 * `chrome:` / `chrome-extension:` / `about:` for completeness.
 */
function validateLink(url: string): boolean {
  const str = url.trim().toLowerCase();
  if (!BAD_SCHEME.test(str)) return true;
  if (str.startsWith("data:")) return GOOD_DATA.test(str);
  return false;
}

// ---------------------------------------------------------------------------
// Memoised renderer
// ---------------------------------------------------------------------------

/**
 * The set of options that determine the *shape* of the renderer (which
 * plugins are installed). Functions live in `RendererRefs` so we can swap
 * them without rebuilding the markdown-it instance.
 */
interface ShapeKey {
  flavour: Flavour;
  allowHtml: boolean;
  withImage: boolean;
  withWikilink: boolean;
  withHighlight: boolean;
}

interface RendererRefs {
  resolveImageSrc?: (raw: string) => string;
  resolveWikilink?: (target: string) => string | null;
  highlight?: (code: string, lang: string) => string;
  docDir?: string;
}

interface CachedRenderer {
  shape: ShapeKey;
  refs: RendererRefs;
  md: MarkdownIt;
}

let cache: CachedRenderer | null = null;

function shapeKey(opts: RendererOptions): ShapeKey {
  return {
    flavour: opts.flavour,
    allowHtml: opts.allowHtml === true,
    withImage: !!opts.resolveImageSrc,
    withWikilink: !!opts.resolveWikilink,
    withHighlight: !!opts.highlight,
  };
}

function sameShape(a: ShapeKey, b: ShapeKey): boolean {
  return (
    a.flavour === b.flavour &&
    a.allowHtml === b.allowHtml &&
    a.withImage === b.withImage &&
    a.withWikilink === b.withWikilink &&
    a.withHighlight === b.withHighlight
  );
}

function buildRenderer(shape: ShapeKey, refs: RendererRefs): MarkdownIt {
  const md = new MarkdownIt({
    html: shape.allowHtml,
    linkify: shape.flavour !== "commonmark",
    breaks: false,
    typographer: false,
    highlight: shape.withHighlight
      ? (code, lang) => refs.highlight!(code, lang)
      : undefined,
  });

  md.validateLink = validateLink;

  if (shape.flavour === "gfm" || shape.flavour === "extended") {
    md.use(taskLists, { enabled: true, lineNumber: false });
    md.enable(["table", "strikethrough"]);
  } else {
    md.disable(["strikethrough"]);
  }

  if (shape.flavour === "extended") {
    md.use(footnote);
    md.use(deflist);
  }

  md.use(mermaidPlugin);

  if (shape.withWikilink) {
    md.use(wikilinksPlugin, {
      resolve: (target: string) => refs.resolveWikilink!(target),
    });
  }

  if (shape.withImage) {
    installImageRewriter(md, refs);
  }

  return md;
}

function installImageRewriter(md: MarkdownIt, refs: RendererRefs): void {
  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const srcIndex = token.attrIndex("src");
    if (srcIndex >= 0 && token.attrs && refs.resolveImageSrc) {
      const raw = token.attrs[srcIndex][1];
      const resolved = refs.resolveImageSrc(raw);
      token.attrs[srcIndex][1] = resolved;
      token.attrSet("data-raw-src", raw);
      if (refs.docDir) token.attrSet("data-doc-dir", refs.docDir);
      token.attrSet("loading", "lazy");
    }
    return defaultImage
      ? defaultImage(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };
}

/**
 * Get a renderer for the given options. Re-uses the cached instance whenever
 * the *shape* matches; the resolvers are swapped via mutable refs so two
 * documents from different folders can use the same MarkdownIt object.
 *
 * For tests that mutate option shapes between calls, this stays correct
 * because `shapeKey` includes every flag that affects which plugins ran.
 */
export function createRenderer(opts: RendererOptions): MarkdownIt {
  const shape = shapeKey(opts);
  if (!cache || !sameShape(cache.shape, shape)) {
    const refs: RendererRefs = {};
    const md = buildRenderer(shape, refs);
    cache = { shape, refs, md };
  }
  cache.refs.resolveImageSrc = opts.resolveImageSrc;
  cache.refs.resolveWikilink = opts.resolveWikilink;
  cache.refs.highlight = opts.highlight;
  cache.refs.docDir = opts.docDir;
  return cache.md;
}

/** Clear the renderer cache. Test-only helper. */
export function _resetRendererCache(): void {
  cache = null;
}

/** Render markdown to HTML using the supplied options. */
export function render(source: string, opts: RendererOptions): string {
  return createRenderer(opts).render(source);
}
