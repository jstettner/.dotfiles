-- plannotator-tui review, ported from Herdr Annotate. See annotate/rex-annotate.
local annotate = os.getenv("HOME") .. "/.config/rex/annotate/rex-annotate"

local function review(sub, ...)
  local extra = { ... }
  return function(ctx)
    -- rex.exec waits, but the launcher returns as soon as the review pane is open.
    local res = rex.exec({ annotate, sub, ctx.block_id, (table.unpack or unpack)(extra) })
    if not res.ok then
      error("rex-annotate " .. sub .. ": " .. res.stderr)
    end
  end
end

rex.action({ name = "annotate_open", title = "Annotate: open here", run = review("open") })
rex.action({ name = "annotate_last", title = "Annotate: agent's last message", run = review("last") })
rex.action({ name = "annotate_terminal", title = "Annotate: terminal output", run = review("terminal") })

rex.bind("cmd+o", "annotate_open")
rex.bind("cmd+shift+o", "annotate_last")
