<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { TreeNode } from "../lib/files/tree";

  export let nodes: TreeNode[];
  export let current: string | null = null;
  export let depth: number = 0;

  const dispatch = createEventDispatcher<{ select: string }>();
  let expanded: Record<string, boolean> = {};

  function toggle(path: string) {
    expanded = { ...expanded, [path]: !(expanded[path] ?? true) };
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
          on:click={() => toggle(node.path)}
          aria-expanded={isExpanded(node.path)}
        >
          <span class="caret" class:open={isExpanded(node.path)}>▸</span>
          <span class="name">{node.name}</span>
        </button>
        {#if isExpanded(node.path)}
          <svelte:self
            nodes={node.children}
            {current}
            depth={depth + 1}
            on:select={(e) => dispatch("select", e.detail)}
          />
        {/if}
      {:else}
        <button
          type="button"
          class="file"
          class:active={current === node.path}
          on:click={() => dispatch("select", node.path)}
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
