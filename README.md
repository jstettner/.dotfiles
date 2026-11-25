# dotfiles

```sh
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b ~/.local/bin init --apply --source ~/src/dotfiles https://github.com/jstettner/.dotfiles.git
```

## Capturing changes

`bash scripts/capture.sh` captures configuration changed on this machine. It re-adds
every tracked file (as `chezmoi re-add` would, except templates) and also snapshots
what re-add skips: the `modify_` files' managed values, new files in our own config
folders, and the Herdr plugin list. Review the Git diff before committing.

It is not a `re-add.post` hook: chezmoi runs post hooks while it still holds its
persistent-state lock, so the script's own `chezmoi` calls would time out whenever
re-add changed something. On a machine whose chezmoi config still has that hook,
run `chezmoi init` once to remove it.

## Zsh

`modify_dot_zshrc` manages only the marked lazy-NVM block, preserving machine-local
aliases, PATH settings, plugins, and other shell configuration. It requires Python 3
and migrates the previously tracked eager or lazy Homebrew NVM block, or the
local `~/.nvm/nvm.sh` setup with inherited PATH cleanup, in place. The lazy loader
supports both Homebrew and `~/.nvm` installations.
Unrecognized NVM initialization fails without changing the file, so it can be
reviewed manually instead of loading NVM twice.

It also manages a marked Starship block that runs `starship init zsh` when
Starship is installed. An existing `eval "$(starship init zsh)"` line is migrated
into the block in place; other Starship initialization fails without changing the
file, so the prompt is never initialized twice. Do not use `chezmoi add ~/.zshrc`:
it would replace the modifier with a full-file snapshot.

## Zed

Chezmoi tracks `~/.config/zed/settings.json` and `~/.config/zed/keymap.json`.
Prompts, themes, and runtime state are not captured. After changing settings or
bindings in Zed, run `bash scripts/capture.sh` and review the Git diff before committing.
Run `chezmoi apply` to deploy the tracked config.

## Neovim

### Annotating buffers for Pi

In Neovim or NeoRex running inside Rex, select text and press `<Space>ac`.
In normal mode it captures the current line; character, line and block selections
capture exactly the selected text, including unsaved edits. The source is not changed.

Write your comment in the floating Markdown buffer, using normal Vim editing:

- `:wq` submits and closes. Writing is the submit action, so `:w` submits too.
- `:q!` without writing discards the comment.
- One Pi process in the editor's Rex tab receives the feedback directly. Multiple
  Pi processes open the usual floating picker; other tabs and shells are excluded.

Feedback includes the source path, line range, selected text and comment. The
bridge pastes one message into the chosen Pi input and presses Enter. Leave the target's input empty. A successful
dispatch means the terminal accepted the input, not an acknowledgment from Pi.

Failures and picker cancellation retain the draft in this Neovim process:
`:RexFeedbackResume` (or `<Space>ac`) reopens it. Drafts are not written to disk
and do not survive exiting Neovim. If a paste succeeded but Enter failed, inspect
Pi's input manually; the bridge refuses to paste the same draft again.

The `rex` CLI and the pane's inherited `REX_SESSION` / `REX_BLOCK` are required.
The bridge rechecks the chosen process and tab before pasting and before Enter.
It does not start agents, change focus to them or retry delivery automatically.
`:RexFeedback` also supports explicit line ranges.

### Diffview

