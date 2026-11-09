#!/usr/bin/env python3
"""Create a local task without overwriting task data or committed ignore rules."""

import argparse
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def git(repo, *args):
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True, text=True, capture_output=True,
    ).stdout.strip()


def initialize(repo, name, goal, scope, context):
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name):
        raise ValueError("Task name must be lowercase kebab-case without path separators")
    if len(name) > 100:
        raise ValueError("Task name must be at most 100 characters")
    for label, value in (("goal", goal), ("scope", scope), ("context", context)):
        if not value.strip():
            raise ValueError(f"{label} must be nonempty; explicitly describe unknown context")

    root = Path(git(Path(repo).expanduser().resolve(), "rev-parse", "--show-toplevel")).resolve()
    task = root / ".local" / "tasks" / name
    for path in (root / ".local", root / ".local/tasks", task):
        if path.is_symlink():
            raise ValueError(f"Refusing symlink in task path: {path}")
        if path.exists() and not path.is_dir():
            raise ValueError(f"Expected a directory: {path}")
    if git(root, "ls-files", "--", ".local/tasks"):
        raise ValueError("Task storage contains tracked files; resolve that before initializing")

    # --git-path resolves the common info/exclude correctly for linked worktrees.
    exclude = Path(git(root, "rev-parse", "--path-format=absolute", "--git-path", "info/exclude"))
    exclude.parent.mkdir(parents=True, exist_ok=True)
    pattern = "/.local/tasks/"
    previous = exclude.read_text() if exclude.exists() else ""
    if pattern not in previous.splitlines():
        with exclude.open("a") as handle:
            if previous and not previous.endswith("\n"):
                handle.write("\n")
            handle.write(pattern + "\n")

    # Fail before creating task data if a higher-priority rule cancels exclusion.
    git(root, "check-ignore", "--quiet", "--", str(task / "task.md"))
    head = subprocess.run(
        ["git", "-C", str(root), "rev-parse", "--verify", "--quiet", "HEAD"],
        text=True, capture_output=True,
    )
    if head.returncode not in (0, 1):
        raise ValueError(f"Cannot inspect HEAD: {head.stderr.strip()}")
    branch = git(root, "rev-parse", "--abbrev-ref", "HEAD") if head.returncode == 0 else "unborn"
    try:
        task.mkdir(parents=True, exist_ok=False)
    except FileExistsError:
        return {"status": "exists", "taskDirectory": str(task),
                "taskFile": str(task / "task.md"), "excludeFile": str(exclude),
                "message": "Offer to resume; no existing task files were modified."}

    content = (
        f"# {name}\n\n"
        f"Created: {datetime.now(timezone.utc).isoformat()}\n"
        f"Repository: `{root}`\nBranch at initialization: `{branch}`\n\n"
        f"## Goal\n\n{goal.strip()}\n\n"
        f"## Scope and non-goals\n\n{scope.strip()}\n\n"
        f"## Initial context\n\n{context.strip()}\n\n"
        "## Status\n\nInitialized. Research and decisions are pending.\n\n"
        "## Handoff\n\nThis directory is the durable task record. "
        "Pi session-tree navigation does not undo file or Git changes.\n"
    )
    with (task / "task.md").open("x") as handle:
        handle.write(content)
    return {"status": "created", "taskDirectory": str(task),
            "taskFile": str(task / "task.md"), "excludeFile": str(exclude)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--goal", required=True)
    parser.add_argument("--scope", required=True)
    parser.add_argument("--context", required=True)
    args = parser.parse_args()
    try:
        result = initialize(args.repo, args.name, args.goal, args.scope, args.context)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        detail = error.stderr.strip() if isinstance(error, subprocess.CalledProcessError) else str(error)
        parser.exit(1, f"init-task failed: {detail or str(error)}\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
