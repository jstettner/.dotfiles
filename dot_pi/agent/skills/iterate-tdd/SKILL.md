---
name: iterate-tdd
description: Refine existing technical design from feedback without losing decisions or evidence.
disable-model-invocation: true
---

# Iterate technical design
Read [the shared convention](../init-task/references/task-workflow.md). For detailed authoring guidance, read [the creation workflow](../create-tdd/SKILL.md), but update the selected existing file rather than creating a new document.


1. Read the selected existing document fully plus the user's feedback. Resolve the task using the shared convention; ask for the target when several documents are plausible. If no feedback or direction is supplied, ask one focused question and wait.
2. Read relevant approved upstream artifacts and directly investigate factual claims in source. Preserve user preferences while distinguishing them from claims about existing behavior.
3. Edit the selected document in place, integrating changes into the relevant sections instead of appending a transcript. Preserve useful metadata, evidence, completed work, and explicit approvals. Mark decisions reopened by new scope as pending.
4. Check affected downstream artifacts for staleness and record what needs revisiting; do not silently rewrite an approved design or start implementing.

## Specific guidance
Keep cross-component System Design distinct from internal Program Design. Present concrete diagrams or code sketches for each decision; ask one question at a time. Resolve changes to system design before dependent program design. Reopen relevant review gates and seek approval. If product behavior changes, reconcile the PRD with user agreement.

## Handoff
Finish according to the shared convention. Suggested next command: `/skill:create-structure-outline <task-directory>`; replace the directory with the actual resolved path and explain any approval or blocker first.
