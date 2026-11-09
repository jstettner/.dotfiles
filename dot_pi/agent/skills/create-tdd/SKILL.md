---
name: create-tdd
description: Develop technical system and program design, with separate review gates before implementation planning.
disable-model-invocation: true
---

# Create a technical design document

Read [the shared convention](../init-task/references/task-workflow.md) and [visual guidance](../show-me/references/show-me.md).
Ask one decision question per message. Present a few concrete alternatives and your recommendation, then wait. Clarifying questions or tentative discussion are not approval. Edit affected sections only once a decision is resolved, preserving one coherent document rather than appending a Q&A transcript. Use concise takeaway headings with visuals next to the text they explain. Keep confirmed prior decisions; ask only what remains unresolved. Investigate missing facts yourself.

Read [the TDD template](references/tdd_template.md). A PRD is optional: ground requirements in the task and available approved context.

1. Read product context, research, and existing decisions. Save `NN-tdd-topic.md` with System Design, Program Design, and Patterns to Follow sections.
2. Settle System Design first: cross-component behavior, service boundaries, persistence, schemas, queues, external interfaces, failures, and key contracts. Show current versus proposed behavior where it matters. Do not bury decisions in exhaustive implementation detail.
3. Ask for review of the entire System Design section. Wait for approval before moving to Program Design.
4. Work through the internal code shape using concrete signatures, call trees, dependency maps, component trees, pseudocode, and focused diffs. Show each meaningful option as a code sketch rather than only describing it.
5. Reference existing patterns with source locations. Include testing seams and constraints. If a technical choice changes product scope, get user agreement and update the PRD/mockups as needed.
6. For a concept that needs a richer visual, save local HTML following the visual guidance; use no remote assets by default.
7. Request review of the complete Program Design. Record both review gates, unresolved questions, and approved decisions before suggesting the structure outline.

## Handoff
Finish according to the shared convention. Suggested next command: `/skill:create-structure-outline <task-directory>`; replace the directory with the actual resolved path and explain any approval or blocker first.
