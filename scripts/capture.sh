#!/usr/bin/env bash
# Capture only reviewed configuration paths, never whole application directories.
set -euo pipefail

chezmoi add --secrets error \
  "$HOME/.pi/agent/settings.json" \
  "$HOME/.pi/agent/extensions/label.ts" \
  "$HOME/.pi/agent/extensions/carry/index.ts" \
  "$HOME/.config/herdr/config.toml" \
  "$HOME/.config/nvim/init.lua" \
  "$HOME/.config/nvim/lua" \
  "$HOME/.config/nvim/lsp" \
  "$HOME/.config/nvim/lazy-lock.json" \
  "$HOME/.config/nvim/nvim-pack-lock.json"

if [[ -f "$HOME/.pi/agent/keybindings.json" ]]; then
  chezmoi add --secrets error "$HOME/.pi/agent/keybindings.json"
fi

printf '\nCaptured configuration. Review git diff before committing/pushing.\n'
printf 'File deletions must be recorded explicitly with chezmoi forget.\n'
