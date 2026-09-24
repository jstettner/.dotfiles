#!/usr/bin/env python3
"""Name Herdr spaces after the Git checkouts occupied by their panes."""

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


class HerdrError(RuntimeError):
    def __init__(self, error):
        self.code = error["code"]
        super().__init__(error["message"])


def herdr(*args):
    result = subprocess.run(
        [os.environ["HERDR_BIN_PATH"], *args],
        capture_output=True, text=True, timeout=10,
    )
    if result.returncode:
        response = json.loads(result.stderr)
        raise HerdrError(response["error"])
    return json.loads(result.stdout)["result"]


def short_name(branch):
    """Drop one namespace, preserving any deeper path components."""
    return branch.partition("/")[2] if "/" in branch else branch


def checkout(cwd):
    """Return (canonical checkout path, label), or None outside a checkout."""
    if not Path(cwd).is_dir():
        return None
    result = subprocess.run(
        ["git", "-C", cwd, "rev-parse", "--show-toplevel",
         "--absolute-git-dir", "--git-common-dir"],
        capture_output=True, text=True, timeout=5,
        env={**os.environ, "LC_ALL": "C"},
    )
    if result.returncode:
        if "not a git repository" in result.stderr:
            return None
        raise RuntimeError(f"Git discovery failed in {cwd}: {result.stderr.strip()}")
    root, git_dir, common_dir = result.stdout.splitlines()
    root = Path(root).resolve()
    common_dir = (Path(cwd) / common_dir).resolve()
    if Path(git_dir).resolve() == common_dir:
        return str(root), root.name

    branch = subprocess.run(
        ["git", "-C", str(root), "symbolic-ref", "--quiet", "--short", "HEAD"],
        capture_output=True, text=True, timeout=5,
    )
    if branch.returncode == 1:  # Detached HEAD: the checkout directory identifies it.
        return str(root), root.name
    if branch.returncode:
        raise RuntimeError(f"Git branch lookup failed in {root}: {branch.stderr.strip()}")
    return str(root), short_name(branch.stdout.strip())


def workspace_labels(snapshot, resolve_checkout):
    """Combine unique names in pane order across every tab in a workspace."""
    names = {ws["workspace_id"]: [] for ws in snapshot["workspaces"]}
    directories = {}
    for pane in snapshot["panes"]:
        cwd = pane.get("cwd")
        if not cwd:
            continue
        if cwd not in directories:
            directories[cwd] = resolve_checkout(cwd)
        entry = directories[cwd]
        if entry is not None:
            label = entry[1]
            labels = names[pane["workspace_id"]]
            if label not in labels:
                labels.append(label)
    return {ws: " * ".join(labels) for ws, labels in names.items() if labels}


def refresh(api, resolve_checkout, dry_run):
    snapshot = api("api", "snapshot")["snapshot"]
    labels = workspace_labels(snapshot, resolve_checkout)
    changes = []
    for ws in snapshot["workspaces"]:
        workspace_id = ws["workspace_id"]
        label = labels.get(workspace_id)
        if label is None or label == ws["label"]:
            continue
        change = {"workspace_id": workspace_id, "before": ws["label"], "after": label}
        if not dry_run:
            try:
                api("workspace", "rename", workspace_id, label)
            except HerdrError as error:
                # A move can close the source between the snapshot and this call.
                if error.code != "workspace_not_found":
                    raise
                continue
        changes.append(change)
    return changes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if os.environ.get("HERDR_ENV") != "1":
        parser.error("run inside Herdr or as a Herdr plugin")
    if args.dry_run:
        changes = refresh(herdr, checkout, True)
    else:
        # Serialize hooks per server; each reads a fresh snapshot after locking.
        # This prevents an older move event from overwriting a newer label.
        state_dir = Path(os.environ["HERDR_PLUGIN_STATE_DIR"])
        socket_id = hashlib.sha256(os.environ["HERDR_SOCKET_PATH"].encode()).hexdigest()
        with (state_dir / f"{socket_id}.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            changes = refresh(herdr, checkout, False)
    print(json.dumps(changes))


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as error:
        print(f"worktree-labels: {error}", file=sys.stderr)
        sys.exit(1)
