# Global Pi workflows

Vendored from [humanlayer/humanlayer-pi](https://github.com/humanlayer/humanlayer-pi),
commit `f4bd3ed65cfdb8dfea474b4cadce2ed90cc4acbd`. This is a maintained local fork, not an installed Pi package.
Supporting references, templates, and scripts are kept with their skills.

These 16 workflows live in `~/.pi/agent/skills/humanlayer/` and are tracked in chezmoi at
`dot_pi/agent/skills/humanlayer/`. Pi discovers them in every project and worktree. Every `SKILL.md` has
`disable-model-invocation: true`: its metadata is omitted from the model's system prompt, while explicit
commands still work. For example:

```text
/skill:create-research-questions <request or ticket path>
/skill:create-research <research-questions path>
/skill:create-design-discussion <task directory>
/skill:create-structure-outline <task directory>
/skill:implement-outline <task directory>
/skill:describe-pr
```

The PRD/TDD and iteration workflows are available under their original names too. The separately managed
`~/.pi/agent/skills/show-me/` keeps the customized `/skill:show-me`. Its
`references/show-me.md` is the one visual guide: the workflows that draw (`create-design-discussion`,
`create-structure-outline`, `describe-pr`) read it there, and keep no copy of their own.

Each workflow reads [runtime.md](runtime.md) when invoked. It owns Pi-specific delegation instructions so those
details do not need to live in always-loaded repository instructions. Research uses read-only Pi Subagent roles;
implementation has one independent review round and parent-run checks, following the current repository's rules.
External research uses the parent's web tools.

Each task's artifacts live in `.local/tasks/<task>/` at the repository (or worktree) root, beside the `task.md`
that `init-task` writes; the global gitignore ignores them. Cloud mirroring, comment tools, HumanLayer session trailers, UI buttons, and automatic
advancement are not part of this fork.

## Installation and updates

Keep Pi Subagent installed:

```sh
pi install git:github.com/jstettner/pi-subagent
```

The HumanLayer extension is not needed and can introduce duplicate skill names. Remove it if installed:

```sh
pi remove git:github.com/humanlayer/humanlayer-pi
```

Deploy tracked workflows with `chezmoi apply ~/.pi/agent/skills/humanlayer`, then run `/reload` in Pi.
After local edits, capture them with `chezmoi add ~/.pi/agent/skills/humanlayer` and review the dotfiles diff.

Updates are deliberate source changes: compare upstream against the recorded commit, preserve the manual-only
frontmatter and Pi adaptations, update the source commit above, and verify skill discovery and reference links.
Do not replace this tree automatically with a package update.
