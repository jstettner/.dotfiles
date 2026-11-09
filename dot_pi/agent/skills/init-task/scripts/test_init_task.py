"""Isolated integration tests for the task initializer; no model calls."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("init_task.py")


class TaskInitializationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pi-task-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "repo with spaces"
        self.root.mkdir()
        self.git("init", "-q")

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.root), *args],
                              check=True, text=True, capture_output=True).stdout.strip()

    def invoke(self, name="smoke-task", repo=None):
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--repo", str(repo or self.root),
             "--name", name, "--goal", "Trace a greeting function",
             "--scope", "Read-only research; no application changes",
             "--context", "Inspect greet.py and its tests"],
            text=True, capture_output=True,
        )

    def created(self, result):
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["status"], "created")
        return data

    def test_unborn_repo_creates_ignored_task(self):
        data = self.created(self.invoke())
        task = Path(data["taskFile"])
        text = task.read_text()
        for heading in ("## Goal", "## Scope and non-goals", "## Initial context"):
            self.assertIn(heading, text)
        self.assertIn("unborn", text)
        self.assertFalse((self.root / ".gitignore").exists())
        self.assertEqual(self.git("status", "--porcelain"), "")
        self.assertIn("/.local/tasks/", self.git("check-ignore", "-v", str(task)))

    def test_existing_task_preserves_every_byte(self):
        data = self.created(self.invoke())
        task = Path(data["taskFile"])
        task.write_text("User changes must survive\n")
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "exists")
        self.assertEqual(task.read_text(), "User changes must survive\n")
        exclude = Path(data["excludeFile"]).read_text().splitlines()
        self.assertEqual(exclude.count("/.local/tasks/"), 1)

    def test_incomplete_existing_task_is_not_repaired(self):
        task = self.root / ".local/tasks/smoke-task"
        task.mkdir(parents=True)
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "exists")
        self.assertFalse((task / "task.md").exists())

    def test_invalid_names_do_not_mutate_repo(self):
        exclude = self.root / ".git/info/exclude"
        before = exclude.read_bytes()
        for name in ("../escape", "a/b", "Bad Name", "--bad", "a--b", "$(touch pwned)"):
            result = self.invoke(name)
            self.assertNotEqual(result.returncode, 0, name)
        self.assertEqual(exclude.read_bytes(), before)
        self.assertFalse((self.root / ".local").exists())

    def test_subdirectory_resolves_repository_root(self):
        subdir = self.root / "src"
        subdir.mkdir()
        data = self.created(self.invoke(repo=subdir))
        self.assertEqual(Path(data["taskDirectory"]), self.root.resolve() / ".local/tasks/smoke-task")

    def test_local_exclude_preserves_existing_lines(self):
        exclude = self.root / ".git/info/exclude"
        exclude.write_text("# user rule\nprivate-file")
        self.created(self.invoke())
        self.assertEqual(exclude.read_text(), "# user rule\nprivate-file\n/.local/tasks/\n")

    def test_symlink_parent_is_rejected(self):
        outside = Path(self.temp.name) / "outside"
        outside.mkdir()
        (self.root / ".local").symlink_to(outside, target_is_directory=True)
        result = self.invoke()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("symlink", result.stderr)
        self.assertEqual(list(outside.iterdir()), [])

    def test_tracked_task_storage_is_rejected(self):
        existing = self.root / ".local/tasks/existing/task.md"
        existing.parent.mkdir(parents=True)
        existing.write_text("tracked")
        self.git("add", str(existing))
        result = self.invoke()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("tracked files", result.stderr)
        self.assertFalse((existing.parent.parent / "smoke-task").exists())

    def test_override_that_unignores_task_blocks_creation(self):
        (self.root / ".gitignore").write_text("!/.local/tasks/\n")
        result = self.invoke()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / ".local/tasks/smoke-task").exists())

    def test_linked_worktree_uses_common_exclude(self):
        self.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                 "commit", "--allow-empty", "-qm", "Initial")
        worktree = Path(self.temp.name) / "linked worktree"
        self.git("worktree", "add", "-qb", "task-branch", str(worktree))
        data = self.created(self.invoke(repo=worktree))
        self.assertEqual(Path(data["taskDirectory"]), worktree.resolve() / ".local/tasks/smoke-task")
        self.assertEqual(Path(data["excludeFile"]), self.root.resolve() / ".git/info/exclude")
        status = subprocess.run(["git", "-C", str(worktree), "status", "--porcelain"],
                                check=True, capture_output=True, text=True)
        self.assertEqual(status.stdout, "")

    def test_non_git_directory_fails_without_creation(self):
        outside = Path(self.temp.name) / "not a repo"
        outside.mkdir()
        result = self.invoke(repo=outside)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(list(outside.iterdir()), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
