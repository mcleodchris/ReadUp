# Wiki — index

This fixture exercises Obsidian-style wikilinks.

- A plain link: [[other-note]]
- A piped link: [[other-note|the other note]]
- A nested link: [[sub/nested]]
- A broken link: [[does-not-exist]]
- A broken link with alias: [[also-missing|a missing concept]]

Wikilinks inside fenced code should **not** be transformed:

```
[[not-a-link]]
```

And not inside inline code either: `[[also-not-a-link]]`.
