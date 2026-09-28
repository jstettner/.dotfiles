#!/usr/bin/env bash
# Capture only reviewed configuration paths, never whole application directories.
set -euo pipefail

source_dir="$(chezmoi source-path)"

# Re-add every tracked file. Templates are skipped: chezmoi add would replace
# them with plain copies of the target.
chezmoi managed --include files --path-style all --format json | python3 -c '
import json, os, sys
for entry in json.load(sys.stdin).values():
    name = os.path.basename(entry["sourceRelative"])
    if not (name.startswith(("create_", "modify_")) or name.endswith(".tmpl")):
        sys.stdout.write(entry["absolute"] + "\0")
' | xargs -0 -r chezmoi add --secrets error

# New files are picked up only in folders that hold nothing but our own config.
chezmoi add --secrets error \
  "$HOME/.pi/agent/extensions" \
  "$HOME/.config/herdr/local-plugins" \
  "$HOME/.config/nvim/lua" \
  "$HOME/.config/nvim/lsp"

# Pi's settings.json deploys through modify_settings.json; scan it as chezmoi add
# would, then snapshot it for that template.
chezmoi add --dry-run --secrets error "$HOME/.pi/agent/settings.json"
cp "$HOME/.pi/agent/settings.json" "$source_dir/.chezmoitemplates/pi-settings.json"

if [[ -f "$HOME/.pi/agent/keybindings.json" ]]; then
  chezmoi add --secrets error "$HOME/.pi/agent/keybindings.json"
fi

# Herdr's plugins.json is machine state; record just what the setup hook needs to
# reinstall each plugin at the commit installed here.
python3 - "$HOME/.config/herdr/plugins.json" "$source_dir" <<'PY'
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
