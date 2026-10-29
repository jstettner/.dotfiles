"""Snapshot Hex's dictation processing, the only part of its settings chezmoi manages."""

import json
from pathlib import Path
import sys


def capture(current_path, snapshot_path):
    dictation_processing = json.loads(current_path.read_text())["dictation_processing"]
    snapshot_path.write_text(json.dumps(dictation_processing, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    capture(*(Path(arg) for arg in sys.argv[1:]))
