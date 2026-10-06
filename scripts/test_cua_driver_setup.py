import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1]
CHEZMOI = shutil.which("chezmoi")


@unittest.skipUnless(CHEZMOI, "chezmoi is required")
class CuaDriverSetupTests(unittest.TestCase):
    def render(self, path, stdin="", os_name="darwin", source=SOURCE):
        return subprocess.run(
            [
                CHEZMOI, "--config", "/dev/null", "--config-format", "toml",
                "--source", str(source),
                "--override-data", json.dumps({"chezmoi": {"os": os_name}}),
                "execute-template", "--with-stdin", "--file", str(path),
            ],
            input=stdin, text=True, capture_output=True,
        )

    def merge(self, current):
        result = self.render(
            SOURCE / "dot_pi/agent/modify_mcp.json", current,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_missing_config_and_server_map(self):
        for current in ("", "{}", '{"autoEnableCodemode": false}'):
            with self.subTest(current=current):
                config = self.merge(current)
                server = config["mcpServers"]["cua-driver"]
                self.assertEqual(server["command"], "cua-driver")
                self.assertEqual(server["args"], ["mcp"])
                if current:
                    for key, value in json.loads(current).items():
                        self.assertEqual(config[key], value)

    def test_preserves_other_servers_credentials_and_top_level_options(self):
        current = {
            "autoEnableCodemode": False,
            "mcpServers": {
                "private": {"url": "https://example.test/mcp", "headers": {
                    "Authorization": "Bearer machine-local-secret",
                }},
                "cua-driver": {"command": "obsolete", "args": ["mcp", "--direct"]},
            },
        }
        merged = self.merge(json.dumps(current))
        self.assertEqual(merged["mcpServers"]["private"], current["mcpServers"]["private"])
        self.assertFalse(merged["autoEnableCodemode"])
        self.assertEqual(merged["mcpServers"]["cua-driver"]["args"], ["mcp"])
        self.assertEqual(self.merge(json.dumps(merged)), merged)

    def test_malformed_config_fails_without_replacing_it(self):
        for current in ("not json", "[]", '{"mcpServers": []}'):
            with self.subTest(current=current):
                result = self.render(SOURCE / "dot_pi/agent/modify_mcp.json", current)
                self.assertNotEqual(result.returncode, 0)

    def test_linux_skips_installer_and_mcp_target(self):
        result = self.render(
            SOURCE / ".chezmoiscripts/run_onchange_before_setup-cua-driver.sh.tmpl",
            os_name="linux",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "")
        result = self.render(SOURCE / ".chezmoiignore", os_name="linux")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(".pi/agent/mcp.json", result.stdout.splitlines())

    def run_installer(self, installed=False, curl_exit=0, install_binary=True):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            templates = root / ".chezmoitemplates"
            templates.mkdir()
            # Isolate PATH so tests never find the real driver or download anything.
            (templates / "path.sh").write_text('export PATH="$HOME/bin"\n')
            curl = bin_dir / "curl"
            payload = "#!/bin/bash\nexit 0\n"
            if install_binary:
                payload = (
                    "#!/bin/bash\n"
                    "printf '#!/bin/bash\\nexit 0\\n' > \"$HOME/bin/cua-driver\"\n"
                    "/bin/chmod +x \"$HOME/bin/cua-driver\"\n"
                )
            curl.write_text(
                '#!/bin/bash\nprintf called > "$HOME/curl-called"\n'
                + f"exit_code={curl_exit}\n"
                + 'if [ "$exit_code" -ne 0 ]; then exit "$exit_code"; fi\n'
                + "printf '%s' "
                + "'" + payload.replace("'", "'\"'\"'") + "'\n"
            )
            curl.chmod(0o755)
            if installed:
                driver = bin_dir / "cua-driver"
                driver.write_text("#!/bin/bash\nexit 0\n")
                driver.chmod(0o755)
            rendered = self.render(
                SOURCE / ".chezmoiscripts/run_onchange_before_setup-cua-driver.sh.tmpl",
                source=root,
            )
            self.assertEqual(rendered.returncode, 0, rendered.stderr)
            syntax = subprocess.run(
                ["/bin/bash", "-n"], input=rendered.stdout, text=True, capture_output=True,
            )
            self.assertEqual(syntax.returncode, 0, syntax.stderr)
            env = dict(os.environ, HOME=str(root))
            result = subprocess.run(
                ["/bin/bash"], input=rendered.stdout, text=True, capture_output=True, env=env,
            )
            called = (root / "curl-called").exists()
            if result.returncode == 0:
                (root / "curl-called").unlink(missing_ok=True)
                rerun = subprocess.run(
                    ["/bin/bash"], input=rendered.stdout, text=True, capture_output=True, env=env,
                )
                self.assertEqual(rerun.returncode, 0, rerun.stderr)
                self.assertFalse((root / "curl-called").exists())
            return result, called

    def test_existing_driver_skips_download(self):
        result, called = self.run_installer(installed=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(called)

    def test_missing_driver_installs_once(self):
        result, called = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(called)

    def test_download_failure_is_fatal(self):
        result, called = self.run_installer(curl_exit=22)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(called)

    def test_missing_binary_after_install_is_fatal(self):
        result, called = self.run_installer(install_binary=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("did not put cua-driver on PATH", result.stderr)
        self.assertTrue(called)


if __name__ == "__main__":
    unittest.main()
