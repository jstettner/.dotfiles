from pathlib import Path
import os
import runpy
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1]
MODULE = runpy.run_path(str(SOURCE / "modify_dot_zshrc"))
modify = MODULE["modify"]
modify_nvm = MODULE["modify_nvm"]
modify_starship = MODULE["modify_starship"]


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
                result = modify_nvm(prefix + previous + suffix)
                self.assertTrue(result.startswith(prefix + MODULE["BEGIN"]))
                self.assertTrue(result.endswith(MODULE["END"] + "\n" + suffix))
                self.assertEqual(result.count(MODULE["LAZY"]), 1)
                self.assertEqual(modify_nvm(result), result)

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
        result = modify_nvm(current)
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


class StarshipTests(unittest.TestCase):
    def test_appends_block_once(self):
        result = modify("alias local_only='echo hello'\n")
        self.assertEqual(result.count(MODULE["STARSHIP"]), 1)
        self.assertTrue(result.endswith(MODULE["STARSHIP_END"] + "\n"))
        self.assertEqual(modify(result), result)

    def test_migrates_existing_init_line_in_place(self):
        for line in ('eval "$(starship init zsh)"\n', 'eval "$(starship init zsh)"'):
            with self.subTest(line=line):
                prefix = "export BEFORE=local\n"
                suffix = "alias after='echo local'\n" if line.endswith("\n") else ""
                result = modify_starship(prefix + line + suffix)
                self.assertTrue(result.startswith(prefix + MODULE["STARSHIP_BEGIN"]))
                self.assertTrue(result.endswith(MODULE["STARSHIP_END"] + "\n" + suffix))
                self.assertEqual(result.count("starship init zsh"), 1)

    def test_updates_managed_block_without_changing_surroundings(self):
        current = "# before\n" + MODULE["STARSHIP_BEGIN"] + "\nobsolete\n" + MODULE["STARSHIP_END"] + "\n# after\n"
        result = modify_starship(current)
        self.assertTrue(result.startswith("# before\n"))
        self.assertTrue(result.endswith("# after\n"))
        self.assertNotIn("obsolete", result)

    def test_ignores_commented_init(self):
        result = modify_starship('# eval "$(starship init zsh)"\n')
        self.assertTrue(result.startswith('# eval "$(starship init zsh)"\n' + MODULE["STARSHIP_BEGIN"]))

    def test_refuses_ambiguous_or_malformed_initialization(self):
        for current in (
            MODULE["STARSHIP_BEGIN"] + "\n",
            MODULE["STARSHIP_END"] + "\n",
            modify_starship("") * 2,
            'eval "$(starship init zsh)"\n' * 2,
            'eval "$(starship init zsh --print-full-init)"\n',
        ):
            with self.subTest(current=current), self.assertRaises(ValueError):
                modify_starship(current)

    def test_skips_init_when_starship_is_missing(self):
        result = subprocess.run(
            ["zsh", "-f"], input=modify_starship("") + "print ready\n",
            env={**os.environ, "PATH": "/usr/bin:/bin"}, text=True, capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "ready\n")


if __name__ == "__main__":
    unittest.main()
