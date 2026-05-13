import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import deflist from "markdown-it-deflist";
import taskLists from "markdown-it-task-lists";
import type { Flavour } from "./flavours";
import { mermaidPlugin } from "./mermaid-plugin";
import { wikilinksPlugin } from "./wikilinks-plugin";

export interface RendererOptions {
  flavour: Flavour;
  /**
   * Absolute directory of the document being rendered, used to rewrite
   * relative image `src` values. May be empty if rendering a standalone
   * string with no on-disk context.
   */
  docDir?: string;
  /**
   * Optional override for `<img>` rendering. Receives the raw src and should
   * return the final src to use. Defaults to a passthrough of the original.
   */
  resolveImageSrc?: (rawSrc: string) => string;
  /**
   * Async syntax highlighter. If provided, fences run through it; otherwise
   * a plain `<pre><code>` is emitted and a later pass can upgrade it.
   */
  highlight?: (code: string, lang: string) => string;
  /**
   * Resolve `[[wikilinks]]` to an absolute filesystem path, or null when the
   * target doesn't exist. When omitted, wikilink syntax is left intact.
   */
  resolveWikilink?: (target: string) => string | null;
}

export function createRenderer(opts: RendererOptions): MarkdownIt {
  const md = new MarkdownIt({
    html: opts.flavour !== "commonmark",
    linkify: opts.flavour !== "commonmark",
    breaks: false,
    typographer: false,
    highlight: opts.highlight,
  });

  if (opts.flavour === "gfm" || opts.flavour === "extended") {
    md.use(taskLists, { enabled: true, lineNumber: false });
    // markdown-it has tables and strikethrough built in (CommonMark super-set);
    // enable autolink and ensure tables stay on (they're on by default).
    md.enable(["table", "strikethrough"]);
  } else {
    // CommonMark: disable GFM-only extensions that markdown-it ships with.
    md.disable(["strikethrough"]);
  }

  if (opts.flavour === "extended") {
    md.use(footnote);
    md.use(deflist);
  }

  md.use(mermaidPlugin);
  if (opts.resolveWikilink) {
    md.use(wikilinksPlugin, { resolve: opts.resolveWikilink });
  }
  installImageRewriter(md, opts);

  return md;
}

function installImageRewriter(md: MarkdownIt, opts: RendererOptions): void {
  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const srcIndex = token.attrIndex("src");
    if (srcIndex >= 0 && token.attrs) {
      const raw = token.attrs[srcIndex][1];
      const resolved = opts.resolveImageSrc ? opts.resolveImageSrc(raw) : raw;
      token.attrs[srcIndex][1] = resolved;
      // Preserve the raw src and doc directory so the runtime can implement fallback.
      token.attrSet("data-raw-src", raw);
      if (opts.docDir) token.attrSet("data-doc-dir", opts.docDir);
      token.attrSet("loading", "lazy");
    }
    return defaultImage
      ? defaultImage(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };
}

/** Render markdown to HTML using the supplied options. */
export function render(source: string, opts: RendererOptions): string {
  return createRenderer(opts).render(source);
}
