import { createHighlighter, type Highlighter, type BundledLanguage } from "shiki";

/**
 * Languages preloaded by Shiki. We bias toward common readme content.
 * Extra languages are loaded on demand via `loadLanguage`.
 */
const DEFAULT_LANGS: BundledLanguage[] = [
  "bash",
  "c",
  "cpp",
  "css",
  "diff",
  "go",
  "html",
  "java",
  "javascript",
  "json",
  "markdown",
  "python",
  "rust",
  "shell",
  "sql",
  "svelte",
  "toml",
  "tsx",
  "typescript",
  "yaml",
];

let highlighter: Highlighter | null = null;
let loading: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>(DEFAULT_LANGS);

export async function initHighlighter(): Promise<Highlighter> {
  if (highlighter) return highlighter;
  if (loading) return loading;
  loading = createHighlighter({
    themes: ["catppuccin-latte", "catppuccin-mocha"],
    langs: DEFAULT_LANGS,
  }).then((h) => {
    highlighter = h;
    return h;
  });
  return loading;
}

export function getHighlighter(): Highlighter | null {
  return highlighter;
}

/**
 * Synchronously highlight a code block. Returns null if Shiki hasn't loaded
 * yet, in which case the caller should fall back to plain markup.
 *
 * Languages outside `DEFAULT_LANGS` produce unstyled output until
 * `ensureLanguage` is awaited.
 */
export function highlightCode(code: string, lang: string): string | null {
  if (!highlighter) return null;
  const normalized = (lang || "").trim().toLowerCase();
  const finalLang = normalized && loadedLangs.has(normalized) ? normalized : "text";
  return highlighter.codeToHtml(code, {
    lang: finalLang,
    themes: { light: "catppuccin-latte", dark: "catppuccin-mocha" },
    defaultColor: false,
  });
}

export async function ensureLanguage(lang: string): Promise<void> {
  if (!lang) return;
  const normalized = lang.toLowerCase();
  if (loadedLangs.has(normalized)) return;
  const h = await initHighlighter();
  try {
    await h.loadLanguage(normalized as BundledLanguage);
    loadedLangs.add(normalized);
  } catch {
    // Unknown language — silently fall back to plain text.
  }
}
