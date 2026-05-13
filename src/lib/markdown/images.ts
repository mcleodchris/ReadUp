/**
 * Pure helpers for resolving image src values inside markdown documents.
 *
 * The Viewer wires the actual `<img>` `onerror` fallback at runtime; this module
 * provides the deterministic, testable URL-classification and joining logic.
 */

export type ImageKind =
  | "remote"
  | "protocol-relative"
  | "absolute"
  | "relative"
  | "data"
  | "other";

/**
 * Match a URL with a scheme — `scheme:` per RFC 3986: alpha, then any of
 * alpha / digit / `+` / `-` / `.`. Used to detect "this has a scheme we don't
 * recognise" so we don't accidentally path-join a `mailto:` / `javascript:`
 * into the document directory.
 */
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+\-.]*:/;

/** POSIX-style absolute path: starts with `/` but not `//` (which is a
 *  protocol-relative URL). */
const POSIX_ABSOLUTE_RE = /^\/(?!\/)/;

/** Windows drive-letter absolute path: `C:\...` or `C:/...`. */
const WIN_ABSOLUTE_RE = /^[a-zA-Z]:[\\/]/;

export function classifySrc(src: string): ImageKind {
  const s = src.trim();
  if (!s) return "other";

  if (/^data:/i.test(s)) return "data";
  if (/^https?:\/\//i.test(s)) return "remote";
  // Protocol-relative URLs (//host/path) inherit the page's protocol; treat
  // them as their own kind so callers can decide whether to forbid or proxy.
  if (s.startsWith("//")) return "protocol-relative";
  if (POSIX_ABSOLUTE_RE.test(s)) return "absolute";
  if (WIN_ABSOLUTE_RE.test(s)) return "absolute";
  // Any other scheme (mailto:, javascript:, file:, ftp:, ...) is *not*
  // something we can path-join; surface it so callers don't combine it with
  // the document directory.
  if (SCHEME_RE.test(s)) return "other";
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
