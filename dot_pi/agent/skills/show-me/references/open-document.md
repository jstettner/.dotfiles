# Show the document in a pane

When a workflow finishes writing or updating its document (research, design discussion, outline, plan, PRD, TDD,
`task.md`), show that Markdown file in a Rex pane to the right of the agent, in neorex. Reuse the document pane
already open: the user reads each document in the same place as the workflow moves from one to the next. Don't open
an HTML artifact this way; link it as the visual guidance says.

Skip this outside Rex (`REX_SESSION` unset), or when the user asks not to. Run the steps from the agent's own pane,
with the document's absolute path in `doc`.

1. **Find the document pane.** It is a block in the agent's window, other than the agent's own, whose foreground
   program is neorex:

   ```sh
   window=$(rex block ls -s "$REX_SESSION" --json | jq -r --arg me "$REX_BLOCK" '.blocks[] | select(.block_id == $me) | .window_id')
   for block in $(rex block ls -s "$REX_SESSION" --json | jq -r --arg w "$window" --arg me "$REX_BLOCK" \
       '.blocks[] | select(.window_id == $w and .block_id != $me) | .block_id'); do
     rex block call -s "$REX_SESSION" -b "$block" process | jq -r 'select(.foreground.name == "neorex") | .foreground.pid'
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
   rex split -s "$REX_SESSION" -b "$REX_BLOCK" --split=right --focus=false -c "$repo_root" --json -- "$frontend" "$doc"
   ```

Never type into the editor with `rex send` or `rex send-key`: the user may be mid-edit. If the socket is missing or
`--remote` fails, open a new pane as in step 3 instead. Say in the final answer that the document is open in the pane
to the right.
