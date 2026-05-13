import { describe, it, expect } from "vitest";
import MarkdownIt from "markdown-it";
import { mermaidPlugin } from "./mermaid-plugin";

describe("mermaidPlugin", () => {
  const md = new MarkdownIt().use(mermaidPlugin);

  it("converts mermaid fences", () => {
    const html = md.render("```mermaid\nflowchart LR\nA --> B\n```");
    expect(html).toContain('class="mermaid"');
    expect(html).toContain("data-mermaid");
    expect(html).toContain("flowchart LR");
  });

  it("escapes HTML special characters in the source", () => {
    const html = md.render("```mermaid\nA --> B & <C>\n```");
    expect(html).toContain("A --&gt; B &amp; &lt;C&gt;");
  });

  it("ignores unrelated languages", () => {
    const html = md.render("```js\nconst x = 1\n```");
    expect(html).toContain("language-js");
    expect(html).not.toContain("mermaid");
  });

  it("matches mermaid case-insensitively", () => {
    const html = md.render("```Mermaid\ngraph\n```");
    expect(html).toContain('class="mermaid"');
  });
});
