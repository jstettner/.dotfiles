import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1]
NVIM = shutil.which("nvim")
LAUNCHER = SOURCE / "dot_local/bin/executable_rex-diffview"


@unittest.skipUnless(NVIM, "Neovim is required")
class RexDiffviewCliTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        config = self.root / "config/nvim"
        (config / "lua/config").mkdir(parents=True)
        (config / "scripts").mkdir()
        for name in ("rex.lua", "rex_diffview.lua"):
            shutil.copyfile(SOURCE / "dot_config/nvim/lua/config" / name, config / "lua/config" / name)
        shutil.copyfile(SOURCE / "dot_config/nvim/scripts/rex-diffview.lua", config / "scripts/rex-diffview.lua")
        (config / "init.lua").write_text('error("API launcher must not load user plugins")\n')
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        mock = bin_dir / "rex"
        mock.write_text(
            f"#!{sys.executable}\n"
            "import json, os, sys\n"
            "args = sys.argv[4:]\n"
            "if args[:2] == ['block', 'ls']:\n"
            "    print(json.dumps({'blocks': [{'block_id': 'caller', 'window_id': 'caller-tab'}]}))\n"
            "elif args == ['api', 'call', 'session.new_layer', '-']:\n"
            "    payload = json.load(sys.stdin)\n"
            "    with open(os.environ['MOCK_REX_LOG'], 'w') as log: json.dump(payload, log)\n"
            "    if os.environ.get('FAIL_LAYER'):\n"
            "        print('layer failed', file=sys.stderr)\n"
            "        sys.exit(1)\n"
            "    print(json.dumps({'layer_id': 'layer:review', 'block_ids': ['block:review'], 'revision': 1}))\n"
            "else:\n"
            "    raise RuntimeError(repr(args))\n"
        )
        mock.chmod(0o755)
        self.repo = self.root / "worktree with spaces"
        self.repo.mkdir()
        self.log = self.root / "request.json"
        self.env = dict(
            os.environ,
            XDG_CONFIG_HOME=str(self.root / "config"),
            REX_BIN_DIR=str(bin_dir),
            REX_SESSION="session",
            REX_BLOCK="caller",
            MOCK_REX_LOG=str(self.log),
        )

    def run_cli(self, *args, env=None):
        return subprocess.run(
            ["/bin/sh", str(LAUNCHER), *args],
            cwd=self.repo, env=env or self.env, text=True, capture_output=True, timeout=20,
        )

    def options(self):
        payload = json.loads(self.log.read_text())
        command = payload["layout"]["block"]["options"]["command"]
        self.assertEqual(command[1:3], ["--cmd", "let g:rex_diffview_overlay = v:true"])
        startup = command[command.index("-c") + 1]
        prefix = "lua require('config.rex_diffview').start(vim.json.decode("
        self.assertTrue(startup.startswith(prefix))
        self.assertTrue(startup.endswith("))"))
        # These arguments contain no control characters; Lua %q and JSON share the escaping used here.
        options = json.loads(json.loads(startup[len(prefix):-2]))
        return payload, options

    def test_help_does_not_require_rex_or_load_user_config(self):
        env = dict(self.env)
        env.pop("REX_SESSION", None)
        result = self.run_cli("--help", env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Usage: rex-diffview", result.stdout)
        self.assertFalse(self.log.exists())

    def test_diff_returns_json_and_preserves_range_and_path_arguments(self):
        args = ["origin/main...HEAD", "--", "docs/plan with spaces.md"]
        result = self.run_cli(*args)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {
            "layer_id": "layer:review", "block_ids": ["block:review"], "revision": 1,
        })
        payload, options = self.options()
        self.assertEqual(options, {"kind": "diff", "args": args})
        self.assertEqual(payload["window_id"], "caller-tab")
        self.assertEqual(payload["layout"]["block"]["options"]["cwd"], str(self.repo.resolve()))
        self.assertNotIn("split", payload["layout"])
        self.assertEqual(result.stderr, "")

    def test_history_preserves_quotes_without_shell_interpolation(self):
        result = self.run_cli("--history", "src/odd'name.md")
        self.assertEqual(result.returncode, 0, result.stderr)
        _, options = self.options()
        self.assertEqual(options, {"kind": "history", "args": ["src/odd'name.md"]})

    def test_missing_context_fails_without_creating_a_layer(self):
        env = dict(self.env)
        env.pop("REX_BLOCK", None)
        result = self.run_cli(env=env)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("not running in a Rex pane", result.stderr)
        self.assertFalse(self.log.exists())

    def test_rpc_failure_is_nonzero_and_never_prints_success_json(self):
        result = self.run_cli(env=dict(self.env, FAIL_LAYER="1"))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("layer failed", result.stderr)


if __name__ == "__main__":
    unittest.main()
