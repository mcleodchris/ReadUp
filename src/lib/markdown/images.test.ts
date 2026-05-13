import { describe, it, expect } from "vitest";
import { classifySrc, joinDocPath, siblingPath } from "./images";

describe("classifySrc", () => {
  it("identifies remote URLs", () => {
    expect(classifySrc("http://example.com/x.png")).toBe("remote");
    expect(classifySrc("https://example.com/x.png")).toBe("remote");
    expect(classifySrc("HTTPS://example.com/x.png")).toBe("remote");
  });

  it("identifies data URIs", () => {
    expect(classifySrc("data:image/png;base64,abc")).toBe("data");
  });

  it("identifies protocol-relative URLs separately from absolute paths", () => {
    expect(classifySrc("//cdn.example.com/x.png")).toBe("protocol-relative");
  });

  it("identifies absolute paths", () => {
    expect(classifySrc("/var/x.png")).toBe("absolute");
    expect(classifySrc("C:/Users/x.png")).toBe("absolute");
    expect(classifySrc("C:\\Users\\x.png")).toBe("absolute");
  });

  it("identifies relative paths", () => {
    expect(classifySrc("x.png")).toBe("relative");
    expect(classifySrc("./x.png")).toBe("relative");
    expect(classifySrc("../assets/x.png")).toBe("relative");
  });

  it("does not treat unknown schemes as relative", () => {
    expect(classifySrc("mailto:foo@example.com")).toBe("other");
    expect(classifySrc("javascript:alert(1)")).toBe("other");
    expect(classifySrc("file:///etc/passwd")).toBe("other");
    expect(classifySrc("ftp://example.com/x")).toBe("other");
  });

  it("treats empty / whitespace-only src as other", () => {
    expect(classifySrc("")).toBe("other");
    expect(classifySrc("   ")).toBe("other");
  });
});

describe("joinDocPath", () => {
  it("joins posix paths", () => {
    expect(joinDocPath("/docs", "img.png")).toBe("/docs/img.png");
    expect(joinDocPath("/docs/", "img.png")).toBe("/docs/img.png");
    expect(joinDocPath("/docs", "./img.png")).toBe("/docs/./img.png");
  });

  it("joins windows-style paths", () => {
    expect(joinDocPath("C:\\docs", "img.png")).toBe("C:\\docs\\img.png");
  });

  it("returns the relative when dir is empty", () => {
    expect(joinDocPath("", "img.png")).toBe("img.png");
    expect(joinDocPath(".", "img.png")).toBe("img.png");
  });
});

describe("siblingPath", () => {
  it("returns the basename joined to the doc directory", () => {
    expect(siblingPath("/docs", "https://example.com/foo/bar.png")).toBe("/docs/bar.png");
    expect(siblingPath("/docs", "../assets/bar.png")).toBe("/docs/bar.png");
  });
});
