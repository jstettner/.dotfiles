#!/usr/bin/env bash
# The per-machine half of the teleport action in ../teleport.lua. On this Mac it runs directly. On a host, that
# host's Rex runs it (the teleport_helper action, with this file on stdin): its git may have to fetch from GitHub,
# and only processes in the logged-in session can read the keychain that holds the credentials, which ssh can't.
#
#   teleport.sh hello                                  this machine's home, and a fresh cache folder
#   teleport.sh info CWD                               the git worktree CWD is in
#   teleport.sh pack WORKTREE ID BUNDLE [CARRY...]     bundle a snapshot of it, and list the CARRY paths it has
#   teleport.sh unpack REPO WORKTREE ID BRANCH BUNDLE  check out the bundle's snapshot at WORKTREE, both under ~
#   teleport.sh panes PID...                           the pi sessions running as these PIDs
#   teleport.sh dirs PATH...                           which of these directories exist
#   teleport.sh drop PATH...                           remove these files from the cache
#
# A host whose transport is rex has no ssh, so files reach it through an rsync daemon there, which the Mac reaches
# through a Rex port forward:
#
#   teleport.sh serve                                  on the host: start the daemon, serving ~ as the module home
#   teleport.sh unserve DIR                            on the host: stop it
#   teleport.sh forward REX LABEL SESSION PORT         on the Mac: forward a local port to the host's PORT, with
#                                                      the daemon's secret on stdin
#   teleport.sh unforward DIR                          on the Mac: stop the forward
#
# Output is KEY=VALUE lines, one value per line, for the Lua side to read.
set -euo pipefail

# Rex runs actions with its bare environment.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cache="$HOME/.cache/rex-teleport"

die() {
  printf '%s\n' "$*" >&2
  exit 1
}

