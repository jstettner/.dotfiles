---
name: implement-outline
disable-model-invocation: true
description: Only use when the user explicitly invokes this skill by name.
---

Before following this workflow, read [Pi runtime instructions](../runtime.md).

# Phased Implementation from Structure Outline

You are the orchestrator for implementing a structure outline from `.local/tasks/<task>/`. You will work through each phase systematically using the outline implementer subagent, reading the outline and companion documents instead of a plan file.

**CRITICAL**: This skill IS the implementation orchestrator. Do NOT hand orchestration to another skill. Directly launch a Pi subagent with an outline-implementer role in its prompt.

## Getting Started

When invoked:
1. Discover documents in the task directory:
   - `ls -la .local/tasks/<task>`
   - note the structure outline: file matching `*structure-outline*.md`
   - note the research document: file matching `*research*.md`, excluding research questions
   - note the design discussion: file matching `*design-discussion*.md`
2. Read the structure outline fully to understand the phases
3. Begin with Phase 1 (or first unimplemented phase if resuming)
4. Follow the workflow below

**Document precedence**: structure outline > design discussion > research > ticket. When documents conflict, the outline takes precedence.

**Progress tracking**: The outline-implementer-agent updates the outline document as work completes:
- Validation checkboxes: `- [ ]` → `- [x]` when automated verification passes
- Phase titles: `## Phase N: Title` → `## ✅ Phase N: Title` when all phase validation is confirmed

## Workflow

For each phase in the structure outline:

### 1. Launch Implementer Agent

Use `subagent spawn --name implement-phase-N` with an outline-implementer role in the prompt to implement the current phase. Provide the paths to all discovered documents and clear instructions about which phase to implement.

Example prompt:
```
Implement Phase [N] from the structure outline at .local/tasks/<task>/NN-structure-outline-DESCRIPTION.md

Companion documents (read these for context):
- Research: .local/tasks/<task>/NN-research-DESCRIPTION.md
- Design discussion: .local/tasks/<task>/NN-design-discussion-DESCRIPTION.md

The outline describes intent and signatures — use your judgment to write the actual implementation.
Structure outline takes precedence over research and design discussion if they conflict.
Focus only on Phase [N]. Stop after completing automated verification.
Update progress markers in the outline as you complete validation steps.
```

IMPORTANT — keep your prompt short. The implementer agent will read the documents itself. Do not duplicate the outline contents in your prompt.

### 2. Independent Review, Checks, and Report to Human

Before reporting, spawn a separate read-only reviewer with `--tools read,grep,find,ls` to check the diff against the repository instructions and applicable coding skills. Have the implementer fix the findings once; do not review the fixes again. Then run the repository's required typecheck, lint, and affected tests yourself.

After review, fixes, and checks, summarize the phase:
```
## Phase [N] Complete

**What was done:**
- [Brief summary of changes]

**Manual verification needed:**
- [List manual checks from the outline's Validation section]

Ready for Phase [N+1] when you confirm, or let me know if anything needs adjustment.
```

### 3. Wait for Human Confirmation

Ask for the human to:
- Confirm manual checks passed
- Report any issues found
- Give permission to continue to the next phase

### 4. Commit the Changes

- Create a new commit for the changes
- Do not commit `.local/tasks/`; confirm that local task artifacts are ignored.

### 5. Repeat for Next Phase

When prompted, repeat this workflow for the next phase.

## Special Instructions

### Resuming Work

If resuming work on a partially completed outline:
- Read the outline to understand which phases exist
- Look for ✅ markers in phase titles to identify completed phases
- Look for `- [x]` checkboxes to see granular progress within phases
- Trust that completed work is done unless something seems off
- Pick up from the first phase without a ✅ marker

### Handling Issues

If the implementer agent reports a mismatch or gets stuck:
- Present the issue clearly to the human
- Wait for guidance before proceeding
- Consider whether the outline needs to be updated based on codebase evolution

### Multiple Phases

If instructed to implement multiple phases consecutively:
- Still launch separate implementer agents for each phase
- Perform verification between phases
- Report summary after all requested phases complete
- Only pause for human verification after the final phase

### Waiting for Input

Unless expressly asked, don't commit or proceed to a next phase until the human has reviewed and approved the previous phase.

Workflow checklist:

- [ ] discover documents with `ls -la .local/tasks/<task>`
- [ ] read the structure outline to understand phases
- [ ] launch a Pi subagent with an outline-implementer role for Phase 1
- [ ] obtain one separate read-only review and have the implementer fix its findings
- [ ] run the repository's required typecheck, lint, and affected tests in the parent
- [ ] report summary and ask the human to perform manual verification
- [ ] iterate with the human until the results are satisfactory
- [ ] commit the changes
- [ ] launch implementer subagent for next phase

## After Final Phase Completion

When ALL phases are complete and verified:

1. Commit the final changes
2. Read the final output template:

`Read({SKILLBASE}/references/implement_outline_final_answer.md)`

3. Respond following the template exactly. Do not include a summary or other information.
