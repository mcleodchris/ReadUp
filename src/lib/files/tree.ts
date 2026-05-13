import { isMarkdownFile } from "./entry";

export interface DirNode {
  kind: "dir";
  name: string;
  path: string;
  children: TreeNode[];
}

export interface FileNode {
  kind: "file";
  name: string;
  path: string;
}

export type TreeNode = DirNode | FileNode;

/**
 * Prune a directory tree so that:
 *  - Non-markdown files are removed.
 *  - Directories with no markdown descendants are removed.
 *  - Children are sorted: directories first, then files; each group by locale-sensitive name.
 *
 * Returns the pruned root, or null if the entire tree is empty after pruning.
 */
export function pruneTree(node: DirNode): DirNode | null {
  const children: TreeNode[] = [];

  for (const child of node.children) {
    if (child.kind === "file") {
      if (isMarkdownFile(child.name)) children.push(child);
    } else {
      const pruned = pruneTree(child);
      if (pruned) children.push(pruned);
    }
  }

  if (children.length === 0) return null;

  children.sort(compareNodes);

  return { ...node, children };
}

export function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/** Flatten a tree into the ordered list of file paths it contains. */
export function flattenFiles(node: TreeNode): string[] {
  if (node.kind === "file") return [node.path];
  return node.children.flatMap(flattenFiles);
}
