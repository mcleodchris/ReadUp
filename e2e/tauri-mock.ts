/**
 * Tauri IPC mock injected into the page before any app code runs.
 *
 * This is what makes the desktop app's frontend testable in a plain browser:
 * we satisfy the contract that `@tauri-apps/api/core` and the dialog plugin
 * speak, routing IPC calls to in-memory fixtures.
 */

export interface MockFile {
  name: string;
  /** Markdown source. */
  content: string;
}

export interface MockDir {
  name: string;
  /** Absolute path the app should see. */
  path: string;
  files: MockFile[];
  dirs?: MockDir[];
}

export interface MockOptions {
  /** Folder roots the mock can open. Keyed by absolute path. */
  folders?: Record<string, MockDir>;
  /** Individual files the mock can open via the file picker. */
  files?: Record<string, MockFile>;
  /** What the file-picker dialog returns. Set with `setPickerResponse`. */
  pickerFile?: string | null;
  /** What the folder-picker dialog returns. */
  pickerFolder?: string | null;
  /** Optional CLI startup target. */
  cliOpen?: { kind: "file" | "folder"; path: string } | null;
}

/** Serialise the mock setup and inject it. Returns the code to run in the
 *  page's init script (see playwright `addInitScript`). */
export function injectScript(opts: MockOptions): string {
  return `
(() => {
  const opts = ${JSON.stringify(opts ?? {})};
  const folders = opts.folders ?? {};
  const files = opts.files ?? {};

  function readFile(path) {
    // Check individual files first.
    if (files[path]) return { path, content: files[path].content, mtime: 0 };
    // Then look inside any folder's flat file list.
    for (const root of Object.values(folders)) {
      const found = findFile(root, path);
      if (found) return { path, content: found.content, mtime: 0 };
    }
    throw new Error("read_file: not found: " + path);
  }

  function findFile(dir, path) {
    for (const f of dir.files ?? []) {
      if (joinPath(dir.path, f.name) === path) return f;
    }
    for (const sub of dir.dirs ?? []) {
      const f = findFile(sub, path);
      if (f) return f;
    }
    return null;
  }

  function joinPath(dir, name) {
    return dir.replace(/\\/$/, "") + "/" + name;
  }

  function toTreeNode(dir) {
    const children = [];
    for (const sub of dir.dirs ?? []) children.push(toTreeNode(sub));
    for (const f of dir.files ?? []) {
      children.push({
        kind: "file",
        name: f.name,
        path: joinPath(dir.path, f.name),
      });
    }
    // sort: dirs first, each by name
    children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    return { kind: "dir", name: dir.name, path: dir.path, children };
  }

  function listDir(path) {
    const root = folders[path];
    if (!root) throw new Error("list_dir: not found: " + path);
    return toTreeNode(root);
  }

  function resolveEntry(folder) {
    const root = folders[folder];
    if (!root) return null;
    const md = (root.files ?? []).filter((f) => /\\.(md|markdown)$/i.test(f.name));
    if (md.length === 0) return null;
    const idx = md.find((f) => f.name.toLowerCase().replace(/\\.[^.]+$/, "") === "index");
    if (idx) return joinPath(root.path, idx.name);
    const rd = md.find((f) => f.name.toLowerCase().replace(/\\.[^.]+$/, "") === "readme");
    if (rd) return joinPath(root.path, rd.name);
    md.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return joinPath(root.path, md[0].name);
  }

  async function dialogOpen(args) {
    // The dialog plugin sends { options: {...} }; older paths used flat args.
    const options = args?.options ?? args ?? {};
    if (options.directory) return opts.pickerFolder ?? null;
    return opts.pickerFile ?? null;
  }

  function openFolder(args) {
    const path = args.path;
    const tree = folders[path] ? toTreeNode(folders[path]) : null;
    const entry = resolveEntry(path);
    return { root: path, tree, entry };
  }

  function openFile(args) {
    return readFile(args.path);
  }

  const handlers = {
    open_folder: openFolder,
    open_file: openFile,
    read_file: (args) => readFile(args.path),
    list_dir: (args) => listDir(args.path),
    resolve_entry: (args) => resolveEntry(args.folder),
    cli_open: () => opts.cliOpen ?? null,
    "plugin:dialog|open": (args) => dialogOpen(args),
  };

  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    invoke: async (cmd, args) => {
      const h = handlers[cmd];
      if (!h) throw new Error("Unmocked Tauri command: " + cmd);
      return h(args || {});
    },
    convertFileSrc: (path, _proto) => "mock-fs://" + encodeURIComponent(path),
    transformCallback: (cb, once) => {
      const id = Math.floor(Math.random() * 1e9);
      window["__TAURI_CB_" + id] = (...a) => {
        cb?.(...a);
        if (once) delete window["__TAURI_CB_" + id];
      };
      return id;
    },
  };
  window.__readup_mock = { opts, handlers };
})();
`;
}