# A path relative to ~, which is how the two machines agree on where things are.
home_rel() {
  case "$1" in
    "$HOME"/*) printf '%s\n' "${1#"$HOME"/}" ;;
    *) die "$1 is outside your home folder, so it has no place on the other machine" ;;
  esac
}

# The main checkout that owns a worktree's .git.
main_repo() {
  local common
  common="$(git -C "$1" rev-parse --path-format=absolute --git-common-dir)"
  [ "$(basename "$common")" = .git ] || die "$1 belongs to a bare repository, which teleport doesn't handle"
  dirname "$common"
}

# The worktree at $1's index and working tree as trees, in index_tree and work_tree, without touching either. The
# working tree's goes through a scratch index, so untracked files are in it and ignored ones aren't.
snapshot() {
  index_tree="$(git -C "$1" write-tree)" || return 1
  local scratch
  scratch="$(mktemp)"
  cp "$(git -C "$1" rev-parse --path-format=absolute --git-path index)" "$scratch"
  GIT_INDEX_FILE="$scratch" git -C "$1" add -A
  work_tree="$(GIT_INDEX_FILE="$scratch" git -C "$1" write-tree)"
  rm -f "$scratch"
}

cmd_hello() {
  mkdir -p "$cache"
  # Bundles and pi session copies are only needed until the teleport they're for finishes.
  find "$cache" -type f -mtime +7 -delete
  echo "home=$HOME"
}

cmd_info() {
  local top
  top="$(git -C "$1" rev-parse --show-toplevel 2>/dev/null)" || die "$1 isn't in a git worktree"
  echo "top=$top"
  echo "worktree=$(home_rel "$top")"
  echo "repo=$(home_rel "$(main_repo "$top")")"
  echo "branch=$(git -C "$top" symbolic-ref -q --short HEAD || true)"
  echo "home=$HOME"
}

cmd_pack() {
  local top="$1" id="$2" bundle="$3"
  shift 3
  cd "$top"
  local path
  for path in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD rebase-merge rebase-apply; do
    [ ! -e "$(git rev-parse --git-path "$path")" ] || die "$top is in the middle of a merge, rebase, or cherry-pick; finish it first"
  done

  # The index and the working tree each become a commit on HEAD.
  local head index_tree work_tree
  head="$(git rev-parse --verify -q HEAD)" || die "$top has no commits"
  snapshot "$top" || die "$top has unresolved conflicts; resolve them first"
  export GIT_AUTHOR_NAME=teleport GIT_AUTHOR_EMAIL=teleport@localhost
  export GIT_COMMITTER_NAME=teleport GIT_COMMITTER_EMAIL=teleport@localhost
  local ref="refs/teleport/$id"
  git update-ref "$ref/index" "$(git commit-tree -p "$head" -m "teleport: index" "$index_tree")"
  git update-ref "$ref/worktree" "$(git commit-tree -p "$head" -m "teleport: worktree" "$work_tree")"
  # What this worktree handed off, so that a teleport back here can tell whether anything changed since.
  git update-ref refs/worktree/teleport/sent-index "$ref/index"
  git update-ref refs/worktree/teleport/sent "$ref/worktree"

  # What origin has, the other machine can fetch, so the bundle holds only what's local.
  mkdir -p "$(dirname "$bundle")"
  if git remote get-url origin >/dev/null 2>&1; then
    git bundle create -q "$bundle" "$ref/index" "$ref/worktree" --not --remotes=origin
  else
    git bundle create -q "$bundle" "$ref/index" "$ref/worktree"
  fi
  git update-ref -d "$ref/index"
  git update-ref -d "$ref/worktree"

  echo "head=$head"
  for path in "$@"; do
    [ ! -e "$path" ] || echo "carry=$path"
  done
}

cmd_unpack() {
  local repo="$HOME/$1" wt="$HOME/$2" id="$3" branch="$4" bundle="$5"
  local ref="refs/teleport/$id"
  [ -d "$repo/.git" ] || die "$repo isn't a git checkout here"
  # The bundle is based on origin's commits as the other machine last saw them.
  git -C "$repo" bundle verify -q "$bundle" >/dev/null 2>&1 || git -C "$repo" fetch -q origin
  git -C "$repo" fetch -q --no-tags "$bundle" "+$ref/*:$ref/*"
  rm -f "$bundle"
  local head stamp
  head="$(git -C "$repo" rev-parse "$ref/index^")"
  stamp="$(date +%Y%m%d-%H%M%S)"

  # Never lose what's here: a branch that has moved on is kept under another name, and local changes are stashed.
  if [ -n "$branch" ]; then
    local old
    if old="$(git -C "$repo" rev-parse --verify -q "refs/heads/$branch")" &&
      ! git -C "$repo" merge-base --is-ancestor "$old" "$head"; then
      git -C "$repo" branch "teleport-backup/$branch-$stamp" "$old"
      echo "note=$branch had commits the teleported one doesn't; kept them as teleport-backup/$branch-$stamp"
    fi
  fi

  if [ -e "$wt" ]; then
    [ "$(git -C "$wt" rev-parse --show-toplevel 2>/dev/null)" = "$wt" ] || die "$wt exists but isn't a git worktree"
    [ "$(main_repo "$wt")" = "$repo" ] || die "$wt is a worktree of another repository"
    # Changes still exactly as this worktree handed them off are in what's arriving, or were superseded there.
    local index_tree work_tree unchanged=
    if snapshot "$wt" 2>/dev/null &&
      [ "$index_tree" = "$(git -C "$wt" rev-parse -q --verify refs/worktree/teleport/sent-index^{tree})" ] &&
      [ "$work_tree" = "$(git -C "$wt" rev-parse -q --verify refs/worktree/teleport/sent^{tree})" ]; then
      unchanged=1
    fi
    if [ -n "$unchanged" ]; then
      # refs/worktree/teleport/sent still holds them.
      git -C "$wt" reset -q --hard
      git -C "$wt" clean -q -fd
    elif [ -n "$(git -C "$wt" status --porcelain --untracked-files=all)" ]; then
      git -C "$wt" stash push -q -u -m "teleport: $wt before $stamp" || die "couldn't stash the changes in $wt"
      echo "note=$wt had changes since it was teleported away; stashed them as \"teleport: $wt before $stamp\""
    fi
    if [ -n "$branch" ]; then
      git -C "$wt" checkout -q -B "$branch" "$head"
    else
      git -C "$wt" checkout -q --detach "$head"
    fi
  else
    mkdir -p "$(dirname "$wt")"
    if [ -n "$branch" ]; then
      git -C "$repo" worktree add -q -B "$branch" "$wt" "$head"
    else
      git -C "$repo" worktree add -q --detach "$wt" "$head"
    fi
  fi

  # The working tree's files, then the index as it was staged.
  git -C "$wt" read-tree --reset -u "$ref/worktree^{tree}"
  git -C "$wt" read-tree "$ref/index^{tree}"
  git -C "$repo" update-ref -d "$ref/index"
  git -C "$repo" update-ref -d "$ref/worktree"
}

# The pi extension (~/.pi/agent/extensions/teleport.ts) records each pi process under ~/.pi/agent/teleport/pids.
# A pi that hasn't saved its session yet, because nothing has been said, is listed as fresh instead.
cmd_panes() {
  local pid record file
  for pid in "$@"; do
    record="$HOME/.pi/agent/teleport/pids/$pid.json"
    if [ -f "$record" ] && kill -0 "$pid" 2>/dev/null; then
      file="$(sed -n 's/.*"file":"\([^"]*\)".*/\1/p' "$record")"
      if [ -n "$file" ] && [ -f "$file" ]; then
        printf 'pi=%s %s\n' "$pid" "$(tr -d '\n' <"$record")"
      else
        printf 'fresh=%s %s\n' "$pid" "$(tr -d '\n' <"$record")"
      fi
    fi
  done
}

cmd_dirs() {
  local path
  for path in "$@"; do
    if [ -d "$path" ]; then
      echo "dir=$path"
    fi
  done
}

