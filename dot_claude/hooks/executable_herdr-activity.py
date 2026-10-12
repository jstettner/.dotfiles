#!/usr/bin/env python3
"""Report what Claude Code is doing as a `$doing` Herdr pane token.

Mirrors ~/.pi/agent/extensions/herdr-activity.ts; shown by ui.sidebar.agents in
~/.config/herdr/config.toml. Usage: herdr-activity.py <event>, with hook JSON on stdin.
"""
import json
import os
import subprocess
import sys
import time

SOURCE = "claude-activity"
# Clears the token if Claude dies without cleaning up.
TTL_MS = 30 * 60 * 1000


def clip(text, limit=60):
    line = " ".join(text.strip().split("\n")[0].split())
    return line if len(line) <= limit else line[: limit - 1] + "…"


def describe(tool, args):
    def get(key):
        value = args.get(key)
        return value if isinstance(value, str) and value else None

    file = get("file_path") or get("notebook_path") or get("path")
    name = os.path.basename(file) if file else None
    if tool == "Read":
        return f"reading {name}" if name else "reading"
    if tool in ("Edit", "MultiEdit", "NotebookEdit"):
        return f"editing {name}" if name else "editing"
    if tool == "Write":
        return f"writing {name}" if name else "writing"
    if tool == "Bash":
        # Claude usually describes its commands, which reads better than the raw command.
        if get("description"):
            return clip(get("description"))
        return f"$ {clip(get('command'))}" if get("command") else "running a command"
    if tool == "Grep":
        return f"searching {clip(get('pattern'), 40)}" if get("pattern") else "searching"
    if tool in ("Glob", "LS"):
        return "browsing files"
    if tool in ("Task", "Agent"):
        return f"subagent: {clip(get('description'), 40)}" if get("description") else "running a subagent"
    if tool == "WebFetch":
        return "fetching a page"
    if tool == "WebSearch":
        return f"web search: {clip(get('query'), 40)}" if get("query") else "searching the web"
    if tool.startswith("mcp__"):
        tool = tool.split("__", 2)[-1]
    return tool.replace("_", " ")


def main():
    pane = os.environ.get("HERDR_PANE_ID")
    # pi-claude-bridge runs Claude inside a pi pane; pi reports that pane itself.
    if os.environ.get("HERDR_ENV") != "1" or not pane or os.environ.get("PI_CODING_AGENT"):
        return
    event = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        data = json.load(sys.stdin)
    except Exception:
        data = {}

    if event == "pre-tool":
        doing = describe(data.get("tool_name") or "tool", data.get("tool_input") or {})
    elif event in ("prompt", "post-tool"):
        doing = "thinking"
    elif event in ("stop", "end"):
        doing = None
    else:
        return

    # Hooks can overlap; a microsecond clock keeps Herdr applying them in order.
    args = [os.environ.get("HERDR_BIN_PATH") or "herdr", "pane", "report-metadata", pane,
            "--source", SOURCE, "--seq", str(time.time_ns() // 1000)]
    if doing is None:
        args += ["--clear-token", "doing"]
    else:
        args += ["--token", f"doing={doing}", "--ttl-ms", str(TTL_MS)]
    try:
        subprocess.run(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3)
    except Exception:
        pass


if __name__ == "__main__":
    main()
