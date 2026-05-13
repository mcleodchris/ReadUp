<script lang="ts">
  import type { DirNode } from "../lib/files/tree";
  import TreeBranch from "./TreeBranch.svelte";

  interface Props {
    tree: DirNode;
    current?: string | null;
    onSelect: (path: string) => void;
  }

  const { tree, current = null, onSelect }: Props = $props();
</script>

<nav class="tree" aria-label="Document tree">
  <div class="root-name" title={tree.path}>{tree.name}</div>
  <TreeBranch nodes={tree.children} {current} depth={0} {onSelect} />
</nav>

<style>
  .tree {
    padding: 0.5rem 0.25rem;
    font-size: 0.9rem;
  }

  .root-name {
    padding: 0.3rem 0.6rem;
    font-weight: 600;
    color: var(--rd-fg);
    border-bottom: 1px solid var(--rd-border);
    margin-bottom: 0.4rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
