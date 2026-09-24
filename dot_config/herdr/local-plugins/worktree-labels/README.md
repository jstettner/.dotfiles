# Combined Herdr worktree labels

Local plugin: `local.worktree-labels`. Source lives in this directory, outside
application repositories. Requires Python 3 and Git. No background daemon.

## Naming

Each space is named after the Git checkouts occupied by its panes, across all
its tabs, in pane order. Checkouts are deduplicated by their canonical paths.
With multiple worktrees, each short name is truncated to six characters and
joined with centered dots (` · `). With just one worktree, its full checkout
folder name is shown—even if it has multiple panes or a detached HEAD.
Moving the other worktrees out restores that folder name, including prefixes.
Distinct checkouts with identical labels or six-character prefixes stay separate.

- Single checkout folder `ui-loader-fix` → `ui-loader-fix`
- Single checkout folder `ui-bench-to-tailwind` → `ui-bench-to-tailwind`
- Both attached to `ui/loader-fix` and `ui/bench-to-tailwind` → `loader · bench-`
- Combined labels drop one branch namespace (e.g. `ui/`) before truncation
- Branch without a slash → the branch name for combined labels
- Detached linked worktree → checkout directory name for combined labels
- Primary checkout → repository directory name
- Names shorter than six characters are kept as-is when combined
- Non-Git panes are ignored; spaces with no Git panes are left alone

Labels come from each pane's `cwd` and Git metadata, not workspace provenance or
previous space labels. Only display names change: checkouts, branches, running
processes, and Herdr's underlying worktree group membership are untouched.

Labels refresh on pane move/create/close/exit/focus, tab close, workspace
create/update, worktree open, and server startup. Branch/CWD changes that do not
emit those events are picked up on the next pane focus or explicit refresh:

```sh
herdr plugin action invoke local.worktree-labels.refresh
```

The plugin owns names of spaces containing Git panes. A manual space rename is
replaced at the next refresh. There is no subscription to rename events, so a
refresh cannot recursively trigger itself. A per-server file lock serializes
concurrent event hooks; each hook reads a fresh snapshot after acquiring it.

## Keyboard

In `~/.config/herdr/config.toml`:

- `prefix + g`: `herdr-arrange.open-tree` (move the current pane)
- `prefix + alt + g`: Herdr's original Goto picker

The prefix remains Ctrl+B. In the destination picker use arrows to navigate,
Right to expand to panes, Enter to move beside the selected pane, and Esc to
close. Selecting a workspace instead creates a new tab there; select a tab or
pane for a split-screen destination.

`herdr-arrange` is installed from `crierr/herdr-arrange` at commit
`1060f44c31569fc43283cef34f1710adb6ffdcaf` (0.2.1). Go was installed with Homebrew
to build it; Go is not needed while the built plugin is running.

## Verification

Run from this directory inside Herdr:

```sh
python3 -m unittest -v
python3 smoke_test.py
python3 labels.py --dry-run
herdr config check
herdr plugin log list --plugin local.worktree-labels --limit 20
```

The smoke test creates a uniquely named, isolated Herdr server and temporary Git
worktrees. It verifies event-driven combine/separate/deduplicate/close behavior,
terminal preservation, empty-space cleanup, and opening the installed picker.
It stops and deletes only that test session; it never moves live-session panes.

## Disable / undo

```sh
herdr plugin disable local.worktree-labels
```

Disabling stops automatic naming; existing labels remain. Rename spaces manually
with `herdr workspace rename <id> <name>`. On the original setup machine,
initial labels are saved in the machine-local `labels-before.json` (IDs only
apply while those spaces still exist); this backup is not synced by chezmoi.

On that machine the original key configuration is backed up at
`~/.config/herdr/config.toml.before-worktree-labels` (also not synced).
To undo just this setup,
remove the `herdr-arrange.open-tree` command block and the `goto` override from
`config.toml`, then run `herdr server reload-config`. Avoid replacing the whole
config from the backup if it has acquired other edits since setup.
