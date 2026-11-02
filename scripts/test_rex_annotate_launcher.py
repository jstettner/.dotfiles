import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1]
INIT = SOURCE / "dot_config/rex/init.lua"
LAUNCHER = SOURCE / "dot_config/rex/annotate/executable_rex-annotate"
LUA = shutil.which("luajit") or shutil.which("lua")


@unittest.skipUnless(LUA, "Lua interpreter not installed")
class RexAnnotateActionTests(unittest.TestCase):
    def run_lua(self, code):
        result = subprocess.run([LUA, "-", str(INIT)], input="""
            local actions = {}
            rex = {
                action = function(a) actions[a.name] = a.run end,
                bind = function() end,
            }
            dofile(arg[1])
        """ + code, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_remote_actions_run_on_owning_server_not_local_exec(self):
        self.run_lua("""
            rex.exec = function() error("must not execute locally") end
            for _, sub in ipairs({"open", "last", "terminal"}) do
                local called = false
                rex.server = function(server)
                    assert(server == "remote-mac")
                    return { call = function(method, args)
                        called = true
                        assert(method == "client.action")
                        assert(args.action == "annotate_" .. sub)
                        assert(args.session_id == "session:remote")
                        assert(args.block_id == "block:remote")
                        assert(args.server == nil) -- no forwarding loop
                        assert(args.origin == "api")
                        return { result = "opened" }
                    end }
                end
                assert(actions["annotate_" .. sub]({
                    server = "remote-mac", session_id = "session:remote",
                    block_id = "block:remote", origin = "script",
                }) == "opened")
                assert(called)
            end
        """)

    def test_local_actions_still_execute_launcher(self):
        self.run_lua("""
            local called = false
            rex.server = function() error("must not forward local action") end
            rex.exec = function(argv)
                called = true
                assert(argv[1]:match("/%.config/rex/annotate/rex%-annotate$"))
                assert(argv[2] == "last")
                assert(argv[3] == "block:local")
                return { ok = true }
            end
            actions.annotate_last({ session_id = "session:local", block_id = "block:local" })
            assert(called)
        """)

    def test_remote_error_is_reported_without_local_fallback(self):
        self.run_lua("""
            rex.exec = function() error("must not execute locally") end
            rex.server = function()
                return { call = function() return nil, "remote unreachable" end }
            end
            local ok, err = pcall(actions.annotate_last, {
                server = "remote-mac", session_id = "session:remote", block_id = "block:remote",
            })
            assert(not ok)
            assert(err == "rex-annotate last on remote-mac: remote unreachable")
        """)

    def test_missing_launcher_reports_original_error_not_nil_index(self):
        self.run_lua("""
            rex.exec = function() return nil, "launcher missing" end
            local ok, err = pcall(actions.annotate_last, {
                session_id = "session:local", block_id = "block:local",
            })
            assert(not ok)
            assert(err == "rex-annotate last: launcher missing")
        """)

    def test_no_focused_pane_fails_cleanly(self):
        self.run_lua("""
            rex.exec = function() error("must not execute") end
            local ok, err = pcall(actions.annotate_last, {})
            assert(not ok)
            assert(err == "Annotate needs a focused terminal pane")
        """)


class RexAnnotateLauncherTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        rex = self.root / "rex"
        rex.write_text('''#!/bin/sh
printf '%s' "$FAKE_REX_STDOUT"
printf '%s' "$FAKE_REX_STDERR" >&2
exit "$FAKE_REX_STATUS"
''')
        rex.chmod(0o755)
        tui = self.root / "plannotator-tui"
        tui.write_text('''#!/bin/sh
printf '%s\\n' "$PWD" "$HERDR_PANE_ID" "$@" > "$FAKE_TUI_LOG"
''')
        tui.chmod(0o755)
        self.log = self.root / "tui.log"
        self.env = {
            **os.environ,
            "REX_BIN_DIR": str(self.root),
            "PLANNOTATOR_TUI_BIN": str(tui),
            "FAKE_REX_STDOUT": json.dumps({"foreground": {"cwd": str(self.root)}}),
            "FAKE_REX_STDERR": "",
            "FAKE_REX_STATUS": "0",
            "FAKE_TUI_LOG": str(self.log),
        }

    def launch(self):
        return subprocess.run(
            ["bash", str(LAUNCHER), "last", "block:agent"],
            env=self.env, text=True, capture_output=True,
        )

    def test_pane_lookup_failure_stops_before_json_parse_and_tui(self):
        self.env.update({
            "FAKE_REX_STDOUT": "",
            "FAKE_REX_STDERR": 'Error: block target "block:agent" not found',
            "FAKE_REX_STATUS": "1",
        })
        result = self.launch()
        self.assertEqual(result.returncode, 1)
        self.assertIn('block target "block:agent" not found', result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        self.assertNotIn("JSONDecodeError", result.stderr)
        self.assertFalse(self.log.exists())

    def test_invalid_process_json_fails_cleanly(self):
        self.env["FAKE_REX_STDOUT"] = ""
        result = self.launch()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stderr.strip(), "rex-annotate: invalid process info from Rex")
        self.assertFalse(self.log.exists())

    def test_success_preserves_agent_directory_and_pane(self):
        result = self.launch()
        self.assertEqual(result.returncode, 0, result.stderr)
        cwd, pane, *args = self.log.read_text().splitlines()
        self.assertEqual(Path(cwd).resolve(), self.root.resolve())
        self.assertEqual(pane, "block:agent")
        self.assertEqual(args, ["herdr", "last"])


if __name__ == "__main__":
    unittest.main()
