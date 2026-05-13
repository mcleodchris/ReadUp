import { writable } from "svelte/store";
import type { DirNode } from "./files/tree";
import type { Flavour } from "./markdown/flavours";
import { DEFAULT_FLAVOUR } from "./markdown/flavours";
import type { WikilinkIndex } from "./markdown/wikilinks";

export type ViewMode = "rendered" | "source";
export type ThemeName = "latte" | "mocha";

export interface Document {
  /** Absolute path to the document file. */
  path: string;
  /** Absolute path of the document's directory (for relative-image resolution). */
  dir: string;
  /** Markdown source. */
  source: string;
}

export interface AppState {
  /** Open file or open folder root. Null when nothing is loaded yet. */
  root: { kind: "file"; path: string } | { kind: "folder"; path: string } | null;
  /** Pruned tree, when a folder is open. */
  tree: DirNode | null;
  /** Wikilink resolution index, built when a folder is opened. */
  wikilinkIndex: WikilinkIndex | null;
  /** Currently displayed document. */
  current: Document | null;
  /** Toolbar selections. */
  flavour: Flavour;
  view: ViewMode;
  theme: ThemeName;
  /** Most recent error message to surface in the UI, if any. */
  error: string | null;
}

const initial: AppState = {
  root: null,
  tree: null,
  wikilinkIndex: null,
  current: null,
  flavour: DEFAULT_FLAVOUR,
  view: "rendered",
  theme: initialTheme(),
  error: null,
};

function initialTheme(): ThemeName {
  if (typeof window === "undefined") return "mocha";
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "latte" : "mocha";
}

export const state = writable<AppState>(initial);
