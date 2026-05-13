import { describe, it, expect } from "vitest";
import MarkdownIt from "markdown-it";
import { wikilinksPlugin } from "./wikilinks-plugin";

function md(resolve: (target: string) => string | null) {
  return new MarkdownIt().use(wikilinksPlugin, { resolve });
}

describe("wikilinksPlugin", () => {
  it("renders resolved wikilinks as anchors", () => {
    const html = md((t) => (t === "foo" ? "/wiki/foo.md" : null)).render("see [[foo]]");
    expect(html).toContain('class="wikilink"');
    expect(html).toContain('href="#"');
    expect(html).toContain('data-wikilink-target="/wiki/foo.md"');
    expect(html).toMatch(/>foo<\/a>/);
  });

  it("uses the alias for display text when present", () => {
    const html = md(() => "/wiki/foo.md").render("see [[foo|the Foo doc]]");
    expect(html).toMatch(/>the Foo doc<\/a>/);
    expect(html).toContain('data-wikilink-target="/wiki/foo.md"');
  });

  it("renders broken wikilinks as a span with broken class", () => {
    const html = md(() => null).render("see [[missing]]");
    expect(html).toContain('class="wikilink wikilink-broken"');
    expect(html).toContain('data-wikilink-missing="missing"');
    expect(html).toMatch(/>missing<\/span>/);
  });

  it("uses the alias for broken links too", () => {
    const html = md(() => null).render("see [[missing|here]]");
    expect(html).toMatch(/>here<\/span>/);
    expect(html).toContain('data-wikilink-missing="missing"');
  });

  it("ignores wikilinks inside inline code", () => {
    const html = md(() => "/x").render("text `not [[foo]] here` more");
    expect(html).not.toContain("wikilink");
    expect(html).toContain("[[foo]]");
  });

  it("ignores wikilinks inside fenced code blocks", () => {
    const html = md(() => "/x").render("```\n[[foo]]\n```");
    expect(html).not.toContain("wikilink");
    expect(html).toContain("[[foo]]");
  });

  it("does not consume an unmatched `[[`", () => {
    const html = md(() => null).render("[[ no close here");
    expect(html).not.toContain("wikilink");
  });

  it("does not span line breaks", () => {
    const html = md(() => null).render("[[foo\nbar]]");
    expect(html).not.toContain("wikilink");
  });

  it("escapes attribute values", () => {
    const html = md((t) => `/path/${t}`).render('[[a"b]]');
    // The data-wikilink-target attribute must be safely encoded.
    expect(html).toContain('data-wikilink-target="/path/a&quot;b"');
  });

  it("renders many wikilinks in one paragraph", () => {
    const r = (t: string) => `/wiki/${t}.md`;
    const html = md(r).render("see [[a]] and [[b]] and [[c|see c]]");
    const matches = html.match(/class="wikilink"/g) ?? [];
    expect(matches.length).toBe(3);
  });
});
