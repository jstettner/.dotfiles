#!/usr/bin/env bash
# Capture only reviewed configuration paths, never whole application directories.
set -euo pipefail

chezmoi add --secrets error \
  "$HOME/.pi/agent/settings.json" \
  "$HOME/.pi/agent/extensions/label.ts" \
  "$HOME/.pi/agent/extensions/carry/index.ts" \
  "$HOME/.config/herdr/config.toml" \
  "$HOME/.config/herdr/local-plugins/worktree-labels/herdr-plugin.toml" \
  "$HOME/.config/herdr/local-plugins/worktree-labels/labels.py" \
  "$HOME/.config/herdr/local-plugins/worktree-labels/test_labels.py" \
  "$HOME/.config/herdr/local-plugins/worktree-labels/smoke_test.py" \
  "$HOME/.config/herdr/local-plugins/worktree-labels/README.md" \
  "$HOME/.config/nvim/init.lua" \
  "$HOME/.config/nvim/lua" \
  "$HOME/.config/nvim/lsp" \
  "$HOME/.config/nvim/lazy-lock.json" \
  "$HOME/.config/nvim/nvim-pack-lock.json"

if [[ -f "$HOME/.pi/agent/keybindings.json" ]]; then
  chezmoi add --secrets error "$HOME/.pi/agent/keybindings.json"
fi

# Herdr's plugins.json is machine state; record just what the setup hook needs to
# reinstall each plugin at the commit installed here.
python3 - "$HOME/.config/herdr/plugins.json" "$(chezmoi source-path)" <<'PY'
import json, os, subprocess, sys

state, source_dir = sys.argv[1:]
plugins, local_plugins = [], []
for plugin in json.load(open(state)):
    source = plugin["source"]
    if not plugin["enabled"]:
        continue
    if source["kind"] == "github":
        repo = "/".join(filter(None, [source["owner"], source["repo"], source.get("subdir")]))
        plugins.append({"repo": repo, "ref": source["resolved_commit"]})
    elif source["kind"] == "local":
        # Only a plugin whose files chezmoi deploys can be linked on another machine.
        found = subprocess.run(["chezmoi", "source-path", plugin["plugin_root"]], capture_output=True, text=True)
        if found.returncode == 0:
            local_plugins.append({
                "path": os.path.relpath(plugin["plugin_root"], os.path.expanduser("~")),
                "source": os.path.relpath(found.stdout.strip(), source_dir),
            })

os.makedirs(os.path.join(source_dir, ".chezmoidata"), exist_ok=True)
with open(os.path.join(source_dir, ".chezmoidata", "herdr.json"), "w") as out:
    json.dump({"herdr": {"plugins": plugins, "localPlugins": local_plugins}}, out, indent=2)
    out.write("\n")
PY

printf '\nCaptured configuration. Review git diff before committing/pushing.\n'
printf 'File deletions must be recorded explicitly with chezmoi forget.\n'
