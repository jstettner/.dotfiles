local client = require("config.rex")
local rex, request = client.run, client.request
local M = {}

local function pi_process(info)
  local process = info.foreground
  if type(process) ~= "table" then return end
  local name = vim.fs.basename(process.argv0 or process.name or "")
  local script = process.script or ""
  if process.pid and (name == "pi" or script:match("/pi%-coding%-agent/dist/cli%.js$")) then
    return process
  end
end

local function blocks(callback)
  client.context(function(err, context, panes)
    callback(err, panes, context and context.window)
  end)
end

function M.targets(callback)
  blocks(function(err, panes, window)
    if err then return callback(err) end
    local candidates = vim.tbl_filter(function(pane)
      return pane.window_id == window
        and pane.block_id ~= vim.env.REX_BLOCK
        and pane.creator_name == "com.superlogical.terminal"
    end, panes)
    local remaining = #candidates
    local targets = {}
    if remaining == 0 then return callback(nil, targets) end
    local function finished()
      remaining = remaining - 1
      if remaining == 0 then
        table.sort(targets, function(a, b) return a.block < b.block end)
        callback(nil, targets)
      end
    end
    for _, pane in ipairs(candidates) do
      request({ "block", "call", "-s", vim.env.REX_SESSION, "-b", pane.block_id, "process" }, function(process_err, info)
        local process = not process_err and pi_process(info)
        if not process then return finished() end
        local target = {
          block = pane.block_id,
          session = vim.env.REX_SESSION,
          window = window,
          pid = process.pid,
          cwd = process.cwd or "",
          label = pane.label or "Pi",
        }
        request({ "block", "call", "-s", target.session, "-b", target.block, "title" }, function(title_err, title)
          if not title_err and title.owner and title.owner.pid == target.pid
            and type(title.title) == "string" and title.title ~= "" then
            target.label = title.title
          end
          targets[#targets + 1] = target
          finished()
        end)
      end)
    end
  end)
end

local function validate(target, callback)
  if target.session ~= vim.env.REX_SESSION then return callback("The Rex session changed; choose a target again") end
  blocks(function(err, panes, window)
    if err then return callback(err) end
    local present = vim.tbl_contains(panes, function(pane)
      return pane.block_id == target.block and pane.window_id == window and window == target.window
    end, { predicate = true })
    if not present then return callback("The selected Pi pane moved or closed") end
    request({ "block", "call", "-s", target.session, "-b", target.block, "process" }, function(process_err, info)
      if process_err then return callback(process_err) end
      local process = pi_process(info)
      if not process or process.pid ~= target.pid then
        return callback("The selected pane is no longer running the same Pi process")
      end
      callback()
    end)
  end)
end

function M.send(target, payload, callback)
  -- A selected file can contain escape sequences, including a bracketed-paste terminator.
  payload = payload:gsub("[%z\1-\8\11-\31\127]", function(char)
    return string.format("\\x%02x", char:byte())
  end)
  validate(target, function(err)
    if err then return callback(err) end
    rex({ "send", "-s", target.session, "-b", target.block }, function(paste_err)
      if paste_err then return callback(paste_err) end
      vim.defer_fn(function()
        -- Do not press Enter into a shell if Pi exited after accepting the paste.
        validate(target, function(check_err)
          if check_err then return callback(check_err, true) end
          rex({ "send-key", "-s", target.session, "-b", target.block, "enter" }, function(enter_err)
            callback(enter_err, enter_err ~= nil)
          end)
        end)
      end, 150)
    end, "\27[200~" .. payload .. "\27[201~")
  end)
end

return M
