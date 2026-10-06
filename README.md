# dotfiles

```sh
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b ~/.local/bin init --apply --source ~/src/dotfiles https://github.com/jstettner/.dotfiles.git
```

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
