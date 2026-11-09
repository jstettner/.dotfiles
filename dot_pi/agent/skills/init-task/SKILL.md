---
name: init-task
description: Initialize or resume a repository-local task with durable context and local Git exclusion.
disable-model-invocation: true
---

# Initialize a task
Read [the shared convention](references/task-workflow.md).

1. Interpret the first argument as a task name or an explicit task directory. With no name, propose a short lowercase kebab-case name from the goal and ask for confirmation. Do not invent a goal when there is no context.
2. Resolve the repository root. A supplied directory must be exactly `<root>/.local/tasks/<name>/` for initialization; other workflows may use existing explicit directories elsewhere. Validate the name using `[a-z0-9]+(?:-[a-z0-9]+)*`. Do not silently sanitize traversal, slashes, or shell syntax.
3. Establish the goal, scope/non-goals, and initial context from the user's request. Ask only for missing material information; mark remaining unknowns clearly. Never copy credentials into the task.
4. Run the helper from this skill's directory (resolve the path absolutely):
   `python3 scripts/init_task.py --repo <repository> --name <name> --goal <goal> --scope <scope> --context <context>`
   Quote every argument. The helper creates `task.md` exclusively and adds `/.local/tasks/` to the local Git exclude file, including in linked worktrees. It does not modify `.gitignore` or stage anything.
5. If it reports `exists`, read `task.md` if present and offer to resume; do not overwrite, repair, or merge content without permission. If the directory is incomplete, explain what is missing. On confirmed resume, establish that directory in conversation and inspect its progress/artifacts.
6. For a new task, read the generated `task.md`, check `git check-ignore -v -- <task-path>/task.md`, and establish the absolute directory in conversation. Report any exclusion failure instead of claiming success.
7. Finish with `task.md` and suggest `/skill:create-research-questions <task-directory>`. Mention that `/tree` branches share these files and Git state.

## Handoff
Finish according to the shared convention. Suggested next command: `/skill:create-research-questions <task-directory>`; replace the directory with the actual resolved path and explain any approval or blocker first.
