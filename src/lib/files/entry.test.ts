import { describe, it, expect } from "vitest";
import { resolveEntry, isMarkdownFile } from "./entry";

describe("isMarkdownFile", () => {
  it("matches .md and .markdown case-insensitively", () => {
    expect(isMarkdownFile("foo.md")).toBe(true);
    expect(isMarkdownFile("Foo.MD")).toBe(true);
    expect(isMarkdownFile("bar.markdown")).toBe(true);
    expect(isMarkdownFile("Bar.MARKDOWN")).toBe(true);
  });

  it("rejects non-markdown files", () => {
    expect(isMarkdownFile("foo.txt")).toBe(false);
    expect(isMarkdownFile("README")).toBe(false);
    expect(isMarkdownFile("readme.mdx")).toBe(false);
  });
});

describe("resolveEntry", () => {
  it("prefers index.md", () => {
    expect(resolveEntry(["zebra.md", "index.md", "README.md"])).toBe("index.md");
  });

  it("is case-insensitive for index", () => {
    expect(resolveEntry(["zebra.md", "Index.MD", "README.md"])).toBe("Index.MD");
  });

  it("falls back to README.md when no index", () => {
    expect(resolveEntry(["zebra.md", "README.md", "alpha.md"])).toBe("README.md");
  });

  it("is case-insensitive for README", () => {
    expect(resolveEntry(["zebra.md", "Readme.md", "alpha.md"])).toBe("Readme.md");
  });

  it("falls back to first by locale sort", () => {
    expect(resolveEntry(["zebra.md", "Banana.md", "apple.md"])).toBe("apple.md");
  });

  it("ignores non-markdown files when sorting", () => {
    expect(resolveEntry(["foo.txt", "zebra.md", "apple.md"])).toBe("apple.md");
  });

  it("returns null when there are no markdown files", () => {
    expect(resolveEntry(["foo.txt", "bar.png"])).toBeNull();
    expect(resolveEntry([])).toBeNull();
  });

  it("treats README in any markdown extension as a fallback", () => {
    expect(resolveEntry(["zebra.md", "README.markdown"])).toBe("README.markdown");
  });
});
