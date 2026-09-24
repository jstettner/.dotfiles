# Development configuration

Private chezmoi configuration for Pi, Herdr, and Neovim on macOS/Linux.

Configuration and custom local plugin source are deployed. Authentication,
trust decisions, histories, sockets, logs, installed binaries, and downloaded
plugins stay machine-local.

## New machine

Install Git, chezmoi, Node.js/npm (Node 24 recommended), Neovim **0.12.4 or
newer**, Herdr (currently **0.9.1**), GitHub CLI, ripgrep, a C compiler,
make, curl, unzip, the tree-sitter CLI, Python 3, and Go **1.24.2 or newer**.
Use current upstream packages if your Linux distribution ships an older Neovim. Install Herdr using the
instructions at https://herdr.dev for your server's OS/architecture.

On macOS, most prerequisites are available with:

```sh
brew install chezmoi git node neovim gh ripgrep tree-sitter python go
# C compiler: xcode-select --install (if not already installed)
```

Install the matching Pi version:

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.85.1
```

Authenticate GitHub on the new machine; do not copy credentials from another
machine. For HTTPS Git access:

```sh
gh auth login
gh auth setup-git
mkdir -p ~/src
chezmoi init --source ~/src/dotfiles https://github.com/jstettner/dotfiles.git
chezmoi diff
```

Back up existing configs before applying, especially if the server already
has custom Pi/Herdr/Neovim settings. Review the diff, then:

```sh
chezmoi apply
bash "$(chezmoi source-path)/scripts/setup-plugins.sh"
```

The setup script explicitly installs Herdr's generated Pi integration,
reinstalls Annotate and Arrange at their recorded commits for this machine's
architecture, links the custom worktree-label plugin, and restores Neovim
plugins from `lazy-lock.json`. It is not an automatic chezmoi hook: normal
config updates never run installers unexpectedly.
Mason provisions the configured Lua/TypeScript language servers on Neovim
startup. Project-local TypeScript dependencies must be installed per project.
Run `:checkhealth` in Neovim after installation.

Authenticate Pi with `/login`. Restart Pi after applying settings/extensions;
keybinding changes can also be loaded with `/reload`. If Herdr is running:

```sh
herdr server reload-config
```

For remote plugin keybindings, use:

```sh
herdr --remote user@server --remote-keybindings server
```

Annotate's installed documentation notes that local remote-attach keybindings
may drop plugin actions. Using server bindings avoids that issue.

## What is managed

- Pi `settings.json` and custom `/label` and `/carry` extensions.
- Pi `keybindings.json` if you create one and run the capture script (the
  initial machine uses Pi's default bindings, so none existed).
- Herdr `config.toml`, including focus/review/pane-move keybindings.
- Herdr's custom `local.worktree-labels` plugin source and tests.
- Neovim Lua configuration and both plugin lockfiles.

The Herdr-generated `herdr-agent-state.ts` extension is intentionally installed
by Herdr, not tracked. Custom Pi extensions are tracked directly here;
no separate package repository is required.

`/carry` captures the latest assistant text, opens Pi's native tree picker,
and inserts the text verbatim as a branch summary at the selected position.
It makes no model call, leaves the clipboard unchanged, and waits for your
next prompt. The original branch is preserved. Selecting a user message
branches before it and restores that prompt to the editor, as with `/tree`.
Run `/reload` after installing or updating the extension.

Herdr's worktree path is `~/wt/ambral`, portable across home directories.
`prefix + g` opens Arrange's pane destination picker; the original Goto picker
is on `prefix + alt + g`. Git-backed spaces automatically combine their panes'
six-character worktree names with centered dots, e.g. `loader · bench-`. When
only one worktree remains, its full name is restored. Manual space names are
replaced on refresh. See the deployed plugin's
`~/.config/herdr/local-plugins/worktree-labels/README.md` for details and tests.
On existing machines, run `scripts/setup-plugins.sh` after applying this update
to install/link the new plugins; reloading configuration alone is not enough.

Neovim discovers Obsidian vaults locally; on a headless machine optionally set
`OBSIDIAN_VAULT` to an existing vault directory. Vault contents are not synced.
Clipboard support depends on the terminal and OS; a headless server does not
have the Mac system clipboard. Keep secrets out of settings/extensions; use
per-machine environment variables and logins instead.

## Save changes from either machine

Pull/apply before editing whenever possible. After changing live configs:

```sh
bash "$(chezmoi source-path)/scripts/capture.sh"
chezmoi git -- diff
chezmoi git -- add .
chezmoi git -- commit -m "Update development config"
chezmoi git -- push
```

The capture script uses an explicit allowlist and chezmoi's secret scanner.
Review every diff anyway. Add new files explicitly with `chezmoi add --secrets
error PATH`. Record removed files with `chezmoi forget PATH` (removes management,
not the destination); remove obsolete destination files on other machines
explicitly. Do not capture all of `~/.pi` or `~/.config/herdr`.

To receive updates on another machine:

```sh
chezmoi git -- pull --ff-only
chezmoi diff
chezmoi apply
```

`chezmoi update` combines pulling and applying; the separate commands above let
you review first. Capture and commit local edits before pulling to avoid
losing them. There is no automatic two-way synchronization.

## Neovim ownership

Neovim configuration is tracked directly in `dot_config/nvim` in this repo,
not as a submodule or a separate checkout. Chezmoi deploys it to
`~/.config/nvim`; after editing there, use the capture/commit workflow above.
The old `jstettner/nvim` repository is no longer used.

The original machine's Git metadata was moved out of `~/.config/nvim` into
`~/.local/state/dotfiles/backups/nvim-20260917-233746/.git`, preserving its
history without leaving a competing repository in the live configuration.
