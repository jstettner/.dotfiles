from pathlib import Path
import os
import runpy
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1]
MODULE = runpy.run_path(str(SOURCE / "modify_dot_zshrc"))
modify = MODULE["modify"]


class LazyNvmTests(unittest.TestCase):
    def test_preserves_local_settings_and_is_idempotent(self):
        for current in ("", "alias local_only='echo hello'", "# local settings\nexport PRIVATE_LOCAL=value\n"):
            with self.subTest(current=current):
                result = modify(current)
                self.assertTrue(result.startswith(current))
                self.assertEqual(modify(result), result)
                syntax = subprocess.run(["zsh", "-n"], input=result, text=True, capture_output=True)
                self.assertEqual(syntax.returncode, 0, syntax.stderr)

    def test_migrates_existing_eager_and_lazy_blocks_in_place(self):
        for previous in (MODULE["EAGER"], MODULE["LOCAL_EAGER"], MODULE["LEGACY_LAZY"], MODULE["LAZY"]):
            with self.subTest(previous=previous):
                prefix = "export BEFORE=local\n\n"
                suffix = "\nalias after='echo local'\n"
                result = modify(prefix + previous + suffix)
                self.assertTrue(result.startswith(prefix + MODULE["BEGIN"]))
                self.assertTrue(result.endswith(MODULE["END"] + "\n" + suffix))
                self.assertEqual(result.count(MODULE["LAZY"]), 1)
                self.assertEqual(modify(result), result)

    @unittest.skipIf(Path("/opt/homebrew/opt/nvm/nvm.sh").exists(), "Homebrew NVM takes precedence")
    def test_local_nvm_loads_only_on_first_node_command(self):
        with tempfile.TemporaryDirectory() as home:
            nvm = Path(home) / ".nvm"
            nvm.mkdir()
            (nvm / "nvm.sh").write_text(
                'print loaded\nfunction node { print "node:$*"; }\n'
            )
            result = subprocess.run(
                ["zsh", "-f"],
                input=modify("") + '\nprint ready\nnode first\nnode second\n',
                env={**os.environ, "HOME": home}, text=True, capture_output=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, "ready\nloaded\nnode:first\nnode:second\n")

    def test_updates_managed_block_without_changing_surroundings(self):
        current = "# before\n" + MODULE["BEGIN"] + "\nobsolete\n" + MODULE["END"] + "\n# after\n"
        result = modify(current)
        self.assertTrue(result.startswith("# before\n"))
        self.assertTrue(result.endswith("# after\n"))
        self.assertNotIn("obsolete", result)

    def test_refuses_ambiguous_or_malformed_initialization(self):
        for current in (
            MODULE["BEGIN"] + "\n",
            MODULE["END"] + "\n",
            modify("") * 2,
            'source "$HOME/.nvm/nvm.sh"\n',
            MODULE["LAZY"] * 2,
        ):
            with self.subTest(current=current), self.assertRaises(ValueError):
                modify(current)


if __name__ == "__main__":
    unittest.main()
