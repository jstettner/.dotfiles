#!/bin/sh
# SessionStart hook: print Rex's context for the agent (without its session-naming
# instruction), then name the Rex session after the current git branch.
# Only rex's context goes to stdout: everything printed here reaches the agent.

rex __internal session-start --agent claude --feature-session-naming=false 2>/dev/null

[ -n "$REX_SESSION" ] || exit 0
branch=$(git branch --show-current 2>/dev/null)
[ -n "$branch" ] || exit 0

# nf-dev-git_branch (U+E725)
icon=$(printf '\356\234\245')
rex session rename "$REX_SESSION" "$icon $branch" >/dev/null 2>&1
exit 0
