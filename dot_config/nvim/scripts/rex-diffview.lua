local args = vim.list_slice(arg)
if args[1] == "--help" or args[1] == "-h" then
  io.stdout:write([[
Usage: rex-diffview [REV|RANGE] [-- PATH...]
       rex-diffview --history [PATH...]

Open a native Neovim Diffview in one floating Rex pane in the caller's tab.
Run from the repository/worktree to review. Requires REX_SESSION and REX_BLOCK.

No revision: uncommitted changes, with staged and unstaged entries separate.
HEAD: all uncommitted changes compared with HEAD.
origin/main...HEAD: committed branch changes since the merge base.

Other arguments are forwarded to Diffview unchanged.
Success prints one JSON object with layer_id and block_ids, then exits.
Exit 0 means the reviewer was opened, not that a human approved the changes.
Closing the last Diffview closes the floating pane.

Diffview does not persist viewed-file marks or a last-reviewed checkpoint.
]])
  os.exit(0)
end

local kind = "diff"
if args[1] == "--history" then
  table.remove(args, 1)
  kind = "history"
end
local done, failure, result = false, nil, nil
require("config.rex_diffview").open_overlay(kind, args, function(err, value)
  failure, result, done = err, value, true
end)
if not vim.wait(15000, function() return done end, 10) then
  io.stderr:write("Rex diff launch timed out; inspect Rex before trying again.\n")
  os.exit(1)
end
if failure then os.exit(1) end
io.stdout:write(vim.json.encode(result), "\n")
