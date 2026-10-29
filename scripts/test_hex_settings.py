import importlib.util
import json
from pathlib import Path
import runpy
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1]
modify = runpy.run_path(
    str(SOURCE / "private_Library" / "private_Application Support" / "voice-control" / "modify_settings.json")
)["modify"]
spec = importlib.util.spec_from_file_location(
    "capture_hex_settings", Path(__file__).with_name("capture-hex-settings.py")
)
capture_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture_module)

PROCESSING = {
    "default_mode": {"name": "Global", "replacements": [{"matched_phrase": "tilde", "output": "~"}]},
    "modes": [],
}


class HexSettingsTests(unittest.TestCase):
    def test_replaces_only_dictation_processing_and_keeps_key_order(self):
        current = json.dumps(
            {"microphone": "Wireless Mic Rx", "dictation_processing": {"modes": ["old"]}, "ui_language": None},
            indent=2,
        )
        result = modify(current, PROCESSING)
        self.assertEqual(list(json.loads(result)), ["microphone", "dictation_processing", "ui_language"])
        self.assertEqual(json.loads(result)["microphone"], "Wireless Mic Rx")
        self.assertEqual(json.loads(result)["dictation_processing"], PROCESSING)
        self.assertEqual(modify(result, PROCESSING), result)

    def test_unchanged_settings_stay_byte_identical(self):
        current = json.dumps({"dictation_processing": PROCESSING, "note": "café"}, indent=2, ensure_ascii=False)
        self.assertEqual(modify(current, PROCESSING), current)

    def test_missing_settings_are_left_for_hex_to_create(self):
        self.assertEqual(modify("", PROCESSING), "")

    def test_capture_round_trips_through_modify(self):
        with tempfile.TemporaryDirectory() as directory:
            current_path = Path(directory) / "settings.json"
            snapshot_path = Path(directory) / "snapshot.json"
            current = json.dumps({"microphone": "Built-in", "dictation_processing": PROCESSING}, indent=2)
            current_path.write_text(current)
            capture_module.capture(current_path, snapshot_path)
            self.assertEqual(json.loads(snapshot_path.read_text()), PROCESSING)
            self.assertEqual(modify(current, json.loads(snapshot_path.read_text())), current)


if __name__ == "__main__":
    unittest.main()