cmd_drop() {
  local path
  for path in "$@"; do
    case "$path" in
      "$cache"/*) rm -f "$path" ;;
      *) die "won't remove $path: it isn't in $cache" ;;
    esac
  done
}

# A daemon on 127.0.0.1 only, which only the forward reaches, and only with this teleport's secret. It stops itself
# after a while in case the Mac never says so.
cmd_serve() {
  local dir secret port i
  secret="$(od -An -tx1 -N16 /dev/urandom | tr -d ' \n')"
  dir="$(mktemp -d "${TMPDIR:-/tmp}/rex-teleport.XXXXXX")"
  (umask 077 && printf 'teleport:%s\n' "$secret" >"$dir/secrets")
  cat >"$dir/rsyncd.conf" <<EOF
pid file = $dir/pid
[home]
  path = $HOME
  read only = false
  use chroot = false
  munge symlinks = false
  list = false
  auth users = teleport
  secrets file = $dir/secrets
  hosts allow = 127.0.0.1
EOF
  for i in 1 2 3 4 5 6 7 8 9 10; do
    port=$((20000 + RANDOM % 40000))
    rsync --daemon --address=127.0.0.1 --port="$port" --config="$dir/rsyncd.conf" --log-file="$dir/log" \
      </dev/null >/dev/null 2>&1 || true
    sleep 0.3
    if [ -f "$dir/pid" ] && /usr/sbin/lsof -nP -a -p "$(cat "$dir/pid")" -iTCP@127.0.0.1:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      (sleep 7200 && cmd_unserve "$dir" watchdog) </dev/null >/dev/null 2>&1 &
      echo $! >"$dir/watchdog"
      echo "dir=$dir"
      echo "port=$port"
      echo "secret=$secret"
      return
    fi
    [ ! -f "$dir/pid" ] || kill "$(cat "$dir/pid")" 2>/dev/null || true
    rm -f "$dir/pid"
  done
  cat "$dir/log" >&2 2>/dev/null || true
  rm -rf "$dir"
  die "couldn't start an rsync daemon"
}

cmd_unserve() {
  local dir="$1" by="${2:-}" watchdog=
  case "$dir" in
    "${TMPDIR:-/tmp}"/rex-teleport.*) ;;
    *) die "$dir isn't a teleport daemon's folder" ;;
  esac
  [ ! -f "$dir/pid" ] || kill "$(cat "$dir/pid")" 2>/dev/null || true
  [ ! -f "$dir/watchdog" ] || watchdog="$(cat "$dir/watchdog")"
  rm -rf "$dir"
  # The watchdog's sleep, and then the watchdog, unless it's the one stopping the daemon.
  if [ -n "$watchdog" ] && [ "$by" != watchdog ]; then
    pkill -P "$watchdog" 2>/dev/null || true
    kill "$watchdog" 2>/dev/null || true
  fi
}

cmd_forward() {
  local rex="$1" label="$2" session="$3" port="$4" dir i listen
  dir="$(mktemp -d "${TMPDIR:-/tmp}/rex-teleport.XXXXXX")"
  (umask 077 && cat >"$dir/secret")
  "$rex" -S "$label" -v forward new ${session:+-s "$session"} -L "127.0.0.1:0:127.0.0.1:$port" \
    </dev/null >"$dir/log" 2>&1 &
  echo $! >"$dir/pid"
  for i in $(seq 1 100); do
    listen="$(sed -n '/forwarding listen=/{s/.*forwarding listen=127\.0\.0\.1:\([0-9]*\) .*/\1/p;q;}' "$dir/log")"
    if [ -n "$listen" ]; then
      echo "dir=$dir"
      echo "port=$listen"
      return
    fi
    kill -0 "$(cat "$dir/pid")" 2>/dev/null || break
    sleep 0.1
  done
  local log
  log="$(cat "$dir/log")"
  cmd_unforward "$dir"
  die "couldn't forward a port to $label: $log"
}

# Interrupted, a forward closes its blocks on the host. Killed, it would leave them behind.
cmd_unforward() {
  local dir="$1" pid i
  case "$dir" in
    "${TMPDIR:-/tmp}"/rex-teleport.*) ;;
    *) die "$dir isn't a teleport forward's folder" ;;
  esac
  if [ -f "$dir/pid" ]; then
    pid="$(cat "$dir/pid")"
    kill -INT "$pid" 2>/dev/null || true
    for i in $(seq 1 30); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.1
    done
    kill "$pid" 2>/dev/null || true
  fi
  rm -rf "$dir"
}

command="${1:?usage: teleport.sh hello|info|pack|unpack|panes|dirs|drop|serve|unserve|forward|unforward ...}"
shift
case "$command" in
  hello | info | pack | unpack | panes | dirs | drop | serve | unserve | forward | unforward) "cmd_$command" "$@" ;;
  *) die "teleport.sh: unknown command $command" ;;
esac
