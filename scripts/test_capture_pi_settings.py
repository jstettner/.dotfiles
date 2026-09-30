import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "capture_pi_settings", Path(__file__).with_name("capture-pi-settings.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CapturePiSettingsTests(unittest.TestCase):
    def capture(self, current, previous=None):
        with tempfile.TemporaryDirectory() as directory:
            current_path = Path(directory) / "current.json"
            snapshot_path = Path(directory) / "snapshot.json"
            current_path.write_text(json.dumps(current))
            if previous is not None:
                snapshot_path.write_text(json.dumps(previous))
            module.capture(current_path, snapshot_path)
            first = snapshot_path.read_text()
            module.capture(current_path, snapshot_path)
            self.assertEqual(snapshot_path.read_text(), first)
            self.assertEqual(json.loads(current_path.read_text()), current)
            return json.loads(first)

    def test_runtime_changes_are_ignored_but_configuration_is_captured(self):
        previous = {
            "lastChangelogVersion": "0.87.1",
            "hideThinkingBlock": False,
            "defaultThinkingLevel": "xhigh",
            "packages": ["npm:pi-powerline-footer"],
        }
        current = {
            "lastChangelogVersion": "0.99.1",
            "hideThinkingBlock": True,
            "defaultThinkingLevel": "medium",
            "packages": ["git:github.com/nicobailon/pi-powerline-footer"],
            "powerline": {"preset": "default"},
        }
        expected = dict(current)
        expected.update({key: previous[key] for key in module.RUNTIME_KEYS})
        self.assertEqual(self.capture(current, previous), expected)

    def test_new_runtime_keys_do_not_enter_existing_snapshot(self):
        self.assertEqual(
            self.capture({"theme": "dark", "hideThinkingBlock": True}, {"theme": "light"}),
            {"theme": "dark"},
        )

    def test_missing_current_runtime_keys_retain_tracked_defaults(self):
        self.assertEqual(
            self.capture({"theme": "dark"}, {"defaultThinkingLevel": "xhigh"}),
            {"theme": "dark", "defaultThinkingLevel": "xhigh"},
        )

    def test_first_capture_retains_initial_runtime_defaults(self):
        current = {"theme": "dark", "defaultThinkingLevel": "medium"}
        self.assertEqual(self.capture(current), current)


if __name__ == "__main__":
    unittest.main()
