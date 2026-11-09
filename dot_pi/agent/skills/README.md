# Local Pi task workflows

22 global skills: 20 adapted RPI workflows, show-me, and init-task. These are local adaptations of installed HumanLayer RPI 0.40.1 and visual guidance 0.1.3, not an official Pi distribution. Original plugins are untouched. Original license notices are retained; no redistribution license is granted here.

Use `/reload` in Pi, then `/skill:init-task task-name`. Skills are explicit-only (`disable-model-invocation: true`) and use native `/skill:<name>` commands. No settings change or extension is required.

Typical path:

```text
/skill:init-task task-name
/skill:create-research-questions .local/tasks/task-name
/skill:create-research .local/tasks/task-name
/skill:create-design-discussion .local/tasks/task-name
/skill:create-structure-outline .local/tasks/task-name
/skill:create-plan .local/tasks/task-name
/skill:implement-plan .local/tasks/task-name
```

PRD → TDD is an alternative design route. `implement-outline` skips detailed plan expansion. Seven document iteration workflows plus `iterate-implementation` revise existing work. `ci-commit`, `describe-pr`, and `setup-worktree` preserve useful Git workflows with explicit authorization. `show-me` saves Markdown diagrams and local HTML.

Every workflow accepts an explicit task directory, otherwise the unambiguous directory established in conversation. No global current-task pointer exists. Task initialization creates `.local/tasks/<name>/task.md` and locally excludes `/.local/tasks/` through Git's info/exclude; it never changes committed ignore rules. Python 3 and Git are required by its helper. Existing tasks are offered for resume, never overwritten.

Use `/tree` to split exploration, research, planning, and implementation into conversation branches. Save the handoff before switching and pass the task directory in the next command. Tree navigation changes conversation context, NOT files or Git state. Re-read current artifacts and diffs on return.

Excluded: artifact-comment integration and vendor workspace-configuration integration. No delegated agents, artifact hooks, cloud links, sidebar previews, automatic phase launches, or vendor runtime placeholders are required. Supporting authoring templates and visual guidance are included; vendor final-answer templates were replaced by concise file-based handoffs.

Verification scripts and results live in `init-task/scripts/` and `VERIFICATION.md`.
