import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { DirNode } from "./files/tree";

export interface FileRead {
  content: string;
  mtime: number;
  path: string;
}

export interface InitTarget {
  kind: "file" | "folder";
  path: string;
}

export interface OpenFolderResult {
  root: string;
  tree: DirNode | null;
  entry: string | null;
}

/** Discriminated FsError mirroring the Rust enum, for richer UI feedback. */
export type FsError =
  | { kind: "io"; message: string }
  | { kind: "not-found"; path: string }
  | { kind: "permission-denied"; path: string }
  | { kind: "invalid-path"; message: string }
  | { kind: "forbidden"; path: string }
  | { kind: "too-large"; size: number; max: number };

/** True when running inside a Tauri webview. Lets us short-circuit in unit
 *  tests / regular browsers where the IPC bridge is not present. */
export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Open a folder: registers it as a sandboxed root, returns the pruned tree
 *  and the resolved entry file in one round trip. */
export async function openFolder(path: string): Promise<OpenFolderResult> {
  return invoke<OpenFolderResult>("open_folder", { path });
}

/** Open a single file: registers its directory as a sandboxed root. */
export async function openFile(path: string): Promise<FileRead> {
  return invoke<FileRead>("open_file", { path });
}

/** Read a file that's already inside a previously-opened root. */
export async function readFile(path: string): Promise<FileRead> {
  return invoke<FileRead>("read_file", { path });
}

export async function pickFile(): Promise<string | null> {
  const result = await openDialog({
    multiple: false,
    directory: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  return typeof result === "string" ? result : null;
}

export async function pickFolder(): Promise<string | null> {
  const result = await openDialog({ multiple: false, directory: true });
  return typeof result === "string" ? result : null;
}

export async function readInitTarget(): Promise<InitTarget | null> {
  return invoke<InitTarget | null>("cli_open");
}

/** Convert an absolute filesystem path into a URL the webview can fetch via
 *  Tauri's asset protocol. */
export function fsUrl(path: string): string {
  return convertFileSrc(path);
}

/** Best-effort human message from a Tauri command error. The frontend gets
 *  either a string (when the Rust command returned `Err(String)`) or a
 *  structured `FsError` JSON object. */
export function fsErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "kind" in err) {
    const e = err as FsError;
    switch (e.kind) {
      case "forbidden":
        return `Access denied: ${e.path} is outside the opened folder.`;
      case "not-found":
        return `Not found: ${e.path}`;
      case "permission-denied":
        return `Permission denied: ${e.path}`;
      case "too-large":
        return `File too large (${e.size} bytes; max ${e.max}).`;
      case "invalid-path":
        return `Invalid path: ${e.message}`;
      case "io":
        return `I/O error: ${e.message}`;
    }
  }
  return String(err);
}
