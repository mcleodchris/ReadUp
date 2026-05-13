/**
 * Pure helpers for resolving image src values inside markdown documents.
 *
 * The Viewer wires the actual `<img>` `onerror` fallback at runtime; this module
 * provides the deterministic, testable URL-classification and joining logic.
 */

export type ImageKind = "remote" | "absolute" | "relative" | "data";

export function classifySrc(src: string): ImageKind {
  if (/^data:/i.test(src)) return "data";
  if (/^https?:\/\//i.test(src)) return "remote";
  if (src.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(src)) return "absolute";
  return "relative";
}

/** Join a docDir and a relative src into an absolute filesystem path. */
export function joinDocPath(docDir: string, relative: string): string {
  if (docDir === "" || docDir === ".") return relative;
  const dir = docDir.replace(/[/\\]+$/, "");
  const rel = relative.replace(/^[/\\]+/, "");
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return `${dir}${sep}${rel}`;
}

export function siblingPath(docDir: string, src: string): string {
  const basename = src.split(/[/\\?#]/).filter(Boolean).pop() ?? src;
  return joinDocPath(docDir, basename);
}
