---
name: implement-plan
disable-model-invocation: true
description: Only use when the user explicitly invokes this skill by name.
---

Before following this workflow, read [Pi runtime instructions](../runtime.md).

# Phased Implementation Orchestrator

You are responsible for orchestrating the phased implementation of technical plans from `.local/tasks/<task>/`. You will work through each phase systematically using a specialized implementer agent.

## Workflow

For each phase in the implementation plan:

### 0. Locate Plan File
If you were provided with a path to a plan file, proceed with the plan.
Otherwise, list the task directory with `ls -la .local/tasks/<task>` to locate the plan file inside of it.

### 1. Launch Implementer Agent
First record the phase's starting commit (`phase-review.md`, "Before the phase").
Use `subagent spawn --name implement-phase-N` with an implementer role in the prompt to implement the current phase. Provide clear instructions about which phase to implement.

Example:
```
Implement Phase [N] of the plan at .local/tasks/<task>/NN-plan-DESCRIPTION.md
Focus only on Phase [N] and stop after completing automated verification.
```

IMPORTANT - keep your prompt short, do not duplicate details that are already in the plan, because the implementer agent will read the plan.

### 2. Review Output
Carefully review the implementer agent's output:
- Check what was accomplished
- Note any issues or mismatches reported
- Identify manual verification steps requested

### 3. Independent Review and Automated Checks

After implementation, spawn a separate read-only reviewer with `--tools read,grep,find,ls` to check the diff against the repository instructions and applicable coding skills. Have the implementer fix the findings once. Do not review the fixes again.

Run the repository's required typecheck, lint, and affected tests yourself, plus any phase-specific verification:
- Build commands
- Test suites
- Linting/formatting checks
- Any other automated verification mentioned in the plan

### 4. Report to Human
Follow `{SKILLBASE}/../phase-review.md`: commit the round, open its review in Plannotator, and name the review in the summary.
Provide a clear summary of the phase completion:
```
## Phase [N] Implementation Summary

**Completed by implementer agent:**
- [List of completed tasks]

**Automated verification results:**
- [Results of automated checks you performed]

**Manual verification required:**
- [List manual checks the human needs to perform]

Ready to proceed to Phase [N+1] after manual verification, or let me know if any issues need addressing.
```

### 5. Wait for Human Confirmation
Wait for the human's decision on the review (or in the chat):
- Confirm manual checks passed
- Report any issues found: fix them and start the next review round
- Approve, to continue to the next phase

### 6. Commit the changes
- On approval, squash the phase's review rounds into one commit, with the repository's hooks, as `phase-review.md` says
- Do not commit `.local/tasks/`; confirm that local task artifacts are ignored.

### 7. Repeat for Next Phase
When prompted, repeat this workflow for the next phase.

## Special Instructions

### Resuming Work
If resuming work on a partially completed plan:
- First check the plan file for existing checkmarks (- [x])
- Instruct the implementer agent to resume from the first unchecked item
- Trust that completed work is done unless something seems off

### Handling Issues
If the implementer agent reports a mismatch or gets stuck:
- Present the issue clearly to the human
- Wait for guidance before proceeding
- Consider if the plan needs updating based on codebase evolution

### Multiple Phases
If instructed to implement multiple phases consecutively:
- Still launch separate implementer agents for each phase
- Perform verification between phases
- Report summary after all requested phases complete
- Only pause for human verification after the final phase

### Waiting for Input
- unless expressly asked, don't make the phase's commit (review rounds' `wip(review)` commits are part of the review) or proceed to a next phase until the human has reviewed and approved the previous phase

Workflow checklist:

- [ ] get plan path
- [ ] launch implementer subagent
- [ ] obtain one separate read-only review and have the implementer fix its findings
- [ ] run the repository's required typecheck, lint, and affected tests in the parent
- [ ] ask the human to perform manual verification
- [ ] iterate with the human until the results are satisfactory
- [ ] commit the changes
- [ ] launch implementer subagent for next phase

## After Final Phase Completion

When ALL phases are complete and verified (all checkboxes marked, all automated tests pass):

1. Commit the final changes
2. Read the final output template:

`Read({SKILLBASE}/references/implement_plan_final_answer.md)`

3. Respond following the template exactly. Do not include a summary or other information.

## Getting Started

When invoked:
1. Ask for the plan path if not provided
2. Read the plan to understand the phases
3. Begin with Phase 1 (or first unchecked phase if resuming)
4. Follow the workflow above

Remember: Your role is orchestration and verification. The implementer agent does the actual implementation work. Your job is to ensure quality, perform additional checks, and communicate clearly with the human.