[Diffview](https://github.com/sindrets/diffview.nvim) uses its standard layout,
with revision headers identifying the index, working tree or commit:

- `<Space>dv`: open working-tree diffs (`:DiffviewOpen`).
- `<Space>dh`: history of the current file.
- `<Space>dc`: close the diff view.

NeoRex cannot host Diffview\'s Neovim tab/split layout correctly. Its diff and
history shortcuts therefore open **regular Neovim inside one Rex floating pane**
in the editor\'s Rex tab, leaving the tiled panes alone. Closing the last Diffview
with `<Space>dc` or `:DiffviewClose` also exits that review process and its floating
pane. Unsaved edits made during review prevent automatic exit.

The floating reviewer uses NeoRex's palette colors and statusline when
`~/src/neorex/runtime` is installed, so Rex controls its colors too. Its native
TUI uses ANSI palette colors rather than fixed RGB colors. Diffs use separate
light/dark background tints: green additions, red removals, neutral changed lines
and stronger changed-word emphasis, without turning whole lines yellow or
inverting their foregrounds. The text and syntax keep Rex\'s colors. Ordinary
Neovim outside the reviewer keeps its usual theme.

Save or discard changed NeoRex buffers first: the separate reviewer reads files
from disk, not NeoRex\'s unsaved buffers. Launch failures do not fall back to the
broken split layout. Ordinary Neovim still opens Diffview in-process.

Use `:RexDiffview origin/main...HEAD` for branch changes in either frontend;
`:RexFileHistory [paths...]` uses the same routing for history. Direct
`:DiffviewOpen` remains native, so do not use it inside NeoRex. Markdown diffs work
like any other file. Diffview and annotations are separate: the annotation bridge
does not treat a historical diff buffer as a current file. Open the real file to
comment on it.

#### Opening a review from an agent or script

Chezmoi installs `~/.local/bin/rex-diffview`. Run it from the repository/worktree
in any Rex pane, including an agent's tool shell; NeoRex need not be running:

```sh
rex-diffview                       # uncommitted changes; staged/unstaged entries separate
rex-diffview HEAD                  # all uncommitted changes against HEAD
rex-diffview origin/main...HEAD    # committed branch changes since the merge base
rex-diffview --history README.md   # file history
```

It uses the existing Rex RPC API to open the same floating reviewer in the
caller's tab. Success prints one JSON object containing `layer_id`, `block_ids`
and Rex's revision. Errors go to stderr with a nonzero exit. Exit 0 means the
reviewer was opened, **not** that a human reviewed or approved anything.
`rex-diffview --help` describes the arguments; `-- PATH...` filters a diff.

Diffview does not persist viewed-file checkmarks or a last-reviewed checkpoint.
Use an explicit revision/range to compare with a known review point. Capturing
uncommitted work as a review checkpoint would need a separate, explicit action;
merely opening the reviewer must not mark changes as reviewed.

### Mermaid

Mermaid code blocks in Markdown render inline as text diagrams with
[mermaid-nvim](https://github.com/searleser97/mermaid-nvim), including inside Rex.
Chezmoi installs `termaid` with `uv` on macOS and Linux and restores the pinned
Neovim plugins. Existing renderer installations are left alone.

- `<Space>mp` (or Enter inside a block): open a floating preview; `q` closes it.
- `<Space>mt`: toggle the diagram under the cursor, scrolling to the diagram or source.
- `<Space>mr`: re-render and unhide all diagrams, scrolling to the current block's diagram.

Inline diagrams appear above their opening code fence; the source stays editable.
Put the cursor inside a Mermaid block before using the shortcuts. Large diagrams
may not fit inline: use the floating preview to pan around them.

Restart Neovim after applying the config. Text rendering supports a subset of
Mermaid syntax, not the full browser renderer.

With plugins installed, check the shortcuts and their visible output with
`nvim --headless -i NONE '+luafile scripts/test_nvim_mermaid.lua' '+qa!'`.

Additional Neovim checks (feedback delivery is mocked; no real agent is sent input):

```sh
nvim --headless -i NONE '+luafile scripts/test_nvim_rex_feedback.lua' '+qa!'
nvim --headless -i NONE '+luafile scripts/test_nvim_diffview.lua' '+qa!'
nvim --headless -i NONE '+luafile scripts/test_nvim_diffview_overlay.lua' '+qa!'
nvim --headless -i NONE '+luafile scripts/test_nvim_diff_colors.lua' '+qa!'
```

## Rex

The managed config is `dotfiles.lua`. `init.lua` is a modify script that only
loads it and keeps the block `leaf rex install` adds there (leaf rewrites that
block itself, for example on `leaf ui toggle`).

### Reviews in leaf

leaf reviews diffs and plans in the terminal and sends one
verdict (approved, approved with notes, changes requested, with numbered notes) to
the agent pane as its next message. `~/.local/bin/leaf-float` opens leaf in a centered
floating pane (80% of the tab) instead of leaf's own split, using Rex's
`session.new_layer` API:

```sh
leaf-float review                        # working tree, verdict to $REX_BLOCK
leaf-float review --range "$base..HEAD"   # committed work only
leaf-float plan plan.md                  # plan review, block by block
leaf-float --reply-to BLOCK review       # verdict to another pane
leaf-float close                         # close this agent's floating pane
```

Each agent pane has one floating leaf pane: opening another closes the earlier one
(leaf keeps unsent notes as drafts). `Cmd+O` reviews the focused agent's working
tree, `Cmd+Shift+O` its branch against its base. For remote panes the action is
forwarded to the owning Rex server, so that server needs `chezmoi apply` too.
`chezmoi apply` installs leaf with its release installer
(`curl -fsSL https://leaf.dipxsy.app | sh`, into `~/.local/bin`) when it's missing.

`chezmoi apply` installs leaf's `leaf`, `leaf-plan` and `leaf-review` skills into
`~/.agents/skills` (Pi) and `~/.claude/skills` (Claude Code), with a note to use
`leaf-float` in Rex, and reinstalls them when leaf's version changes. It doesn't run
`leaf agent setup`, whose plan hooks and blocking Pi tools we don't use. The
HumanLayer implement skills review each phase this way (`phase-review.md`).

Apply changes with `chezmoi apply ~/.config/rex`, then `rex config reload`.

## Hex

Hex keeps its settings in `~/Library/Application Support/hex/settings.json`
(older versions used `voice-control` instead of `hex`).
`modify_settings.json` manages only its `dictation_processing` key: the word
replacements, modes, transformations and post-processing prompt, snapshotted in
`.chezmoitemplates/hex-dictation-processing.json`. The microphone, hotkeys and other
machine-local settings are preserved. History, the local API's credentials and the
downloaded models are never tracked. On a new machine, launch Hex once so it writes
its settings, then run `chezmoi apply`.

After editing replacements in Hex, run `bash scripts/capture.sh` and review the Git diff.
Quit Hex before `chezmoi apply`, or it may overwrite the applied settings with the
ones it holds in memory.

## Pi desktop automation (macOS)

`chezmoi apply` installs [Cua Driver](https://cua.ai/docs/cua-driver/quickstart)
only when `cua-driver` is missing from PATH, and merges its server into
`~/.pi/agent/mcp.json`. Other servers and machine-local credentials are preserved,
not captured in this repository. The installer uses the latest upstream release;
it does not upgrade an existing installation. This setup is skipped on other OSes.

After applying, complete the permission setup manually:

1. Run `cua-driver permissions grant`. In System Settings → Privacy & Security,
   grant **CuaDriver.app** Accessibility and Screen Recording (called
   Screen & System Audio Recording on newer macOS versions). Accept the relaunch;
   run the command again if only one permission prompt appears.
2. Run `cua-driver doctor` and `pi mcp list` to verify readiness and MCP connectivity.
3. Run `cua-driver call list_apps` as a read-only observation before allowing actions.
4. Restart Pi, or use `/reload` in an existing session to load the new configuration.

Use `cua-driver mcp` without `--direct` so macOS attributes permissions to
CuaDriver.app. Never track the app bundle or copy the macOS TCC permission database.
Cua Driver enables content-free telemetry by default; opt out with
`cua-driver telemetry disable` if desired.

Checks: `python3 -m unittest discover -s scripts -p 'test_*.py'`.
