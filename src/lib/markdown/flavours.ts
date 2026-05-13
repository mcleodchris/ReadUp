export type Flavour = "commonmark" | "gfm" | "extended";

export const FLAVOURS: { value: Flavour; label: string }[] = [
  { value: "commonmark", label: "CommonMark" },
  { value: "gfm", label: "GitHub Flavoured" },
  { value: "extended", label: "Extended" },
];

export const DEFAULT_FLAVOUR: Flavour = "extended";
