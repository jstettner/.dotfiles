import copy
from pathlib import Path
import subprocess
import tempfile
import unittest

from labels import HerdrError, checkout, refresh, short_name, workspace_labels


def snapshot():
    return {
        "workspaces": [{"workspace_id": "a", "label": "old-a"},
                       {"workspace_id": "b", "label": "old-b"}],
        "panes": [
            {"workspace_id": "a", "cwd": "/loader", "tab_id": "a:1"},
            {"workspace_id": "a", "cwd": "/loader", "tab_id": "a:1"},
            {"workspace_id": "a", "cwd": "/tailwind", "tab_id": "a:2"},
            {"workspace_id": "b", "cwd": "/notes", "tab_id": "b:1"},
        ],
    }


def resolve(cwd):
    return {"/loader": ("/worktrees/ui-loader-fix", "loader-fix"),
            "/tailwind": ("/worktrees/ui-bench-to-tailwind", "bench-to-tailwind"),
            "/notes": None}[cwd]


class LabelTests(unittest.TestCase):
    def test_short_name(self):
        for branch, expected in [("ui/loader-fix", "loader-fix"),
                                 ("ui/feature/auth", "feature/auth"),
                                 ("main", "main")]:
            with self.subTest(branch=branch):
                self.assertEqual(short_name(branch), expected)

    def test_combines_deduplicates_and_includes_all_tabs(self):
        self.assertEqual(workspace_labels(snapshot(), resolve),
                         {"a": "loader · bench-"})

    def test_one_worktree_across_multiple_panes_keeps_full_name(self):
        data = snapshot()
        data["panes"][2]["cwd"] = "/loader"
        self.assertEqual(workspace_labels(data, resolve), {"a": "ui-loader-fix"})

    def test_distinct_checkouts_with_identical_labels_stay_distinct(self):
        def resolver(cwd):
            return None if cwd == "/notes" else (cwd, "loader-fix")

        self.assertEqual(workspace_labels(snapshot(), resolver),
                         {"a": "loader · loader"})

    def test_matching_six_character_prefixes_stay_distinct(self):
        def resolver(cwd):
            if cwd == "/notes":
                return None
            return cwd, "loader-one" if cwd == "/loader" else "loader-two"

        self.assertEqual(workspace_labels(snapshot(), resolver),
                         {"a": "loader · loader"})

    def test_short_and_exactly_six_character_names_are_not_padded(self):
        def resolver(cwd):
            if cwd == "/notes":
                return None
            return cwd, "ui" if cwd == "/loader" else "second"

        self.assertEqual(workspace_labels(snapshot(), resolver),
                         {"a": "ui · second"})

    def test_resolves_duplicate_cwds_once(self):
        calls = []

        def resolver(cwd):
            calls.append(cwd)
            return resolve(cwd)

        workspace_labels(snapshot(), resolver)
        self.assertEqual(calls, ["/loader", "/tailwind", "/notes"])

    def test_move_out_and_back(self):
        data = snapshot()
        data["panes"][2]["workspace_id"] = "b"
        self.assertEqual(workspace_labels(data, resolve),
                         {"a": "ui-loader-fix", "b": "ui-bench-to-tailwind"})
        data["panes"][2]["workspace_id"] = "a"
        self.assertEqual(workspace_labels(data, resolve),
                         {"a": "loader · bench-"})

    def test_closed_last_pane_and_missing_cwd(self):
        data = snapshot()
        data["panes"] = [{"workspace_id": "a"}]
        self.assertEqual(workspace_labels(data, resolve), {})

    def test_refresh_idempotent_and_ignores_non_git_workspace(self):
        data = snapshot()
        calls = []

        def api(*args):
            if args == ("api", "snapshot"):
                return {"snapshot": copy.deepcopy(data)}
            calls.append(args)
            data["workspaces"][0]["label"] = args[3]
            return {}

        self.assertEqual(len(refresh(api, resolve, False)), 1)
        self.assertEqual(refresh(api, resolve, False), [])
        self.assertEqual(calls, [("workspace", "rename", "a",
                                 "loader · bench-")])
        self.assertEqual(data["workspaces"][1]["label"], "old-b")

    def test_dry_run_does_not_rename(self):
        def api(*args):
            self.assertEqual(args, ("api", "snapshot"))
            return {"snapshot": snapshot()}

        self.assertEqual(len(refresh(api, resolve, True)), 1)

    def test_workspace_disappearing_is_safe_but_other_errors_fail(self):
        for code in ["workspace_not_found", "permission_denied"]:
            def api(*args):
                if args == ("api", "snapshot"):
                    return {"snapshot": snapshot()}
                raise HerdrError({"code": code, "message": "test"})

            if code == "workspace_not_found":
                self.assertEqual(refresh(api, resolve, False), [])
            else:
                with self.assertRaises(HerdrError):
                    refresh(api, resolve, False)


class GitTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="herdr-labels-unit-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = self.root / "project"
        self.git("init", "-b", "main", str(self.repo))
        self.git("-C", str(self.repo), "-c", "user.name=Test", "-c",
                 "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "init")

    def git(self, *args):
        return subprocess.run(["git", *args], check=True, capture_output=True,
                              text=True, timeout=10)

    def test_main_checkout_uses_repo_name(self):
        self.assertEqual(checkout(str(self.repo)), (str(self.repo.resolve()), "project"))

    def test_linked_checkout_uses_short_branch_from_nested_cwd(self):
        worktree = self.root / "ui-loader-fix"
        self.git("-C", str(self.repo), "worktree", "add", "-b", "ui/loader-fix", str(worktree))
        nested = worktree / "src" / "nested"
        nested.mkdir(parents=True)
        self.assertEqual(checkout(str(nested)), (str(worktree.resolve()), "loader-fix"))
        self.git("-C", str(worktree), "branch", "-m", "ui/feature/auth")
        self.assertEqual(checkout(str(nested))[1], "feature/auth")

    def test_single_workspace_uses_same_folder_name_attached_or_detached(self):
        worktree = self.root / "ui-loader-fix"
        self.git("-C", str(self.repo), "worktree", "add", "-b", "ui/loader-fix", str(worktree))
        nested = worktree / "src"
        nested.mkdir()
        data = {"workspaces": [{"workspace_id": "a"}],
                "panes": [{"workspace_id": "a", "cwd": str(nested)}]}
        self.assertEqual(workspace_labels(data, checkout), {"a": "ui-loader-fix"})
        self.git("-C", str(worktree), "checkout", "--detach")
        self.assertEqual(workspace_labels(data, checkout), {"a": "ui-loader-fix"})

    def test_detached_checkout_uses_folder_name(self):
        worktree = self.root / "detached"
        self.git("-C", str(self.repo), "worktree", "add", "--detach", str(worktree))
        self.assertEqual(checkout(str(worktree)), (str(worktree.resolve()), "detached"))

    def test_non_git_and_missing_directories(self):
        self.assertIsNone(checkout(str(self.root)))
        self.assertIsNone(checkout(str(self.root / "missing")))


if __name__ == "__main__":
    unittest.main()
