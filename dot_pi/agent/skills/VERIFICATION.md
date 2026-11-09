# Verification — 2026-09-18

## Installed resources

- 22 explicit-invocation skills under `~/.pi/agent/skills/`.
- 20 RPI workflows adapted from installed version 0.40.1, visual guidance from 0.1.3, and a new task initializer.
- Original plugin files were read only; no project code or committed ignore files were modified by this installation.
- Supporting document templates and visual references retained/adapted; obsolete UI response templates and integration helpers were not installed.
- Original license notices retained. This is a local adaptation, not a redistribution package.

## Automated checks

```bash
python3 ~/.pi/agent/skills/init-task/scripts/test_init_task.py
node ~/.pi/agent/skills/init-task/scripts/validate_skills.mjs
```

Initializer: 11 tests passed. Coverage includes unborn repositories, repeat initialization preserving every byte, incomplete existing directories, unsafe names, execution from a subdirectory, existing exclude content without a final newline, symlink rejection, tracked task storage rejection, conflicting ignore rules, linked worktrees, and non-Git directories.

Discovery: the installed Pi `loadSkills` implementation loads all 22 skills with zero global diagnostics. All 43 skill reference links resolve. All 50 literal skill-command references point to installed commands. Native skill commands are not disabled in global settings. Runtime instructions contain no vendor task paths, old command prefixes, runtime placeholders, unavailable delegation tools, artifact hooks, or workspace configuration dependencies.

## Existing project collision

When project skills from `ambral-auto/.agents/skills/` are included, Pi reports an existing `show-me` name collision. The selected copy is `~/.pi/agent/skills/show-me/SKILL.md`; the project-local copy remains unchanged. All 22 installed skills remain selected. This warning is intentionally reported rather than hidden or resolved by modifying project files.

## Main-agent workflow smoke test

Fixture: `/private/tmp/pi-workflow-smoke.172uw4` (temporary, may be cleaned by the OS).

1. Initialized `.local/tasks/greeting-research/task.md` using the actual helper.
2. Read the new workflow instructions, shared convention, and templates in the main agent.
3. Read a two-line greeting function and its test module.
4. Saved `01-research-questions-greeting.md` and `02-research-greeting.md`, including explicit next-command handoffs.
5. Ran `python3 -B -m unittest -v`: both fixture tests passed.
6. Verified task artifacts are excluded through `.git/info/exclude` and not shown by Git status. No `.gitignore` was created.

No delegated agents or model subprocesses were used. This exercises the file-based workflow and actual Pi skill discovery, not the interactive command-picker or session-tree UI. Use `/reload` in the running Pi session to register the new commands. Tree behavior is documented against the installed Pi documentation; no claim of file/Git rollback is made.
