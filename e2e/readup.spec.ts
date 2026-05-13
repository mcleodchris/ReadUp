import { test, expect, type Page } from "@playwright/test";
import { injectScript, type MockOptions } from "./tauri-mock";
import { defaultMockOptions } from "./fixtures";

/** Install the Tauri IPC mock into the page context before navigating. */
async function withMock(page: Page, overrides: Partial<MockOptions> = {}) {
  const opts = { ...defaultMockOptions(), ...overrides };
  await page.addInitScript({ content: injectScript(opts) });
}

/** Read the live store snapshot — useful for assertions that don't have a
 *  direct DOM equivalent. */
async function appState(page: Page) {
  return page.evaluate(() => {
    // The store is module-scoped, so we can't reach it directly. Surface what
    // we need via DOM/data attributes instead. Kept for parity / future hooks.
    return {
      theme: document.documentElement.dataset.theme,
      title: document.title,
    };
  });
}

test.beforeEach(async ({ page }) => {
  // Surface page console + errors in test output for fast debugging.
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      console.log(`[browser ${m.type()}] ${m.text()}`);
    }
  });
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
});

test("app boots into empty state", async ({ page }) => {
  await withMock(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ReadUp" })).toBeVisible();
  await expect(page.getByText("Open a file or folder to begin.")).toBeVisible();
  // Toolbar is always present.
  await expect(page.getByRole("button", { name: /Open File/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Open Folder/ })).toBeVisible();
  // Theme attribute is set on <html>.
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(theme === "latte" || theme === "mocha").toBe(true);
});

test("opens a folder via the picker, lands on index.md", async ({ page }) => {
  await withMock(page, { pickerFolder: "/fixtures/sample" });
  await page.goto("/");

  await page.getByRole("button", { name: /Open Folder/ }).click();

  // Sidebar appears with the root name + nested doc.
  await expect(page.getByText("sample", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "docs" })).toBeVisible();
  await expect(page.getByRole("button", { name: "index.md" })).toBeVisible();

  // The viewer renders the index document.
  await expect(page.getByRole("heading", { name: "ReadUp — Sample Document" })).toBeVisible();
});

test("folder with README only resolves README.md", async ({ page }) => {
  await withMock(page, { pickerFolder: "/fixtures/readme-only" });
  await page.goto("/");
  await page.getByRole("button", { name: /Open Folder/ }).click();
  await expect(page.getByRole("heading", { name: "README-only fixture" })).toBeVisible();
});

test("folder with no index/README resolves first-by-name", async ({ page }) => {
  await withMock(page, { pickerFolder: "/fixtures/sort-fallback" });
  await page.goto("/");
  await page.getByRole("button", { name: /Open Folder/ }).click();
  await expect(page.getByRole("heading", { name: "Aardvark" })).toBeVisible();
});

test("clicking a sidebar entry switches files", async ({ page }) => {
  await withMock(page, { pickerFolder: "/fixtures/sample" });
  await page.goto("/");
  await page.getByRole("button", { name: /Open Folder/ }).click();
  await expect(page.getByRole("heading", { name: "ReadUp — Sample Document" })).toBeVisible();

  // Folders default to expanded, so the nested doc is already in the tree.
  await page.getByRole("button", { name: "getting-started.md" }).click();
  await expect(page.getByRole("heading", { name: "Getting started" })).toBeVisible();
});

test("renders mermaid diagrams as SVG", async ({ page }) => {
  await withMock(page, { pickerFolder: "/fixtures/sample" });
  await page.goto("/");
  await page.getByRole("button", { name: /Open Folder/ }).click();

  // Mermaid runs client-side after render; give it a moment.
  const mermaid = page.locator(".prose .mermaid");
  await expect(mermaid.first()).toBeVisible();
  await expect.poll(async () => mermaid.first().locator("svg").count(), { timeout: 15_000 }).toBeGreaterThan(0);
});

