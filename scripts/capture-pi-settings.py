"""Snapshot Pi configuration while retaining tracked runtime defaults."""

import json
from pathlib import Path
import sys

# Keep in sync with the keys preserved by dot_pi/agent/modify_settings.json.
RUNTIME_KEYS = ("lastChangelogVersion", "hideThinkingBlock", "defaultThinkingLevel")


def capture(current_path, snapshot_path):
    current = json.loads(current_path.read_text())
    if snapshot_path.exists():
        previous = json.loads(snapshot_path.read_text())
        for key in RUNTIME_KEYS:
            if key in previous:
                current[key] = previous[key]
            else:
                current.pop(key, None)
    snapshot_path.write_text(json.dumps(current, indent=2) + "\n")


if __name__ == "__main__":
    capture(*(Path(arg) for arg in sys.argv[1:]))
