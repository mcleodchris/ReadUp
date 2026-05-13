import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MockFile, MockDir, MockOptions } from "./tauri-mock";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "fixtures");

function file(name: string, content: string): MockFile {
  return { name, content };
}

function load(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

export function defaultMockOptions(): MockOptions {
  const sample: MockDir = {
    name: "sample",
    path: "/fixtures/sample",
    files: [
      file("index.md", load("sample/index.md")),
      // logo.svg lives next to index.md to support the local-sibling fallback test.
    ],
    dirs: [
      {
        name: "docs",
        path: "/fixtures/sample/docs",
        files: [file("getting-started.md", load("sample/docs/getting-started.md"))],
      },
    ],
  };

  const readmeOnly: MockDir = {
    name: "readme-only",
    path: "/fixtures/readme-only",
    files: [file("README.md", load("readme-only/README.md"))],
  };

  const sortFallback: MockDir = {
    name: "sort-fallback",
    path: "/fixtures/sort-fallback",
    files: [
      file("aardvark.md", load("sort-fallback/aardvark.md")),
      file("zebra.md", load("sort-fallback/zebra.md")),
    ],
  };

  const wiki: MockDir = {
    name: "wiki",
    path: "/fixtures/wiki",
    files: [
      file("index.md", load("wiki/index.md")),
      file("other-note.md", load("wiki/other-note.md")),
    ],
    dirs: [
      {
        name: "sub",
        path: "/fixtures/wiki/sub",
        files: [file("nested.md", load("wiki/sub/nested.md"))],
      },
    ],
  };

  return {
    folders: {
      [sample.path]: sample,
      [readmeOnly.path]: readmeOnly,
      [sortFallback.path]: sortFallback,
      [wiki.path]: wiki,
    },
    files: {
      "/standalone.md": {
        name: "standalone.md",
        content: "# Standalone\n\nThis was opened as a single file.",
      },
    },
  };
}
