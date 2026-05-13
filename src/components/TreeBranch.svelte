<script lang="ts">
  import type { TreeNode } from "../lib/files/tree";
  import Self from "./TreeBranch.svelte";

  interface Props {
    nodes: TreeNode[];
    current?: string | null;
    depth?: number;
    onSelect: (path: string) => void;
  }

  const { nodes, current = null, depth = 0, onSelect }: Props = $props();

  let expanded = $state<Record<string, boolean>>({});

  function toggle(path: string) {
    expanded[path] = !(expanded[path] ?? true);
  }

  function isExpanded(path: string): boolean {
    return expanded[path] ?? true;
  }
</script>

<ul style:--depth={depth}>
  {#each nodes as node (node.path)}
    <li>
      {#if node.kind === "dir"}
        <button
          type="button"
          class="dir"
          onclick={() => toggle(node.path)}
          aria-expanded={isExpanded(node.path)}
        >
          <span class="caret" class:open={isExpanded(node.path)}>▸</span>
          <span class="name">{node.name}</span>
        </button>
        {#if isExpanded(node.path)}
          <Self
            nodes={node.children}
            {current}
            depth={depth + 1}
            {onSelect}
          />
        {/if}
      {:else}
        <button
          type="button"
          class="file"
          class:active={current === node.path}
          onclick={() => onSelect(node.path)}
          title={node.path}
        >
          <span class="name">{node.name}</span>
        </button>
      {/if}
    </li>
  {/each}
</ul>

<style>
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  li {
    margin: 0;
  }

  button {
    width: 100%;
    text-align: left;
    background: transparent;
    border: 0;
    color: var(--rd-fg);
    padding: 0.25rem 0.5rem 0.25rem calc(0.5rem + var(--depth) * 0.8rem);
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button:hover {
    background: var(--rd-bg);
  }

  .file.active {
    background: var(--rd-accent);
    color: var(--rd-bg);
  }

  .caret {
    display: inline-block;
    transition: transform 0.1s ease;
    font-size: 0.7rem;
    color: var(--rd-fg-muted);
    width: 0.8rem;
  }

  .caret.open {
    transform: rotate(90deg);
  }

  .dir .name {
    font-weight: 500;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
