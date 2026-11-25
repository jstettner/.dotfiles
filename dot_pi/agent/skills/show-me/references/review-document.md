# Review the document in leaf

When a workflow finishes writing or updating its document (research questions, research, design discussion, structure
outline, plan, PRD, TDD or tech design, `task.md`), hand that Markdown file to the user for review in leaf. They comment
on lines or whole sections, remove or replace them, and send one verdict, which arrives as your next message.

This doesn't apply to `progress.md` (implementation reviews each phase's diff instead, as `phase-review.md` says) or to
HTML artifacts (link those as the visual guidance says). During an interview, while you ask one question at a time,
ask the question instead: open the review when the workflow stops to hand the document back, including a workflow's
own review gate partway through, such as a design's first section before the next.

## Open the review

With the document's absolute path in `doc`:

```sh
leaf-float plan "$doc"
```

Use it when `$REX_BLOCK` is set and `leaf-float` is on `PATH`: it opens the review in a floating pane over the agent's
tab, closing the review pane opened before (leaf keeps the user's unsent notes). Otherwise run `leaf plan "$doc"`,
which opens beside you in tmux or Herdr. leaf splits the document into blocks at its headings.

Then end the turn: the final answer gives the saved paths and a brief status, says the document is open for review in
leaf, and names the suggested next `/skill:` command for after approval. Don't wait, sleep, poll or read the pane.

## The verdict

It arrives headed `# Review of <path>: <verdict>`. Each numbered item names a block and, when it's on lines rather than
the whole block, the lines, quoted. A `Global:` note is on the whole document. Line numbers refer to the file as you
submitted it. A **comment** says what to do; **remove** takes that block or passage out; **replace** uses the quoted
text instead.

- **Approved:** the document is accepted. Record the approval where the workflow keeps approvals, and suggest the next
  workflow; never run it automatically.
- **Approved with notes:** apply every item and the `Global:` note, then treat it as approved without another round.
- **Changes requested:** revise the same file, addressing every item and the `Global:` note, then open the review
  again. leaf marks the blocks that changed since the last round and keeps the user's notes on the others.
- **Closed without a verdict:** ask the user how to go on.
- **Feedback in the chat instead:** treat it the same, and run `leaf-float close` if the review pane is still open.

## Without leaf: show it in neorex

When leaf isn't installed but you're in Rex (`$REX_BLOCK` set), show the document in a Rex pane to the right of the
agent, in neorex, reusing the document pane already open, and take feedback in the chat. Outside Rex, skip this and
give the path.

1. **Find the document pane.** It is a block in the agent's window, other than the agent's own, whose foreground
   program is neorex. `rex` commands act on the session holding `$REX_BLOCK`:

   ```sh
   window=$(rex block inspect "$REX_BLOCK" --json | jq -r '.block.window_id')
   for block in $(rex block ls --json | jq -r --arg w "$window" --arg me "$REX_BLOCK" \
       '.blocks[] | select(.window_id == $w and .block_id != $me) | .block_id'); do
     rex block call -b "$block" process | jq -r 'select(.foreground.name == "neorex") | .foreground.pid'
   done
   ```

   Each pid printed is a neorex pane's. If there are several, prefer the one whose label (neorex names a pane after
   its file) is a document in the task directory.

2. **If one is found, switch it to the document.** neorex's Neovim listens on `${TMPDIR%/}/neorex-<pid>.nvim.sock`:

   ```sh
   command nvim --server "${TMPDIR%/}/neorex-$pid.nvim.sock" --remote "$doc"
   ```

   The pane keeps unsaved edits to the file it showed: Neovim's `hidden` keeps that buffer loaded. Don't focus the
   pane.

3. **Otherwise, open one to the right** without taking focus:

   ```sh
   frontend=$(command -v neorex || echo "$HOME/src/neorex/zig-out/bin/neorex")
   [ -x "$frontend" ] || frontend=nvim
   rex split -b "$REX_BLOCK" --split=right --focus=false -c "$repo_root" --json -- "$frontend" "$doc"
   ```

Never type into the editor with `rex send` or `rex send-key`: the user may be mid-edit. If the socket is missing or
`--remote` fails, open a new pane as in step 3 instead. Say in the final answer that the document is open in the pane
to the right.
