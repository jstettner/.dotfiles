# Review each phase in Plannotator

At the end of a phase, after the independent review, its fixes and the parent's checks, the human reviews the phase's
diff in Plannotator. Each round of review shows only what changed since the human last reviewed: the round is
committed, and the next review compares against that commit. Once the human approves, the phase's round commits
become one commit.

Skip this and ask for confirmation in the chat when the `plannotator` tool isn't available, the repository isn't Git,
or the human asks not to. Plannotator compares only against a commit that is an ancestor of `HEAD`, so a review that
shows just the new changes needs the round committed.

## Before the phase

Record the phase's starting commit, `phase_start=$(git rev-parse HEAD)`. The first review compares against it.

## Each round

1. **Commit the round.** Stage only the files this phase changed, never the human's unrelated changes or
   `.local/tasks/`, and commit without hooks:

   ```sh
   git add -- <files the phase changed>
   git commit --no-verify -m "wip(review): phase N, round K"
   ```

   `--no-verify` is for these commits only: they are temporary, the parent already ran the checks, and the phase's
   commit (below) runs the hooks.

2. **Close the reviews still open.** `plannotator` `list`, then `close` each review from an earlier round or phase,
   so one review is open at a time. Closing keeps the human's unsent comments as a draft.

3. **Open the review.** `plannotator` `review` with `target` the repository root, `gate: true`, and `options.base`
   the commit the human last reviewed: `phase_start` for round 1, the previous round's commit after that. It shows
   that commit against the working tree, which is exactly this round's changes.

4. **Report and end the turn.** The phase summary names the review's id (`pn-…`), what it compares against (round 1:
   the whole phase; later rounds: changes since the last review), and the manual checks. Then end the turn: the
   decision arrives as a message starting `Plannotator: … (pn-…) — …`.

## The decision

- **Comments:** the implementer fixes them. Run the repository's required typecheck, lint and affected tests again
  in the parent, then start the next round. Comments on an older review's id are about that round's diff, which may
  have changed since.
- **Approve:** squash the phase's rounds into one commit, with the hooks:

  ```sh
  git reset --soft "$phase_start"
  git commit -m "<the phase's real message>"
  ```

  If a hook fails, fix what it reports and commit again; never `--no-verify` this commit. Squash only rounds that
  aren't pushed: `git branch -r --contains <the first round's commit>` prints nothing. Otherwise ask. Then close the
  review and continue with the next phase as the workflow says.
- **Approval in the chat instead:** treat it the same, and close the open review.

## Several phases at once, and resuming

When the human asks for several phases without a pause, review once at the end, with `phase_start` the commit before
the first of them. On approval, squash them into one commit, unless the human asks for one per phase.

When resuming, find the rounds with `git log --format='%H %s' | grep 'wip(review): phase N,'`: `phase_start` is the
first round's parent, and the last round is the commit the human last reviewed.
