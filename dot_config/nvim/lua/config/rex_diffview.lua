local client = require("config.rex")
local M = {}
local opening = false

local function file_path()
  local path = vim.api.nvim_buf_get_name(0)
  if vim.bo.buftype ~= "" or path:match("^%a[%w+.-]*://") then return "" end
  return path
end

local function native(kind, args)
  require("lazy").load({ plugins = { "diffview.nvim" } })
  if kind == "history" then
    require("diffview").file_history(nil, args)
  else
    require("diffview").open(args)
  end
end

function M.start(options)
  vim.g.rex_diffview_overlay = true
  local group = vim.api.nvim_create_augroup("user.rex-diffview-overlay", { clear = true })
  vim.api.nvim_create_autocmd("VimResized", {
    group = group,
    callback = function()
      vim.schedule(function()
        -- Rex may deliver the full terminal size after the initial 80-column frame.
        if require("diffview.lib").get_current_view() then vim.cmd("wincmd =") end
      end)
    end,
  })
  vim.api.nvim_create_autocmd("User", {
    group = group,
    pattern = "DiffviewViewClosed",
    callback = function()
      vim.schedule(function()
        if #require("diffview.lib").views == 0 then
          -- Never discard edits made while reviewing.
          local ok, err = pcall(vim.cmd.qa)
          if not ok then vim.notify(err, vim.log.levels.WARN, { title = "Diffview" }) end
        end
      end)
    end,
  })
  native(options.kind, options.args)
end

function M.open_overlay(kind, args, callback)
  kind, args = kind or "diff", args or {}
  local function finish(err, result)
    if err then vim.notify(err, vim.log.levels.ERROR, { title = "Diffview" }) end
    if callback then callback(err, result) end
  end
  if opening then return finish("A Diffview overlay is already opening") end
  for _, buf in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_is_loaded(buf) and vim.bo[buf].buftype == "" and vim.bo[buf].modified then
      return finish("Save or discard changed buffers before opening the external diff; it reviews files on disk")
    end
  end

  local path = file_path()
  local cwd = vim.fn.getcwd()
  local options = vim.json.encode({ kind = kind, args = args })
  local startup = string.format("lua require('config.rex_diffview').start(vim.json.decode(%q))", options)
  local command = {
    vim.v.progpath, "--cmd", "let g:rex_diffview_overlay = v:true", "-c", startup,
  }
  if path ~= "" then vim.list_extend(command, { "--", path }) end

  opening = true
  client.context(function(err, context)
    if err then
      opening = false
      return finish(err)
    end
    local layer = {
      session_id = context.session,
      window_id = context.window,
      bounds = { 0.025, 0.05, 0.95, 0.9 },
      layout = { block = {
        flavor = "com.superlogical.terminal.shell",
        label = kind == "history" and "File history" or "Diffview",
        options = { shell = "none", command = command, cwd = cwd },
      } },
      focus = true,
    }
    client.request({ "api", "call", "session.new_layer", "-" }, function(layer_err, result)
      opening = false
      finish(layer_err, result)
    end, vim.json.encode(layer))
  end)
end

function M.open(kind, args, callback)
  if require("config.neorex").active then return M.open_overlay(kind, args, callback) end
  native(kind or "diff", args or {})
  if callback then callback(nil, { native = true }) end
end

function M.history(args, callback)
  if not args or #args == 0 then
    local path = file_path()
    if path == "" then
      vim.notify("Open a file before requesting its history", vim.log.levels.WARN, { title = "Diffview" })
      return
    end
    args = { path }
  end
  M.open("history", args, callback)
end

function M.close()
  vim.cmd.DiffviewClose()
end

function M.setup()
  vim.api.nvim_create_user_command("RexDiffview", function(opts)
    M.open("diff", opts.fargs)
  end, { nargs = "*", desc = "Open Diffview, using a Rex overlay from NeoRex" })
  vim.api.nvim_create_user_command("RexFileHistory", function(opts)
    M.history(opts.fargs)
  end, { nargs = "*", complete = "file", desc = "Open file history, using a Rex overlay from NeoRex" })
end

return M
