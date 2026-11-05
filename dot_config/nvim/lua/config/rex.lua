local M = {}

function M.run(args, callback, stdin)
  local executable = vim.env.REX_BIN_DIR and (vim.env.REX_BIN_DIR .. "/rex") or "rex"
  local command = { executable, "--autostart=false", "--timeout", "5s" }
  vim.list_extend(command, args)
  local ok, err = pcall(vim.system, command, { text = true, stdin = stdin, timeout = 7000 }, function(result)
    vim.schedule(function()
      if result.code ~= 0 then
        callback(vim.trim(result.stderr or "") ~= "" and vim.trim(result.stderr) or "Rex request failed")
      else
        callback(nil, result.stdout)
      end
    end)
  end)
  if not ok then
    vim.schedule(function() callback(tostring(err)) end)
  end
end

function M.request(args, callback, stdin)
  M.run(args, function(err, output)
    if err then return callback(err) end
    local ok, data = pcall(vim.json.decode, output, { luanil = { object = true } })
    if not ok or type(data) ~= "table" then
      return callback("Rex returned invalid JSON")
    end
    callback(nil, data)
  end, stdin)
end

function M.context(callback)
  if not vim.env.REX_SESSION or not vim.env.REX_BLOCK then
    return callback("This editor is not running in a Rex pane")
  end
  local session, origin = vim.env.REX_SESSION, vim.env.REX_BLOCK
  M.request({ "block", "ls", "-s", session, "--json" }, function(err, data)
    if err then return callback(err) end
    for _, block in ipairs(data.blocks or {}) do
      if block.block_id == origin and block.window_id then
        return callback(nil, { session = session, block = origin, window = block.window_id }, data.blocks)
      end
    end
    callback("The editor's Rex pane is no longer in this session")
  end)
end

return M
