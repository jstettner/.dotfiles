# Review each phase in leaf

At the end of a phase, after the independent review, its fixes and the parent's checks, the human reviews the phase's
diff in leaf. Each round of review shows only what changed since the human last reviewed: the round is committed, and
the next review shows the commits since the one the human last reviewed. Once the human approves, the phase's round
commits become one commit.

Skip this and ask for confirmation in the chat when `leaf` isn't installed, the repository isn't Git, or the human asks
not to. Use `leaf-float` when `$REX_BLOCK` is set and it's on `PATH`: it opens the review in a floating pane over this
tab. Otherwise use `leaf review` with the same arguments, which opens beside you in Rex, tmux or Herdr.

## Before the phase

Record the phase's starting commit, `phase_start=$(git rev-parse HEAD)`. The first review starts from it.

## Each round

1. **Commit the round.** Stage only the files this phase changed, never the human's unrelated changes or
   `.local/tasks/`, and commit without hooks:

   ```sh
   git add -- <files the phase changed>
   git commit --no-verify -m "wip(review): phase N, round K"
   ```

   `--no-verify` is for these commits only: they are temporary, the parent already ran the checks, and the phase's
   commit (below) runs the hooks.

2. **Open the review**, from the repository root, with `<last>` the commit the human last reviewed: `phase_start` for
   round 1, the previous round's commit after that:

   ```sh
   leaf-float review --range "<last>..HEAD"
   ```

   A range shows only committed work, so the human's uncommitted edits stay out of it. `leaf-float` also closes the
   review pane of an earlier round or phase, so one review is open at a time; leaf keeps the human's unsent notes.

3. **Report and end the turn.** The phase summary says what the review compares against (round 1: the whole phase;
   later rounds: changes since the last review) and lists the manual checks. Then end the turn. Don't wait, sleep,
   poll or read the review pane: the verdict arrives as your next message, headed
   `# Review of <last>..HEAD: <verdict>`.

## The verdict

The review numbers its notes, grouped by file, with an optional `Global:` note on the whole change. "Old side" and
"new side" line numbers refer to the files before and after the round.

- **Changes requested:** the implementer addresses every numbered item and any `Global:` note. Run the repository's
  required typecheck, lint and affected tests again in the parent, then start the next round. A review headed with an
  older range is about that round's diff, which may have changed since.
- **Approved with notes:** apply every numbered item, run the checks again, and commit it as one more round without
  opening another review. Then squash as for approval.
- **Approved:** squash the phase's rounds into one commit, with the hooks:

  ```sh
  git reset --soft "$phase_start"
  git commit -m "<the phase's real message>"
  ```

  If a hook fails, fix what it reports and commit again; never `--no-verify` this commit. Squash only rounds that
  aren't pushed: `git branch -r --contains <the first round's commit>` prints nothing. Otherwise ask. Then continue
  with the next phase as the workflow says.
- **Closed without a verdict:** ask the human how to go on.
- **Approval in the chat instead:** treat it the same, and run `leaf-float close` to close the open review.

## Several phases at once, and resuming

When the human asks for several phases without a pause, review once at the end, with `phase_start` the commit before
the first of them. On approval, squash them into one commit, unless the human asks for one per phase.

When resuming, find the rounds with `git log --format='%H %s' | grep 'wip(review): phase N,'`: `phase_start` is the
first round's parent, and the last round is the commit the human last reviewed.
