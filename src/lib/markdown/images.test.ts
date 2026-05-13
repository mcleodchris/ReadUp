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
