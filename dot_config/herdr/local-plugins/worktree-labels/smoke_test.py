"""Exercise installed hooks in an isolated Herdr server, never the live session."""

import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import uuid


BINARY = os.environ["HERDR_BIN_PATH"]
SESSION = "labels-test-" + uuid.uuid4().hex[:8]
ENV = {key: value for key, value in os.environ.items() if not key.startswith("HERDR_")}
ENV["SHELL"] = "/bin/sh"


def cli(*args):
    result = subprocess.run([BINARY, "--session", SESSION, *args], env=ENV,
                            capture_output=True, text=True, timeout=10)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return json.loads(result.stdout)["result"]


def wait_for(predicate):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.1)
    raise AssertionError("Timed out waiting for plugin hooks")


def label_is(workspace_id, expected):
    spaces = cli("workspace", "list")["workspaces"]
    return any(ws["workspace_id"] == workspace_id and ws["label"] == expected for ws in spaces)


def git(*args):
    subprocess.run(["git", *args], check=True, capture_output=True, text=True, timeout=10)


def check_plugin_logs(plugin_id):
    logs = cli("plugin", "log", "list", "--plugin", plugin_id, "--limit", "200")["logs"]
    assert logs, f"No logs for {plugin_id}"
    failures = [log for log in logs if log["status"] == "failed"]
    assert not failures, failures
    return logs


def run():
    with tempfile.TemporaryDirectory(prefix="herdr-labels-smoke-") as temp:
        root = Path(temp)
        repo = root / "repo"
        first = root / "first"
        second = root / "second"
        git("init", "-b", "main", str(repo))
        git("-C", str(repo), "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
            "commit", "--allow-empty", "-m", "init")
        git("-C", str(repo), "worktree", "add", "-b", "ui/first-long-name", str(first))
        git("-C", str(repo), "worktree", "add", "-b", "ui/second-long-name", str(second))

        with (root / "server.log").open("w+") as log:
            server = subprocess.Popen([BINARY, "--session", SESSION, "server"], env=ENV,
                                      cwd=temp, stdin=subprocess.DEVNULL, stdout=log, stderr=log)
            try:
                def ready():
                    if server.poll() is not None:
                        log.seek(0)
                        raise RuntimeError(log.read())
                    result = subprocess.run([BINARY, "--session", SESSION, "api", "snapshot"],
                                            env=ENV, capture_output=True, timeout=5)
                    return result.returncode == 0

                wait_for(ready)
                a = cli("workspace", "create", "--cwd", str(first), "--label", "before-a", "--no-focus")
                b = cli("workspace", "create", "--cwd", str(second), "--label", "before-b", "--no-focus")
                a_id = a["workspace"]["workspace_id"]
                b_id = b["workspace"]["workspace_id"]
                a_pane = a["root_pane"]["pane_id"]
                b_pane = b["root_pane"]["pane_id"]
                terminal = b["root_pane"]["terminal_id"]
                wait_for(lambda: label_is(a_id, "first-long-name") and label_is(b_id, "second-long-name"))

                moved = cli("pane", "move", b_pane, "--tab", a["tab"]["tab_id"],
                            "--target-pane", a_pane, "--split", "right", "--no-focus")["move_result"]
                assert moved["changed"] and moved["closed_workspace_id"] == b_id
                assert moved["pane"]["terminal_id"] == terminal
                wait_for(lambda: label_is(a_id, "first- · second"))
                assert b_id not in [ws["workspace_id"] for ws in cli("workspace", "list")["workspaces"]]
                print("PASS: cross-space move combines names, preserves terminal, closes empty source")

                separated = cli("pane", "move", moved["pane"]["pane_id"], "--new-workspace",
                                "--label", "before-separated", "--no-focus")["move_result"]
                separated_id = separated["pane"]["workspace_id"]
                wait_for(lambda: label_is(a_id, "first-long-name") and label_is(separated_id, "second-long-name"))
                print("PASS: moving a pane out restores both single-worktree labels")

                same = cli("pane", "split", a_pane, "--direction", "right", "--cwd", str(first), "--no-focus")
                wait_for(lambda: label_is(a_id, "first-long-name"))
                other = cli("pane", "split", a_pane, "--direction", "down", "--cwd", str(second), "--no-focus")
                wait_for(lambda: label_is(a_id, "first- · second"))
                cli("pane", "close", other["pane"]["pane_id"])
                wait_for(lambda: label_is(a_id, "first-long-name"))
                cli("pane", "close", same["pane"]["pane_id"])
                print("PASS: splits deduplicate names and pane close removes the departing worktree")

                # Open the installed picker only in this isolated, headless test session.
                cli("pane", "focus", "--direction", "right", "--pane", a_pane)
                cli("plugin", "action", "invoke", "herdr-arrange.open-tree")
                wait_for(lambda: any(log["status"] == "succeeded" for log in
                                     check_plugin_logs("herdr-arrange") if log.get("action_id") == "open-tree"))
                path = Path.home() / ".config/herdr/sessions" / SESSION / "herdr.sock"
                with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
                    connection.settimeout(5)
                    connection.connect(str(path))
                    connection.sendall(b'{"id":"close-test-popup","method":"popup.close","params":{}}\n')
                    response = json.loads(connection.makefile().readline())
                    assert "error" not in response, response
                print("PASS: installed pane picker opens and closes successfully")
                check_plugin_logs("local.worktree-labels")
            finally:
                stopped = subprocess.run([BINARY, "session", "stop", SESSION, "--json"], env=ENV,
                                         capture_output=True, text=True, timeout=10)
                if stopped.returncode:
                    raise RuntimeError(f"Could not stop test session {SESSION}: {stopped.stderr}")
                server.wait(timeout=10)
                subprocess.run([BINARY, "session", "delete", SESSION, "--json"], env=ENV,
                               check=True, capture_output=True, timeout=10)


if __name__ == "__main__":
    run()
