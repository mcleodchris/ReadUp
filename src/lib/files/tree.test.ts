import { describe, it, expect } from "vitest";
import { pruneTree, compareNodes, flattenFiles, type DirNode } from "./tree";

const dir = (name: string, path: string, children: DirNode["children"]): DirNode => ({
  kind: "dir",
  name,
  path,
  children,
});

const file = (name: string, path: string) => ({ kind: "file" as const, name, path });

describe("pruneTree", () => {
  it("removes non-markdown files", () => {
    const tree = dir("root", "/r", [file("a.md", "/r/a.md"), file("img.png", "/r/img.png")]);
    const pruned = pruneTree(tree);
    expect(pruned!.children.map((c) => c.name)).toEqual(["a.md"]);
  });

  it("removes empty directories", () => {
    const tree = dir("root", "/r", [
      dir("assets", "/r/assets", [file("img.png", "/r/assets/img.png")]),
      file("a.md", "/r/a.md"),
    ]);
    const pruned = pruneTree(tree);
    expect(pruned!.children.map((c) => c.name)).toEqual(["a.md"]);
  });

  it("keeps nested markdown", () => {
    const tree = dir("root", "/r", [
      dir("docs", "/r/docs", [file("nested.md", "/r/docs/nested.md")]),
      file("a.md", "/r/a.md"),
    ]);
    const pruned = pruneTree(tree)!;
    expect(pruned.children.map((c) => c.name)).toEqual(["docs", "a.md"]);
  });

  it("returns null when nothing markdown remains", () => {
    const tree = dir("root", "/r", [file("a.png", "/r/a.png")]);
    expect(pruneTree(tree)).toBeNull();
  });

  it("sorts directories before files, each alphabetically", () => {
    const tree = dir("root", "/r", [
      file("zebra.md", "/r/zebra.md"),
      file("apple.md", "/r/apple.md"),
      dir("z-folder", "/r/z-folder", [file("x.md", "/r/z-folder/x.md")]),
      dir("a-folder", "/r/a-folder", [file("y.md", "/r/a-folder/y.md")]),
    ]);
    const pruned = pruneTree(tree)!;
    expect(pruned.children.map((c) => c.name)).toEqual([
      "a-folder",
      "z-folder",
      "apple.md",
      "zebra.md",
    ]);
  });
});

describe("compareNodes", () => {
  it("puts dirs before files", () => {
    expect(compareNodes(file("z.md", "/z.md"), dir("a", "/a", []))).toBeGreaterThan(0);
  });
});

describe("flattenFiles", () => {
  it("returns files in display order", () => {
    const tree = dir("root", "/r", [
      dir("docs", "/r/docs", [file("b.md", "/r/docs/b.md")]),
      file("a.md", "/r/a.md"),
    ]);
    expect(flattenFiles(pruneTree(tree)!)).toEqual(["/r/docs/b.md", "/r/a.md"]);
  });
});
