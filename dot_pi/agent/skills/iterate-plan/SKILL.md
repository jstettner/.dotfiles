---
name: iterate-plan
description: Refine existing implementation plan from feedback without losing decisions or evidence.
disable-model-invocation: true
---

# Iterate implementation plan
Read [the shared convention](../init-task/references/task-workflow.md). For detailed authoring guidance, read [the creation workflow](../create-plan/SKILL.md), but update the selected existing file rather than creating a new document.


1. Read the selected existing document fully plus the user's feedback. Resolve the task using the shared convention; ask for the target when several documents are plausible. If no feedback or direction is supplied, ask one focused question and wait.
2. Read relevant approved upstream artifacts and directly investigate factual claims in source. Preserve user preferences while distinguishing them from claims about existing behavior.
3. Edit the selected document in place, integrating changes into the relevant sections instead of appending a transcript. Preserve useful metadata, evidence, completed work, and explicit approvals. Mark decisions reopened by new scope as pending.
4. Check affected downstream artifacts for staleness and record what needs revisiting; do not silently rewrite an approved design or start implementing.

## Specific guidance

Prefer testable vertical slices: each phase should connect enough layers or modules to expose integration issues and deliver observable behavior. Avoid separate “all types, all API, all UI, then tests” phases when a slice can be verified end-to-end. Do not make a phase depend on a later phase merely to test it.
For each phase show intent, relevant file responsibilities, key signatures/contracts/data shapes, test changes, and runnable verification commands discovered in this repository. Use focused diff blocks for changes and complete shapes for mostly new code. Include manual checks only for genuinely human or unavailable-environment judgments, not as a substitute for automation.
Validate code examples and command names against current files. Update phase steps and acceptance criteria together. Preserve completed-work history and clearly separate new work from already verified behavior. Do not change branches or create worktrees as a side effect.

## Handoff
Finish according to the shared convention. Suggested next command: `/skill:implement-plan <task-directory>`; replace the directory with the actual resolved path and explain any approval or blocker first.
