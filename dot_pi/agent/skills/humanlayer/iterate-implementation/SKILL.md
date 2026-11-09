---
name: iterate-implementation
disable-model-invocation: true
description: Only use when the user explicitly invokes this skill by name.
---

Before following this workflow, read [Pi runtime instructions](../runtime.md).

# Iterate Implementation

An implementation plan was implemented and a user has follow-on feedback - it might be a bug, it might be further changes or tweaks, it might be a follow-on feature to implement in the same branch

## Steps

1. **Read all input files FULLY**:
   - Use Read tool WITHOUT limit/offset to read the plan document and any other provided paths
   - `ls -la .local/tasks/<task>` to find all related documents in the task directory
   - Read the plan file (e.g. `NN-plan-DESCRIPTION.md`) to understand the work that was prescribed
   - Read prior artifacts in the task directory for context: `ticket.md` or `task.md`, research documents, design discussion, and structure outline
   - **If no plan exists**, read the ticket, structure outline, design discussion, and research documents instead

2. **Understand the current state**
   - check the current git diff
   - find the commit that marks the end of implementation
   - read and understand and commits since then - the content of what changed
   - understand what phases of the plan were already implemented - the user might be giving you feedback in the middle of a plan implementation
   - **If the user wants to implement an unstarted phase**: use `subagent spawn` with an implementer role in its prompt — don't implement phases inline. Example prompt when no plan exists:
     <example_subagent_prompt>
     Implement Phase [N] from the structure outline at [outline path]

     Companion documents (read these for context):
     - Research: [research path]
     - Design discussion: [design path]

     Structure outline takes precedence if documents conflict.
     </example_subagent_prompt>

3. **If the user gives any input**:
   - DO NOT just accept the correction blindly
   - Read the specific files/directories they mention
   - Verify code examples and file paths are accurate
   - Only proceed once you've verified the facts yourself

4. **Clarify the feedback**:
   - If user reported a bug: check the database, ask for relevant logs, do whatever is needed to understand what still needs to be done
   - If user requested code changes: Update the specific code examples
   - If there are multiple approaches to fix, ask the user for any clarification
   - If more logs are needed, add logging and ask the user to reproduce issue and share the updated logs

5. **Apply the Fix** :
   - if the fix is clear or the user has accept one of your proposed solutions, make the changes
   - make the changes
   - If implementation was delegated, obtain one separate read-only review, then have the implementer fix the findings once without a second review
   - Run the repository's required typecheck, lint, and affected tests yourself

6. **Update the user**
   - Respond following the template exactly. Include next steps for verification.


<guidance>

## Markdown Formatting

When writing markdown files that contain code blocks showing other markdown (like README examples or SKILL.md templates), use 4 backticks (````) for the outer fence so inner 3-backtick code blocks don't prematurely close it:

````markdown
# Example README
## Installation
```bash
npm install example
```
````

</guidance>

## When Iteration is Complete

If the iteration resolves all issues and no further changes are needed:

1. Read the final output template:

`Read({SKILLBASE}/references/iterate_implementation_final_answer.md)`

2. Respond following the template exactly. Do not include a summary or other information.
