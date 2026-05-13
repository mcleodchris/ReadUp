import { describe, it, expect } from "vitest";
import { parseWikilink, buildWikilinkIndex, resolveWikilink } from "./wikilinks";
import type { DirNode } from "../files/tree";

describe("parseWikilink", () => {
  it("parses a plain target", () => {
    expect(parseWikilink("foo")).toEqual({ target: "foo" });
  });

  it("parses a piped alias", () => {
    expect(parseWikilink("foo|bar")).toEqual({ target: "foo", alias: "bar" });
  });

  it("trims whitespace from target and alias", () => {
    expect(parseWikilink("  foo  |  bar  ")).toEqual({ target: "foo", alias: "bar" });
  });

  it("returns target only when alias is empty after the pipe", () => {
    expect(parseWikilink("foo|")).toEqual({ target: "foo" });
    expect(parseWikilink("foo|   ")).toEqual({ target: "foo" });
  });

  it("rejects empty and whitespace-only content", () => {
    expect(parseWikilink("")).toBeNull();
    expect(parseWikilink("   ")).toBeNull();
    expect(parseWikilink("|alias")).toBeNull();
  });

  it("rejects content containing a newline", () => {
    expect(parseWikilink("foo\nbar")).toBeNull();
  });

  it("keeps slashes inside the target for nested paths", () => {
    expect(parseWikilink("subdir/foo")).toEqual({ target: "subdir/foo" });
  });
});

describe("buildWikilinkIndex + resolveWikilink", () => {
  const tree: DirNode = {
    kind: "dir",
    name: "wiki",
    path: "/wiki",
    children: [
      { kind: "file", name: "index.md", path: "/wiki/index.md" },
      { kind: "file", name: "Foo.md", path: "/wiki/Foo.md" },
      { kind: "file", name: "bar.markdown", path: "/wiki/bar.markdown" },
      { kind: "file", name: "image.png", path: "/wiki/image.png" }, // ignored
      {
        kind: "dir",
        name: "sub",
        path: "/wiki/sub",
        children: [
          { kind: "file", name: "baz.md", path: "/wiki/sub/baz.md" },
          { kind: "file", name: "Foo.md", path: "/wiki/sub/Foo.md" },
        ],
      },
    ],
  };
  const index = buildWikilinkIndex(tree);

  it("only indexes markdown files", () => {
    expect(index.byStem.has("image")).toBe(false);
  });

  it("resolves a unique stem from anywhere in the tree", () => {
    expect(resolveWikilink("baz", index)).toBe("/wiki/sub/baz.md");
    expect(resolveWikilink("bar", index)).toBe("/wiki/bar.markdown");
  });

  it("resolves case-insensitively", () => {
    expect(resolveWikilink("foo", index)).not.toBeNull();
    expect(resolveWikilink("FOO", index)).not.toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(resolveWikilink("nope", index)).toBeNull();
    expect(resolveWikilink("", index)).toBeNull();
    expect(resolveWikilink("   ", index)).toBeNull();
  });

  it("resolves a relative path with or without .md", () => {
    expect(resolveWikilink("sub/baz", index)).toBe("/wiki/sub/baz.md");
    expect(resolveWikilink("sub/baz.md", index)).toBe("/wiki/sub/baz.md");
  });

  it("ambiguous stem picks the candidate closest to fromDir", () => {
    // Two Foo.md exist; from /wiki/sub the nested one should win.
    expect(resolveWikilink("foo", index, "/wiki/sub")).toBe("/wiki/sub/Foo.md");
    expect(resolveWikilink("foo", index, "/wiki")).toBe("/wiki/Foo.md");
  });

  it("ambiguous stem with no fromDir is deterministic (alphabetical)", () => {
    // /wiki/Foo.md sorts before /wiki/sub/Foo.md.
    expect(resolveWikilink("foo", index)).toBe("/wiki/Foo.md");
  });
});
