---
name: create-plan
description: Expand an approved outline into concrete phased implementation steps and executable verification.
disable-model-invocation: true
---

# Write an implementation plan
Read [the shared convention](../init-task/references/task-workflow.md) and [the plan template](references/plan_template.md).

1. Read the chosen outline, approved design, completed research, and task scope. Read relevant source and test files fully to validate names, signatures, and conventions.
2. If no outline exists, ask whether to make one or explicitly plan directly from the approved scope. Do not silently invent approval.
3. Save `NN-plan-topic.md`. Expand each outline phase into exact file changes, meaningful code examples, test cases, verification commands, dependencies, and expected results. Do not present illustrative commands as if they exist in this repository.

Prefer testable vertical slices: each phase should connect enough layers or modules to expose integration issues and deliver observable behavior. Avoid separate “all types, all API, all UI, then tests” phases when a slice can be verified end-to-end. Do not make a phase depend on a later phase merely to test it.
For each phase show intent, relevant file responsibilities, key signatures/contracts/data shapes, test changes, and runnable verification commands discovered in this repository. Use focused diff blocks for changes and complete shapes for mostly new code. Include manual checks only for genuinely human or unavailable-environment judgments, not as a substitute for automation.

4. Capture migration/recovery concerns where applicable and pause points requiring human judgment. Preserve the approved scope and flag contradictions.
5. Request review before implementation. Do not switch Git branches or create worktrees as a planning side effect.

## Handoff
Finish according to the shared convention. Suggested next command: `/skill:implement-plan <task-directory>`; replace the directory with the actual resolved path and explain any approval or blocker first.
