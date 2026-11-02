import contextlib
import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1]
SHIM = SOURCE / "dot_config/rex/annotate/executable_herdr-shim"
spec = importlib.util.spec_from_file_location(
    "rex_herdr_shim", SHIM,
    loader=importlib.machinery.SourceFileLoader("rex_herdr_shim", str(SHIM)),
)
shim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shim)


class RexAnnotateTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            "HERDR_PANE_ID": "block:agent",
            "PLANNOTATOR_TUI_BIN": "/path with spaces/plannotator-tui",
            # The explicit anchor may belong to a different session/tab.
            "REX_SESSION": "session:unrelated",
        }, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.rex = patch.object(shim, "rex").start()
        self.addCleanup(patch.stopall)
        self.rex.return_value = json.dumps({
            "session_id": "session:anchor",
            "block": {"window_id": "window:anchor"},
        })

    def layer_request(self):
        self.assertEqual(self.rex.call_count, 2)
        self.assertEqual(self.rex.call_args.args, (
            "api", "call", "session.new_layer", "-",
        ))
        return json.loads(self.rex.call_args.kwargs["input"])

    def test_default_overlay_is_centered_floating_layer_not_split_or_zoom(self):
        shim.plugin_pane_open([])
        self.assertEqual(self.rex.call_args_list[0].args, (
            "block", "inspect", "block:agent", "--json",
        ))
        request = self.layer_request()
        self.assertEqual(request["session_id"], "session:anchor")
        self.assertEqual(request["window_id"], "window:anchor")
        self.assertEqual(request["bounds"], [0.1, 0.1, 0.8, 0.8])
        self.assertTrue(request["focus"])
        block = request["layout"]["block"]
        self.assertEqual(block["flavor"], "com.superlogical.terminal.shell")
        self.assertEqual(block["label"], "annotate")
        self.assertEqual(block["options"]["shell"], "none")
        self.assertNotIn("cwd", block["options"])
        command = block["options"]["command"]
        self.assertEqual(command[0], "/usr/bin/env")
        self.assertIn("HERDR_ENV=1", command)
        self.assertIn(f"HERDR_BIN_PATH={shim.SHIM}", command)
        self.assertIn(f"REX_BIN_DIR={os.path.dirname(shim.REX)}", command)
        self.assertIn("PLANNOTATOR_TUI_BIN=/path with spaces/plannotator-tui", command)
        self.assertEqual(command[-3:], ["/path with spaces/plannotator-tui", "herdr", "pane"])

    def test_popup_honors_explicit_anchor_cwd_and_handoff_env(self):
        shim.plugin_pane_open([
            "--placement", "popup", "--target-pane", "block:explicit",
            "--cwd", "/project with spaces", "--env", "HANDOFF=/tmp/review file.json",
            "--env", "DELIVER_TO=block:explicit",
        ])
        self.assertEqual(self.rex.call_args_list[0].args[2], "block:explicit")
        options = self.layer_request()["layout"]["block"]["options"]
        self.assertEqual(options["cwd"], "/project with spaces")
        self.assertIn("HANDOFF=/tmp/review file.json", options["command"])
        self.assertIn("DELIVER_TO=block:explicit", options["command"])

    def test_explicit_split_preserves_direction_and_launch_options(self):
        for direction, expected in (
            ("right", "right"), ("left", "left"), ("up", "above"), ("down", "below"),
        ):
            with self.subTest(direction=direction):
                self.rex.reset_mock()
                shim.plugin_pane_open([
                    "--placement", "split", "--direction", direction,
                    "--cwd", "/project", "--env", "HANDOFF=review.json",
                ])
                self.rex.assert_called_once()
                args = self.rex.call_args.args
                self.assertEqual(args[:9], (
                    "split", "-b", "block:agent", "--split", expected,
                    "--focus", "--json", "--label", "annotate",
                ))
                self.assertEqual(args[9:14], ("-c", "/project", "--shell", "none", "--"))
                self.assertIn("HANDOFF=review.json", args)
                self.assertEqual(args[-3:], ("/path with spaces/plannotator-tui", "herdr", "pane"))

    def test_missing_anchor_fails_without_creating_pane(self):
        os.environ.pop("HERDR_PANE_ID")
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            shim.plugin_pane_open([])
        self.rex.assert_not_called()

    def test_detached_anchor_fails_instead_of_opening_in_active_window(self):
        self.rex.return_value = json.dumps({"session_id": "session:anchor", "block": {}})
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit):
            shim.plugin_pane_open([])
        self.assertEqual(self.rex.call_count, 1)
        self.assertIn("not in a window", json.loads(stderr.getvalue())["error"]["message"])

    def test_layer_failure_is_not_retried_as_a_fullscreen_split(self):
        self.rex.side_effect = [self.rex.return_value, SystemExit(1)]
        with self.assertRaises(SystemExit):
            shim.plugin_pane_open([])
        self.assertEqual(self.rex.call_count, 2)
        self.assertEqual(self.rex.call_args.args[2], "session.new_layer")


if __name__ == "__main__":
    unittest.main()
