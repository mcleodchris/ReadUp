/**
 * Adversarial markdown — regression coverage for the security combination
 * that the code review flagged. These cases all *must* be neutralised before
 * the HTML reaches the DOM.
 */
import { describe, it, expect } from "vitest";
import { render } from "./renderer";
import { _resetRendererCache } from "./renderer";

// Each test independently configures the renderer; reset the singleton cache
// so options don't leak between tests.
beforeEach(() => _resetRendererCache());

describe("renderer XSS — html flag off (default)", () => {
  it("entity-encodes raw <script> tags in all flavours", () => {
    const src = `pre <script>alert('xss')</script> post`;
    for (const flavour of ["commonmark", "gfm", "extended"] as const) {
      const html = render(src, { flavour });
      expect(html, flavour).not.toMatch(/<script/i);
      expect(html, flavour).toContain("&lt;script&gt;");
    }
  });

  it("entity-encodes onerror-bearing tags", () => {
    const src = `<img src=x onerror="alert(1)">`;
    for (const flavour of ["commonmark", "gfm", "extended"] as const) {
      const html = render(src, { flavour });
      expect(html, flavour).not.toMatch(/<img[^>]+onerror=/i);
      expect(html, flavour).toContain("&lt;img");
    }
  });

  it("entity-encodes iframe and object embeds", () => {
    const src = `<iframe src="javascript:alert(1)"></iframe>\n<object data="data:text/html,<script>"></object>`;
    for (const flavour of ["commonmark", "gfm", "extended"] as const) {
      const html = render(src, { flavour });
      expect(html, flavour).not.toMatch(/<iframe/i);
      expect(html, flavour).not.toMatch(/<object/i);
    }
  });

  it("entity-encodes <svg onload>", () => {
    const src = `<svg onload="alert(1)"></svg>`;
    const html = render(src, { flavour: "extended" });
    expect(html).not.toMatch(/<svg[^>]+onload=/i);
    expect(html).toContain("&lt;svg");
  });
});

describe("renderer XSS — link validation", () => {
  it("strips javascript: from anchor hrefs", () => {
    const html = render("[x](javascript:alert(1))", { flavour: "gfm" });
    expect(html).not.toMatch(/href="javascript:/i);
  });

  it("strips vbscript:, file:, about:, chrome: hrefs", () => {
    for (const scheme of ["vbscript:", "file:///etc/passwd", "about:blank", "chrome://settings"]) {
      const html = render(`[x](${scheme})`, { flavour: "gfm" });
      expect(html, scheme).not.toMatch(new RegExp(`href="${scheme.split(":")[0]}:`, "i"));
    }
  });

  it("strips data:text/html hrefs", () => {
    const html = render("[x](data:text/html,<script>alert(1)</script>)", { flavour: "gfm" });
    expect(html).not.toMatch(/href="data:text\/html/i);
  });

  it("strips data:image/svg+xml hrefs (SVG can execute JS)", () => {
    const html = render(
      "[x](data:image/svg+xml,<svg onload=alert(1) xmlns='http://www.w3.org/2000/svg'/>)",
      { flavour: "gfm" },
    );
    expect(html).not.toMatch(/href="data:image\/svg\+xml/i);
  });

  it("allows http(s) and mailto:", () => {
    expect(render("[x](https://example.com)", { flavour: "gfm" })).toContain(
      'href="https://example.com"',
    );
    expect(render("[x](http://example.com)", { flavour: "gfm" })).toContain(
      'href="http://example.com"',
    );
    expect(render("[x](mailto:foo@example.com)", { flavour: "gfm" })).toContain(
      'href="mailto:foo@example.com"',
    );
  });

  it("allows relative paths and fragment anchors", () => {
    expect(render("[x](./foo.md)", { flavour: "gfm" })).toContain('href="./foo.md"');
    expect(render("[x](#section)", { flavour: "gfm" })).toContain('href="#section"');
  });
});

describe("renderer XSS — image src", () => {
  it("strips javascript: src on images", () => {
    const html = render("![alt](javascript:alert(1))", { flavour: "gfm" });
    expect(html).not.toMatch(/src="javascript:/i);
  });

  it("strips data:text/html src on images", () => {
    const html = render("![alt](data:text/html,<script>)", { flavour: "gfm" });
    expect(html).not.toMatch(/src="data:text\/html/i);
  });

  it("allows data:image/png", () => {
    const html = render("![alt](data:image/png;base64,abc)", { flavour: "gfm" });
    expect(html).toMatch(/src="data:image\/png;base64,abc"/i);
  });
});

describe("renderer — opt-in raw HTML", () => {
  it("allows raw HTML only when allowHtml is explicitly true", () => {
    const html = render("<em>raw</em>", { flavour: "extended", allowHtml: true });
    expect(html).toContain("<em>raw</em>");
  });
});

// We use Vitest's beforeEach without an explicit import because the
// `globals: true` config in vitest.config.ts exposes it on globalThis.
declare function beforeEach(fn: () => void): void;
