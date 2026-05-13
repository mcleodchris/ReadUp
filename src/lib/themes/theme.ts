import type { ThemeName } from "../store";

/** Apply the chosen theme to the document root. Idempotent. */
export function applyTheme(name: ThemeName): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = name;
}

/** Map our theme name to a Mermaid theme string. */
export function mermaidThemeFor(name: ThemeName): "default" | "dark" {
  return name === "latte" ? "default" : "dark";
}
