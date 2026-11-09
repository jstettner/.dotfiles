# Shared task workflow

Read this reference before acting. Repository instructions and the user's current request take precedence.

## Resolve the task
- Accept an explicit task directory (absolute or relative to the repository), optionally followed by feedback or a phase number. An explicit artifact file selects its parent task directory.
- Otherwise use the task directory unambiguously established in this conversation. If absent or ambiguous, ask; do not infer a task from modification times or a global pointer.
- For a new task, suggest `/skill:init-task <task-name>`. Never silently create a second task during another workflow.
- Confirm the repository root with `git rev-parse --show-toplevel`. Resolve and report the absolute task directory, especially across worktrees. Quote paths in shell commands.
- List the task directory and read the relevant artifacts before modifying them. Use `read`; continue with offsets when its output is truncated until the complete document has been read.
- Follow applicable repository instructions before investigating or changing code. The task's request defines desired behavior, not evidence about existing behavior.

## Execute in this agent
Use `bash` to locate files (`rg`, `find`, `ls`) and run commands, `read` for contents, `edit` for precise changes, and `write` for new files. Perform investigation, implementation, and verification yourself, sequentially. Do not delegate or launch other model sessions. Do not assume optional tools or network access exist. For dependencies, inspect installed/vendored source and local documentation first; consult external documentation only through actually available tools and cite its URL. Record unavailable evidence rather than inventing it.

## Durable artifacts
The normal task location is `<repository>/.local/tasks/<task-name>/`. Keep task artifacts local and never stage them. Initialization adds `/.local/tasks/` to Git's local exclude file, not a committed ignore file. Explicit directories elsewhere are allowed, but check that they are untracked/ignored and ask before changing ignore policy.

New documents use the next unused numeric prefix: `01-research-questions-topic.md`, `02-research-topic.md`, etc. Inspect existing names and reserve a new name; never overwrite another branch's document. Iteration edits the selected document in place. Preserve useful metadata and approvals. Templates contain authoring prompts, not literal output; replace them with verified values or explicitly mark unknowns. Do not claim a nonexistent commit in an unborn repository.

Save decisions, evidence, unresolved questions, and verification results to files. Implementation uses `progress.md`: current phase, changed files, exact checks and outcomes, remaining work, approvals, and the next action. Mark checkboxes only when their criteria actually pass. Record user decisions separately from recommendations; a newer unapproved proposal does not supersede an approved design. Flag conflicts between artifacts rather than silently choosing by timestamp.

## Conversation branches
The user can use `/tree` to return to an earlier point and continue on another conversation branch, or bookmark a point with Shift+L in the tree. Suggest separate exploration, research, planning, and implementation branches when useful. These are user-facing Pi commands, not shell commands or tools you can invoke.

**Navigating the session tree changes conversation context, not files or Git state.** Before leaving a branch, save its findings and a short handoff. On returning, re-read the current files, `git status`, and relevant diffs; do not trust old conversation state or completed checkboxes blindly. Pass the explicit task directory in the next command. Use differently named files for alternative designs until the user chooses one. There is no global current-task pointer.

## Completion and safety
After writing or updating a task document, show it in the Rex pane to the right of the agent, reusing the document pane already open: follow `~/.pi/agent/skills/show-me/references/open-document.md`. Finish with saved file paths, a brief status/blocker, and a suggested `/skill:<name> <task-directory>` command. During an interview, ask one concrete decision question instead of pretending the phase is complete. Never auto-run the next workflow. Do not commit, push, publish a PR, switch branches, or create worktrees without authorization for that action. Preserve unrelated changes and never force-add task artifacts. Required failed/unavailable checks block completion; distinguish tested, untested, and waiting for human judgment.
