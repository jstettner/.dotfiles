# Pi runtime instructions

Read this file whenever a skill in this directory is explicitly invoked. These instructions adapt the
vendored workflows to Pi; they take precedence over runtime-specific wording in the workflow or its references.
Follow the current repository's instructions (`AGENTS.md`, when present) and its applicable coding skills.

## Invocation and paths

- These skills are manual-only: invoke `/skill:<name>`, optionally followed by a document path or request.
  Do not automatically invoke the next workflow; suggest its command and wait for the user.
- `{SKILLBASE}` means the directory containing the invoked skill's `SKILL.md`. Resolve reference paths
  and this file's relative links against that directory, not the working directory.
- Find task documents from the user's request or prior conversation. If the task directory is unknown or
  ambiguous, ask the user. Do not expect an injected artifact-directory section in the system prompt.
- Keep using `.humanlayer/tasks/<task-slug>/` for local artifacts, including existing tasks. The name is
  retained for compatibility; no HumanLayer service is involved. Confirm that local artifacts are ignored
  before committing code; do not commit them. The directory may contain symlinks. Use `ls -La` to inspect it;
  do not assume it exists or is always a symlink.
- Link to the actual local document or HTML file with ordinary Markdown links. There is no cloud upload,
  artifact viewer, sidebar, comment tool, automatic permalink, or automatic workflow advancement.
  Never invent a cloud URL or promise these features.
- Read required files completely, continuing with offsets if a tool truncates its output. Use Pi's `read`
  tool for file contents, `bash` for file operations, and `edit` for targeted document changes.

## Delegation with Pi Subagent

Before spawning a child, read the installed `subagent` skill and follow its CLI lifecycle instructions.
Use `subagent spawn`, not an Agent or Task tool. Named roles below describe the prompt, not an agent registry
or a `subagent_type` parameter. A workflow's delegation step authorizes that delegation; do not add unrelated work.

For repository investigation and review, use `--tools read,grep,find,ls`. Do not give a read-only role `bash`,
`edit`, or `write`.

```sh
subagent spawn --name locate-auth --tools read,grep,find,ls --prompt "Role: codebase-locator. Find the files implementing authentication and their tests. Return paths grouped by responsibility. Read-only; do not change files or spawn children."
```

Choose a role and state its responsibilities explicitly:

| Role | Prompt responsibilities |
| --- | --- |
| codebase-locator | Find relevant source, config, and tests; return paths grouped by responsibility. |
| codebase-analyzer | Trace current behavior and data flow; explain it with file:line evidence, without unsolicited critique. |
| codebase-pattern-finder | Find comparable implementations and tests; return concrete examples and file:line evidence. |
| implementer / outline-implementer | Read the supplied plan or outline and companion documents; implement only the requested phase; run its checks and report changes, failures, and manual verification needs. |
| reviewer | Read the diff and applicable repository instructions; return actionable findings with file:line evidence; do not edit or delegate. |

For external or dependency research (the upstream web-search-researcher role), use the parent's
`web_search`, `fetch_content`, and related web tools. Repository-only read-only children cannot perform web research.
Use `reference/` for pinned upstream source when available, and cite source URLs in findings.

Keep implementer prompts short: include the role, phase, document paths, completion criteria, and an instruction
to read `AGENTS.md` and the applicable coding skills before planning or editing. Use default tools for implementers.
Do not bypass repository instructions with isolation flags. Managed children cannot spawn nested subagents.

Run independent research children concurrently when useful, but wait for their results before synthesizing.
Use `subagent wait <handle>` directly with a sufficiently long bash timeout; do not infer completion from terminal
output or redirected logs. Retain handles for follow-up and stop each child when no further work is needed.

## Delegated implementation has one independent review round

Follow the repository's delegated-work policy. Unless it specifies otherwise, use one independent review
round for every phase before reporting completion:

1. An implementer finishes the scoped changes.
2. A separate read-only reviewer checks the diff against the repository instructions and applicable coding
   skills. In Cerberus, these are `AGENTS.md`, `idiomatic-effect`, and, for React, `no-use-effect`.
   Give the reviewer the document paths and scope.
3. The implementer fixes the findings once. Nobody reviews the fixes again.
4. The parent runs the repository's required typecheck, lint, and affected tests itself.
   In Cerberus, run `bun run check`, `bun run lint`, and affected tests from the repository root.
5. Only then report results and request any genuinely manual verification.

Plans and outlines that delegate implementation schedule this one round, never a review-until-satisfied loop.
