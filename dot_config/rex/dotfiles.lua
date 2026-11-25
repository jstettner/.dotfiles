-- The Rex config this repository manages. init.lua only loads this file, so `leaf rex install`
-- can keep its own block there. See modify_init.lua.

-- leaf reviews in a floating pane over the agent's tab (see ~/.local/bin/leaf-float).
-- The focused pane is the agent: the verdict is sent there as its next message.
local float = os.getenv("HOME") .. "/.local/bin/leaf-float"

local function leaf_float(name, ...)
  local args = { ... }
  return function(ctx)
    if not ctx.block_id or not ctx.session_id then
      error("leaf needs a focused terminal pane", 0)
    end
    if ctx.server then
      -- rex.exec always runs here. Forward the action so leaf, the repository and the
      -- review pane all live on the server that owns the agent's terminal.
      local res, err = rex.server(ctx.server).call("client.action", {
        action = name,
        session_id = ctx.session_id,
        block_id = ctx.block_id,
        origin = "api",
      })
      if not res then
        error(name .. " on " .. ctx.server .. ": " .. err, 0)
      end
      return res.result
    end
    local res, err = rex.exec({ float, "--reply-to", ctx.block_id, (table.unpack or unpack)(args) })
    if not res then
      error("leaf-float: " .. err, 0)
    end
    if not res.ok then
      error("leaf-float: " .. res.stderr, 0)
    end
  end
end

rex.action({
  name = "leaf_float_review",
  title = "Leaf: Review Changes (floating)",
  run = leaf_float("leaf_float_review", "review"),
})
rex.action({
  name = "leaf_float_branch",
  title = "Leaf: Review This Branch (floating)",
  run = leaf_float("leaf_float_branch", "review", "--branch"),
})
rex.action({
  name = "leaf_float_close",
  title = "Leaf: Close Floating Review",
  run = leaf_float("leaf_float_close", "close"),
})

rex.bind("cmd+o", "leaf_float_review")
rex.bind("cmd+shift+o", "leaf_float_branch")

-- Hand a session, its worktree and its pi sessions to a host and back. See teleport.lua.
require("teleport").setup({
  hosts = {
    ["ambral-server"] = { ssh = "ambral-server" },
    -- No ssh there: files go through a Rex port forward.
    ["stet-studio"] = { transport = "rex" },
  },
  repos = {
    ["src/ambral/cerberus"] = { carry = { ".env", ".local" }, setup = "bun install" },
  },
})