test("renders syntax-highlighted code blocks (Shiki)", async ({ page }) => {
  await withMock(page, { pickerFolder: "/fixtures/sample" });
  await page.goto("/");
  await page.getByRole("button", { name: /Open Folder/ }).click();
  // Shiki injects color spans into <pre class="shiki"> elements.
  const shiki = page.locator(".prose pre.shiki");
  await expect(shiki.first()).toBeVisible({ timeout: 15_000 });
  const styledSpans = await page.locator(".prose pre.shiki code span[style]").count();
  expect(styledSpans).toBeGreaterThan(5);
});

test("flavour selector toggles footnote rendering", async ({ page }) => {
  await withMock(page, { pickerFolder: "/fixtures/sample" });
  await page.goto("/");
  await page.getByRole("button", { name: /Open Folder/ }).click();
  await expect(page.getByRole("heading", { name: "ReadUp — Sample Document" })).toBeVisible();

  // Extended is the default and shows the footnote anchor.
  await expect(page.locator(".prose").locator(".footnote-ref, sup a").first()).toBeVisible();

  // Switch to CommonMark; the footnote markup goes away.
  await page.locator("select").selectOption("commonmark");
  await expect(page.locator(".prose .footnotes")).toHaveCount(0);
});

test("source toggle replaces rendered view with raw markdown", async ({ page }) => {
  await withMock(page, { pickerFolder: "/fixtures/sample" });
  await page.goto("/");
  await page.getByRole("button", { name: /Open Folder/ }).click();

  await page.getByRole("button", { name: "Source", exact: true }).click();
  // Source view renders the raw markdown — heading content should be visible
  // as text, not as an <h1>.
  await expect(page.locator(".source")).toContainText("# ReadUp — Sample Document");
  await expect(page.locator(".prose")).toHaveCount(0);

  await page.getByRole("button", { name: "Rendered", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ReadUp — Sample Document" })).toBeVisible();
});

test("theme switch toggles data-theme on <html>", async ({ page }) => {
  await withMock(page);
  await page.goto("/");

  await page.locator('button[title="Latte (light)"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "latte");

  await page.locator('button[title="Mocha (dark)"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "mocha");
});

test("opening a standalone file works (no sidebar)", async ({ page }) => {
  await withMock(page, { pickerFile: "/standalone.md" });
  await page.goto("/");

  await page.getByRole("button", { name: /Open File/ }).click();
  await expect(page.getByRole("heading", { name: "Standalone" })).toBeVisible();
  // No tree in single-file mode.
  await expect(page.locator(".tree")).toHaveCount(0);
});

test("CLI startup target loads automatically", async ({ page }) => {
  await withMock(page, { cliOpen: { kind: "folder", path: "/fixtures/sample" } });
  await page.goto("/");
  // No clicks: the app should auto-open the CLI target.
  await expect(page.getByRole("heading", { name: "ReadUp — Sample Document" })).toBeVisible({
    timeout: 10_000,
  });
});

test("broken remote image falls back to placeholder badge", async ({ page }) => {
  await withMock(page, { cliOpen: { kind: "folder", path: "/fixtures/sample" } });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ReadUp — Sample Document" })).toBeVisible();
  // The sample doc has a deliberately-broken `https://invalid.example.invalid/logo.svg`.
  // After remote → local-sibling both fail (mock-fs:// is unrecognised), the
  // image must be replaced with a `.image-fallback` placeholder.
  await expect.poll(
    async () => page.locator(".prose .image-fallback").count(),
    { timeout: 15_000, message: "expected at least one image placeholder" },
  ).toBeGreaterThan(0);
  // The remote URL falls back to a same-named sibling, which also fails in
  // the mock browser environment, so we expect *both* a remote-URL placeholder
  // and a relative-path placeholder.
  const texts = await page.locator(".prose .image-fallback").allTextContents();
  expect(texts.join("\n")).toMatch(/invalid\.example\.invalid/);
  expect(texts.length).toBeGreaterThanOrEqual(2);
});

test("wikilinks: resolved links render as anchors, broken as broken spans", async ({ page }) => {
  await withMock(page, { cliOpen: { kind: "folder", path: "/fixtures/wiki" } });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Wiki — index" })).toBeVisible();

  // Resolved plain link.
  const other = page.locator("a.wikilink", { hasText: "other-note" });
  await expect(other).toBeVisible();
  await expect(other).toHaveAttribute("data-wikilink-target", "/fixtures/wiki/other-note.md");

  // Piped alias uses the alias as display text.
  const aliased = page.locator("a.wikilink", { hasText: "the other note" });
  await expect(aliased).toBeVisible();
  await expect(aliased).toHaveAttribute("data-wikilink-target", "/fixtures/wiki/other-note.md");

  // Nested target.
  const nested = page.locator("a.wikilink", { hasText: "sub/nested" });
  await expect(nested).toHaveAttribute("data-wikilink-target", "/fixtures/wiki/sub/nested.md");

  // Broken link → wikilink-broken span, *not* an <a>.
  const broken = page.locator(".wikilink-broken", { hasText: "does-not-exist" });
  await expect(broken).toBeVisible();
  await expect(broken).toHaveCount(1);
  expect(await broken.evaluate((el) => el.tagName)).toBe("SPAN");
});

test("wikilinks: clicking a resolved link loads the target document", async ({ page }) => {
  await withMock(page, { cliOpen: { kind: "folder", path: "/fixtures/wiki" } });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Wiki — index" })).toBeVisible();

  await page.locator("a.wikilink", { hasText: "other-note" }).click();
  await expect(page.getByRole("heading", { name: "Other note" })).toBeVisible();

  // Follow a piped link onward to the nested doc.
  await page.locator("a.wikilink", { hasText: "sub/nested" }).click();
  await expect(page.getByRole("heading", { name: "Nested" })).toBeVisible();

  // Back to index via a piped alias on the nested page.
  await page.locator("a.wikilink", { hasText: "index" }).click();
  await expect(page.getByRole("heading", { name: "Wiki — index" })).toBeVisible();
});

test("wikilinks: inline + fenced code are left untouched", async ({ page }) => {
  await withMock(page, { cliOpen: { kind: "folder", path: "/fixtures/wiki" } });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Wiki — index" })).toBeVisible();

  // Fenced and inline code should preserve the literal `[[...]]` text.
  const fenced = page.locator(".prose pre code", { hasText: "[[not-a-link]]" });
  await expect(fenced).toBeVisible();
  const inline = page.locator(".prose p code", { hasText: "[[also-not-a-link]]" });
  await expect(inline).toBeVisible();
});

test("hostile markdown is neutralised: no script execution, no dangerous hrefs", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });

  await withMock(page, { cliOpen: { kind: "folder", path: "/fixtures/hostile" } });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hostile document" })).toBeVisible();
  // Give any would-be-evil JS a moment to try.
  await page.waitForTimeout(750);

  // Nothing should have executed.
  const pwned = await page.evaluate(() => (window as any).__pwned ?? null);
  expect(pwned, "any of the XSS payloads escaped").toBeNull();
  expect(await page.title()).not.toMatch(/PWNED/);

  // No anchor should carry a dangerous scheme.
  const hrefs = await page.locator(".prose a").evaluateAll((els) =>
    els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""),
  );
  for (const h of hrefs) {
    expect(h, `bad href: ${h}`).not.toMatch(/^(?:javascript|vbscript|file|data:text):/i);
  }

  // Page errors are expected for blocked schemes / missing img — filter and
  // make sure none mentions actual JS execution.
  const real = errors.filter((e) => !/ERR_|net::|Failed to load resource|mock-fs/i.test(e));
  expect(real, real.join("\n")).toEqual([]);
});

test("captures no console errors during a full render", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await withMock(page, { cliOpen: { kind: "folder", path: "/fixtures/sample" } });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ReadUp — Sample Document" })).toBeVisible();
  // Let mermaid + shiki finish.
  await page.waitForTimeout(2000);

  // Filter known-benign warnings about mock-fs:// image loads.
  const real = errors.filter((e) => !/mock-fs|net::ERR_/i.test(e));
  expect(real, real.join("\n")).toEqual([]);
});

test.afterEach(async ({ page }) => {
  void appState; // keep import warm; remove when state helper is fleshed out.
  await page.close().catch(() => {});
});
