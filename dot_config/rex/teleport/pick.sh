#!/usr/bin/env bash
# The teleport action's pop-down: a menu of where to send the session, in a floating pane in that session.
#   pick.sh SESSION BLOCK FROM HUB TITLE TO=NAME...
# FROM is the session's host label, or empty for this Mac. HUB is how to reach the Mac's Rex from the machine this
# runs on, or empty when it is the Mac. Each TO=NAME is a destination for the teleport action and its name in the menu.
set -uo pipefail

session="$1" block="$2" from="$3" hub="$4" title="$5"
shift 5
tos=() names=()
for pair in "$@"; do
  tos+=("${pair%%=*}")
  names+=("${pair#*=}")
done
rex="${REX_BIN_DIR:+$REX_BIN_DIR/}rex"

selected=0
draw() {
  printf '\033[H\033[2J\033[?25l'
  printf '\n  \033[1mTeleport %s to\033[0m\n\n' "$title"
  local i
  for i in "${!names[@]}"; do
    if [ "$i" -eq "$selected" ]; then
      printf '  \033[7m %d  %s \033[0m\n' $((i + 1)) "${names[$i]}"
    else
      printf '   %d  %s\n' $((i + 1)) "${names[$i]}"
    fi
  done
  printf '\n  \033[2m↑↓ choose · enter teleport · esc cancel\033[0m'
}

trap 'printf "\033[?25h"' EXIT
while :; do
  draw
  IFS= read -rsn1 key || exit 1
  case "$key" in
    $'\033')
      # An arrow key, or Esc on its own. macOS's bash 3.2 only waits whole seconds.
      IFS= read -rsn2 -t 1 rest || rest=
      case "$rest" in
        '[A') selected=$(((selected + ${#tos[@]} - 1) % ${#tos[@]})) ;;
        '[B') selected=$(((selected + 1) % ${#tos[@]})) ;;
        '') exit 0 ;;
      esac
      ;;
    k) selected=$(((selected + ${#tos[@]} - 1) % ${#tos[@]})) ;;
    j) selected=$(((selected + 1) % ${#tos[@]})) ;;
    q) exit 0 ;;
    [1-9])
      if [ "$key" -le "${#tos[@]}" ]; then
        selected=$((key - 1))
        break
      fi
      ;;
    '') break ;;
  esac
done

printf '\033[H\033[2J\n  Teleporting %s to %s…\n' "$title" "${names[$selected]}"
args=(session="$session" block="$block" to="${tos[$selected]}" follow=true)
[ -z "$from" ] || args+=(from="$from")
# This pane's REX_SESSION and REX_BLOCK name things on this machine's server, which may not be the Mac's.
if ! out="$(env -u REX_SESSION -u REX_BLOCK "$rex" ${hub:+-S "$hub"} --timeout 15m do teleport "${args[@]}" 2>&1)"; then
  printf '\n  \033[31m%s\033[0m\n\n  \033[2mpress any key to close\033[0m' "${out#Error: }"
  IFS= read -rsn1 _
  exit 1
fi
