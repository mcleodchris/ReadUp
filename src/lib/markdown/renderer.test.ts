import { describe, it, expect } from "vitest";
import { render } from "./renderer";

describe("renderer — CommonMark", () => {
  it("renders headings and paragraphs", () => {
    const html = render("# Hello\n\nWorld", { flavour: "commonmark" });
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<p>World</p>");
  });

  it("does not render task lists", () => {
    const html = render("- [x] done\n- [ ] todo", { flavour: "commonmark" });
    expect(html).not.toContain('type="checkbox"');
  });

  it("does not autolink bare URLs", () => {
    const html = render("see https://example.com here", { flavour: "commonmark" });
    expect(html).not.toContain('href="https://example.com"');
  });

  it("does not render footnotes", () => {
    const html = render("foo[^1]\n\n[^1]: bar", { flavour: "commonmark" });
    expect(html).not.toContain("footnote");
  });
});

describe("renderer — GFM", () => {
  it("renders tables", () => {
    const html = render(
      "| A | B |\n|---|---|\n| 1 | 2 |",
      { flavour: "gfm" }
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
  });

  it("renders task lists", () => {
    const html = render("- [x] done\n- [ ] todo", { flavour: "gfm" });
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
  });

  it("autolinks bare URLs", () => {
    const html = render("see https://example.com here", { flavour: "gfm" });
    expect(html).toContain('href="https://example.com"');
  });

  it("renders strikethrough", () => {
    const html = render("~~gone~~", { flavour: "gfm" });
    expect(html).toContain("<s>gone</s>");
  });

  it("does not render footnotes (those are Extended-only)", () => {
    const html = render("foo[^1]\n\n[^1]: bar", { flavour: "gfm" });
    expect(html).not.toContain("footnote");
  });
});

describe("renderer — Extended", () => {
  it("renders footnotes", () => {
    const html = render("foo[^1]\n\n[^1]: bar", { flavour: "extended" });
    expect(html.toLowerCase()).toContain("footnote");
  });

  it("renders definition lists", () => {
    const html = render("Term\n: Definition\n", { flavour: "extended" });
    expect(html).toContain("<dl>");
    expect(html).toContain("<dt>Term</dt>");
    expect(html).toContain("<dd>Definition</dd>");
  });

  it("keeps GFM features", () => {
    const html = render("- [x] done", { flavour: "extended" });
    expect(html).toContain('type="checkbox"');
  });
});

describe("renderer — mermaid", () => {
  it("rewrites mermaid fences into mermaid divs", () => {
    const html = render("```mermaid\ngraph TD; A-->B\n```", { flavour: "gfm" });
    expect(html).toContain('class="mermaid"');
    expect(html).toContain("data-mermaid");
    expect(html).toContain("graph TD; A--&gt;B");
  });

  it("does not touch non-mermaid fences", () => {
    const html = render("```js\nconsole.log(1)\n```", { flavour: "gfm" });
    expect(html).not.toContain('class="mermaid"');
    expect(html).toContain("language-js");
  });
});

describe("renderer — image rewriting", () => {
  it("rewrites relative image src via the resolver", () => {
    const html = render("![alt](pic.png)", {
      flavour: "gfm",
      docDir: "/docs",
      resolveImageSrc: (raw) => (raw.startsWith("http") ? raw : `asset:/docs/${raw}`),
    });
    expect(html).toContain('src="asset:/docs/pic.png"');
    expect(html).toContain('data-raw-src="pic.png"');
    expect(html).toContain('data-doc-dir="/docs"');
  });

  it("passes remote URLs to the resolver as-is", () => {
    const html = render("![](https://example.com/x.png)", {
      flavour: "gfm",
      resolveImageSrc: (raw) => raw,
    });
    expect(html).toContain('src="https://example.com/x.png"');
  });
});
