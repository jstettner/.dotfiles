-- plannotator-tui review, ported from Herdr Annotate. See annotate/rex-annotate.
local annotate = os.getenv("HOME") .. "/.config/rex/annotate/rex-annotate"

local function review(sub, ...)
  local extra = { ... }
  return function(ctx)
    if not ctx.block_id or not ctx.session_id then
      error("Annotate needs a focused terminal pane", 0)
    end
    if ctx.server then
      -- rex.exec always runs here. Forward the action so the launcher, transcripts,
      -- and review pane all live on the server that owns the agent's terminal.
      local res, err = rex.server(ctx.server).call("client.action", {
        action = "annotate_" .. sub,
        session_id = ctx.session_id,
        block_id = ctx.block_id,
        origin = "api",
      })
      if not res then
        error("rex-annotate " .. sub .. " on " .. ctx.server .. ": " .. err, 0)
      end
      return res.result
    end
    -- rex.exec waits, but the launcher returns as soon as the review pane is open.
    local res, err = rex.exec({ annotate, sub, ctx.block_id, (table.unpack or unpack)(extra) })
    if not res then
      error("rex-annotate " .. sub .. ": " .. err, 0)
    end
    if not res.ok then
      error("rex-annotate " .. sub .. ": " .. res.stderr, 0)
    end
  end
end

rex.action({ name = "annotate_open", title = "Annotate: open here", run = review("open") })
rex.action({ name = "annotate_last", title = "Annotate: agent's last message", run = review("last") })
rex.action({ name = "annotate_terminal", title = "Annotate: terminal output", run = review("terminal") })

rex.bind("cmd+o", "annotate_open")
rex.bind("cmd+shift+o", "annotate_last")
