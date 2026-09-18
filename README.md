# Development configuration

Private chezmoi configuration for Pi, Herdr, and Neovim on macOS/Linux.
The local checkout lives at `~/src/dotfiles`.
Only configuration is deployed. Authentication, trust decisions, histories,
sockets, logs, installed binaries, and downloaded plugins stay machine-local.

## New machine

Install Git, chezmoi, Node.js/npm (Node 24 recommended), Neovim **0.12.4 or
newer**, Herdr (currently **0.9.1**), GitHub CLI, ripgrep, a C compiler,
make, curl, unzip, and the tree-sitter CLI. Use current upstream packages if
your Linux distribution ships an older Neovim. Install Herdr using the
instructions at https://herdr.dev for your server's OS/architecture.

On macOS, most prerequisites are available with:

```sh
brew install chezmoi git node neovim gh ripgrep tree-sitter
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
reinstalls Annotate at the recorded commit for this machine's architecture,
and restores Neovim plugins from `lazy-lock.json`. It is not an automatic
chezmoi hook: normal config updates never run installers unexpectedly.
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

- Pi `settings.json` and custom `/label` extension.
- Pi `keybindings.json` if you create one and run the capture script (the
  initial machine uses Pi's default bindings, so none existed).
- Herdr `config.toml`, including focus/review keybindings.
- Neovim Lua configuration and both plugin lockfiles.

The Herdr-generated `herdr-agent-state.ts` extension is intentionally installed
by Herdr, not tracked. The small custom Pi extension is tracked directly here;
no separate package repository is required.

Herdr's worktree path is `~/wt/ambral`, portable across home directories.
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

## Existing Neovim repository

The original `~/.config/nvim/.git` checkout is preserved and never deployed.
This repository includes a snapshot, not a submodule. Use this repository as
the cross-machine source of truth; commits/pulls in the old `jstettner/nvim`
repository do not automatically update it. Run the capture script after any
intentional changes made via that checkout.
