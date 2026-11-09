---
name: setup-worktree
description: Set up an optional Git worktree without vendor workspace configuration or automatic credential copying.
disable-model-invocation: true
---

# Set up an optional Git worktree
Read [the shared convention](../init-task/references/task-workflow.md).

Conversation branching through `/tree` does not require a Git worktree. Use a worktree only for filesystem/Git isolation the user wants.

1. Read the task and current plan/outline. Inspect `git status --short --branch`, `git worktree list --porcelain`, and the absolute Git directory/common directory. If already in a linked worktree, explain that and ask before nesting another setup.
2. Determine and confirm the target path, valid branch name (`git check-ref-format --branch`), and start ref. Inspect existing branches and worktrees. Never overwrite a directory, reuse a checked-out branch, or assume uncommitted changes will transfer.
3. After authorization, use `git worktree add -b <new-branch> <absolute-target> <start-ref>`; for an explicitly selected existing branch, omit `-b`. Stop and report errors instead of continuing setup blindly.
4. Keep a single canonical absolute task directory. It remains in the original repository and is untracked, so it will not appear automatically in the worktree. Pass that absolute directory to workflows in the new worktree; do not silently duplicate or symlink it.
5. Run only requested/repository-documented setup commands after inspecting them. Do not automatically copy environment files or credentials. Ask which local configuration, if any, should be copied.
6. Save `worktree.md` in the canonical task directory with path, branch, base, setup results, and handoff. The current Pi session's working directory does not change persistently when a shell runs `cd`.
7. Tell the user to start Pi from the new directory (`cd <target> && pi`), then invoke `/skill:implement-plan <absolute-task-directory>` or implement-outline as appropriate. Do not launch another agent yourself.

## Handoff
Finish according to the shared convention. Suggested next command: `/skill:implement-plan <task-directory>`; replace the directory with the actual resolved path and explain any approval or blocker first.
