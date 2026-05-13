export function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

export function dirname(p: string): string {
  const m = p.match(/^(.*)[\\/][^\\/]+$/);
  return m ? m[1] : "";
}
