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

/** True when running inside a Tauri webview. Lets us short-circuit in unit
 *  tests / regular browsers where the IPC bridge is not present. */
export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function readFile(path: string): Promise<FileRead> {
  return invoke<FileRead>("read_file", { path });
}

export async function listDir(path: string): Promise<DirNode> {
  return invoke<DirNode>("list_dir", { path });
}

export async function resolveEntryPath(folder: string): Promise<string | null> {
  return invoke<string | null>("resolve_entry", { folder });
}

export async function pickFile(): Promise<string | null> {
  const result = await openDialog({
    multiple: false,
    directory: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  if (typeof result === "string") return result;
  return null;
}

export async function pickFolder(): Promise<string | null> {
  const result = await openDialog({ multiple: false, directory: true });
  if (typeof result === "string") return result;
  return null;
}

export async function readInitTarget(): Promise<InitTarget | null> {
  return invoke<InitTarget | null>("cli_open");
}

/** Convert an absolute filesystem path into a URL the webview can fetch via
 *  Tauri's asset protocol. */
export function fsUrl(path: string): string {
  return convertFileSrc(path);
}
