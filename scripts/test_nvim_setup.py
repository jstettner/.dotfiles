import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1]
CHEZMOI = shutil.which("chezmoi")
SETUP = SOURCE / ".chezmoiscripts/run_onchange_after_setup-nvim.sh.tmpl"
PACKAGES = SOURCE / ".chezmoiscripts/run_onchange_before_install-packages.sh.tmpl"


@unittest.skipUnless(CHEZMOI, "chezmoi is required")
class NvimSetupTests(unittest.TestCase):
    def render(self, path, source=SOURCE, os_name="darwin"):
        result = subprocess.run(
            [
                CHEZMOI, "--config", "/dev/null", "--config-format", "toml",
                "--source", str(source),
                "--override-data", json.dumps({"chezmoi": {"os": os_name}}),
                "execute-template", "--file", str(path),
            ],
            text=True, capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        syntax = subprocess.run(
            ["/bin/bash", "-n"], input=result.stdout, text=True, capture_output=True,
        )
        self.assertEqual(syntax.returncode, 0, syntax.stderr)
        return result.stdout

    def test_package_installer_provides_uv_on_macos_and_linux(self):
        self.assertIn("uv:uv", self.render(PACKAGES))
        self.assertIn("https://astral.sh/uv/install.sh", self.render(PACKAGES, os_name="linux"))

    def run_setup(self, installed=False, uv_exit=0):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            templates = root / ".chezmoitemplates"
            templates.mkdir()
            # Never invoke real tools or download plugins in these tests.
            (templates / "path.sh").write_text('export PATH="$HOME/bin"\n')
            lock = root / "dot_config/nvim/lazy-lock.json"
            lock.parent.mkdir(parents=True)
            lock.write_text("{}\n")
            (root / ".config/nvim").mkdir(parents=True)
            (bin_dir / "cp").symlink_to("/bin/cp")

            def executable(name, body):
                path = bin_dir / name
                path.write_text("#!/bin/bash\n" + body)
                path.chmod(0o755)

            for tool in ("git", "node", "npm", "cc", "tree-sitter"):
                executable(tool, "exit 0\n")
            executable("nvim", 'printf "%s\\n" "$*" >> "$HOME/nvim-calls"\n')
            executable("uv", (
                'printf "%s\\n" "$*" >> "$HOME/uv-calls"\n'
                + f"if [ {uv_exit} -ne 0 ]; then exit {uv_exit}; fi\n"
                + "printf '#!/bin/bash\\nexit 0\\n' > \"$HOME/bin/termaid\"\n"
                + '/bin/chmod +x "$HOME/bin/termaid"\n'
            ))
            if installed:
                executable("termaid", "exit 0\n")

            script = self.render(SETUP, source=root)
            env = dict(os.environ, HOME=str(root))
            result = subprocess.run(
                ["/bin/bash"], input=script, text=True, capture_output=True, env=env,
            )
            calls = (root / "uv-calls").read_text() if (root / "uv-calls").exists() else ""
            nvim_calls = (root / "nvim-calls").read_text() if (root / "nvim-calls").exists() else ""
            if result.returncode == 0:
                self.assertEqual((root / ".config/nvim/lazy-lock.json").read_text(), "{}\n")
                (root / "uv-calls").unlink(missing_ok=True)
                rerun = subprocess.run(
                    ["/bin/bash"], input=script, text=True, capture_output=True, env=env,
                )
                self.assertEqual(rerun.returncode, 0, rerun.stderr)
                self.assertFalse((root / "uv-calls").exists())
            return result, calls, nvim_calls

    def test_installs_renderer_once_and_restores_plugins(self):
        result, calls, nvim_calls = self.run_setup()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, "tool install termaid==0.10.0\n")
        self.assertEqual(nvim_calls.splitlines(), [
            "--headless +qa", "--headless +Lazy! restore +qa",
        ])

    def test_existing_renderer_is_not_changed(self):
        result, calls, _ = self.run_setup(installed=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, "")

    def test_renderer_install_failure_stops_before_plugin_restore(self):
        result, _, nvim_calls = self.run_setup(uv_exit=1)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(nvim_calls, "")


if __name__ == "__main__":
    unittest.main()
