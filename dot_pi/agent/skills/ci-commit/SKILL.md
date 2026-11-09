---
name: ci-commit
description: Review and commit only authorized task changes with focused messages and verification.
disable-model-invocation: true
---

# Commit task changes
Read [the shared convention](../init-task/references/task-workflow.md).

1. Read task scope and progress. Inspect `git status --short --branch`, unstaged and staged diffs, and recent commits. Identify exactly which changes belong to this task; do not disturb unrelated staged files.
2. Confirm required checks passed for the current content. Failed or unavailable required checks block committing. Review generated files, accidental secrets, and ignored task artifacts.
3. Propose coherent commit boundaries and clear imperative messages explaining why. An explicit request to commit authorizes ordinary task commits; otherwise ask before committing. Ask when file ownership or inclusion is ambiguous.
4. Stage explicit paths only; use neither `git add .` nor `git add -A`. Never force-add `.local/tasks/`, scratch data, or unrelated edits. If a file mixes unrelated changes, isolate approved hunks or ask; do not silently include the whole file.
5. Review the staged diff and run the commit normally, preserving hooks. Never bypass checks, amend, reset, or force-push without explicit authorization. Do not push as a side effect.
6. Record hashes and remaining status in `progress.md`. Report the commit(s), verification, and any uncommitted task work.

## Handoff
Finish according to the shared convention. Suggested next command: `/skill:describe-pr <task-directory>`; replace the directory with the actual resolved path and explain any approval or blocker first.
