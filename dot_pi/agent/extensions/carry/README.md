# /carry

Run `/carry`, choose a destination in the session tree, then choose:

1. **Last message only** — the last user or assistant message with text.
2. **All user + assistant messages** — the selected target through the current branch head, inclusive.
3. **User messages + final assistant** — the same range, replacing earlier assistant responses with `[Response omitted]`.

Selecting a user message still prefills Pi's input normally. Its original text is included in modes 2 and 3, so clearing or replacing that input does not lose it.

Messages are carried verbatim with role labels. Tool calls/results, thinking, summaries and internal entries are excluded. Images are represented by `[Image omitted]`; tool-only and empty messages are skipped. Raw branch history is used, including messages before compaction.

When navigating to a different branch, modes 2 and 3 carry the abandoned source side after the nearest shared ancestor (or the entire source branch when the roots are unrelated).

No model call or automatic agent turn is triggered. Escape from the mode menu returns to the tree at the same selection; escape from the tree cancels.

Run `/reload` after changing this extension.

## Tests

With Node 24 and Pi installed globally:

```sh
node --test ~/.pi/agent/extensions/carry/tests/carry.test.mjs
```

For a non-global Pi installation, set `PI_PACKAGE_DIR` to its package directory. Tests use synthetic in-memory sessions and Pi's actual extension loader and tree component.
