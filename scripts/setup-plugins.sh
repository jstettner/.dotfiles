#!/usr/bin/env bash
# Run explicitly after reviewing and applying the chezmoi configuration.
set -euo pipefail

for tool in herdr nvim node npm git cc tree-sitter; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Missing prerequisite: %s (see README.md)\n' "$tool" >&2
    exit 1
  fi
done

herdr integration install pi
herdr plugin install plannotator/herdr-annotate \
  --ref 7c8f5a177b8285dc56efc471ef04f7ab44a2b4b6 --yes
herdr config check
# Restore, rather than update, the committed plugin versions.
nvim --headless '+Lazy! restore' +qa
printf '\nPlugins installed. Log into Pi with /login and GitHub with gh auth login.\n'
printf 'For a running Herdr server, run: herdr server reload-config\n'
