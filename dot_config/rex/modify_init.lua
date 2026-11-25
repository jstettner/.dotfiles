#!/usr/bin/env python3
# chezmoi passes the current ~/.config/rex/init.lua on stdin and writes back stdout.
# The managed config lives in dotfiles.lua; init.lua only loads it, plus the block that
# `leaf rex install` adds and rewrites itself (its plugin path, version and UI choice).
# Everything else in the file is replaced.
import re
import sys

HEADER = """\
-- Managed by chezmoi (dot_config/rex/modify_init.lua): edit dotfiles.lua instead.
-- Only the leaf block below is kept from this file; `leaf rex install` maintains it.
require("dotfiles")
"""

current = sys.stdin.read()
leaf = re.search(r"^-- >>> leaf >>>\n.*?^-- <<< leaf <<<\n?", current, re.M | re.S)
sys.stdout.write(HEADER + ("\n" + leaf.group(0).rstrip("\n") + "\n" if leaf else ""))
