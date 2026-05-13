export const MARKDOWN_EXTENSIONS = [".md", ".markdown"] as const;

export function isMarkdownFile(name: string): boolean {
  const lower = name.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Resolve the entry markdown file for a folder.
 *
 * Order:
 *   1. index.md (case-insensitive)
 *   2. README.md (case-insensitive, any markdown extension)
 *   3. First markdown file by locale-sensitive name sort
 *   4. null if no markdown files
 *
 * `files` is the list of *file names* (basename, not full path) directly inside the folder.
 */
export function resolveEntry(files: readonly string[]): string | null {
  const mdFiles = files.filter(isMarkdownFile);
  if (mdFiles.length === 0) return null;

  const byLowerBaseName = new Map<string, string>();
  for (const f of mdFiles) {
    byLowerBaseName.set(stripExt(f).toLowerCase(), f);
  }

  const index = byLowerBaseName.get("index");
  if (index && isMarkdownFile(index)) return index;

  const readme = byLowerBaseName.get("readme");
  if (readme) return readme;

  return [...mdFiles].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))[0];
}

function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}
