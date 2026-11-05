local transport = require("config.rex_feedback.transport")
local M = {}
local draft
local sequence = 0

local function notify(message, level)
  vim.notify(message, level or vim.log.levels.INFO, { title = "Rex feedback" })
end

local function valid(item)
  return draft == item and vim.api.nvim_buf_is_valid(item.buf)
end

local function capture(range)
  local buf = vim.api.nvim_get_current_buf()
  if vim.bo[buf].buftype ~= "" then
    return nil, "Annotate an ordinary file buffer, not a terminal, preview, or diff revision"
  end
  local first = range and range[1] or vim.api.nvim_win_get_cursor(0)[1]
  local last = range and range[2] or first
  local lines
  local mode = vim.fn.mode()
  if not range and (mode == "v" or mode == "V" or mode == "\22") then
    local anchor, cursor = vim.fn.getpos("v"), vim.fn.getpos(".")
    first, last = math.min(anchor[2], cursor[2]), math.max(anchor[2], cursor[2])
    lines = vim.fn.getregion(anchor, cursor, { type = mode })
    vim.cmd.normal({ args = { vim.keycode("<Esc>") }, bang = true })
  else
    lines = vim.api.nvim_buf_get_lines(buf, first - 1, last, false)
  end
  local path = vim.api.nvim_buf_get_name(buf)
  return {
    path = path ~= "" and path or "[unnamed buffer]",
    cwd = vim.fn.getcwd(),
    filetype = vim.bo[buf].filetype,
    first = first,
    last = last,
    text = table.concat(lines, "\n"),
  }
end

local function payload(source, comment)
  local fence_length = 3
  for ticks in source.text:gmatch("`+") do
    fence_length = math.max(fence_length, #ticks + 1)
  end
  local fence = string.rep("`", fence_length)
  local location = source.path .. ":" .. source.first
  if source.last ~= source.first then location = location .. "-" .. source.last end
  return table.concat({
    "Review feedback from Neovim",
    "Source: " .. location,
    "Editor working directory: " .. source.cwd,
    "", "Selected text (buffer snapshot, may include unsaved edits):",
    fence .. source.filetype:gsub("[^%w_-]", ""),
    source.text, fence, "", "Comment:", comment,
  }, "\n")
end

local function failed(item, message, partial)
  item.pending = false
  item.partial = partial
  if valid(item) then
    vim.bo[item.buf].modifiable = true
    vim.bo[item.buf].modified = true
  end
  local remedy = partial
    and " Feedback was pasted but not submitted. Check Pi's input; this draft will not paste again."
    or " Draft kept; use :RexFeedbackResume to reopen it."
  notify(message .. remedy, vim.log.levels.ERROR)
end

local function submit(item, comment)
  transport.targets(function(err, targets)
    if not valid(item) then return end
    if err then return failed(item, err) end
    if #targets == 0 then return failed(item, "No Pi session found in this Rex tab.") end
    local function send(target)
      if not valid(item) then return end
      if not target then return failed(item, "Sending canceled.") end
      transport.send(target, payload(item.source, comment), function(send_err, partial)
        if send_err then return failed(item, send_err, partial) end
        if valid(item) then
          for _, win in ipairs(vim.fn.win_findbuf(item.buf)) do
            vim.api.nvim_win_close(win, true)
          end
          vim.api.nvim_buf_delete(item.buf, { force = true })
        end
        notify("Sent feedback to " .. target.label)
      end)
    end
    if #targets == 1 then return send(targets[1]) end
    vim.ui.select(targets, {
      prompt = "Send feedback to Pi in this Rex tab",
      format_item = function(target)
        return string.format("PID %d · %s · %s · %s", target.pid, target.label, target.block:sub(-8), target.cwd)
          :gsub("%c", " ")
      end,
    }, send)
  end)
end

local function show(item)
  if item.win and vim.api.nvim_win_is_valid(item.win) then
    vim.api.nvim_set_current_win(item.win)
    return
  end
  local width = math.max(1, math.min(100, vim.o.columns - 4))
  local height = math.max(1, math.min(14, vim.o.lines - 6))
  item.win = vim.api.nvim_open_win(item.buf, true, {
    relative = "editor",
    width = width,
    height = height,
    row = math.max(0, math.floor((vim.o.lines - height - 2) / 2)),
    col = math.max(0, math.floor((vim.o.columns - width - 2) / 2)),
    style = "minimal",
    border = "rounded",
    title = " Feedback · " .. vim.fs.basename(item.source.path) .. ":" .. item.source.first .. " ",
    title_pos = "center",
    footer = " :wq send · :q! cancel ",
    footer_pos = "center",
  })
  vim.wo[item.win].wrap = true
  vim.wo[item.win].linebreak = true
  if not item.pending then vim.bo[item.buf].bufhidden = "wipe" end
  vim.cmd.startinsert()
end

function M.resume()
  if not draft or not valid(draft) then return notify("No feedback draft to resume", vim.log.levels.WARN) end
  show(draft)
end

function M.annotate(range)
  if draft and valid(draft) then return M.resume() end
  if not vim.env.REX_SESSION or not vim.env.REX_BLOCK then
    return notify("This editor is not running in a Rex pane", vim.log.levels.ERROR)
  end
  local source, err = capture(range)
  if err then return notify(err, vim.log.levels.ERROR) end
  sequence = sequence + 1
  local buf = vim.api.nvim_create_buf(false, true)
  local item = { buf = buf, source = source }
  draft = item
  vim.bo[buf].buftype = "acwrite"
  vim.bo[buf].bufhidden = "wipe"
  vim.bo[buf].swapfile = false
  vim.bo[buf].undofile = false
  vim.api.nvim_buf_set_name(buf, "rex-feedback://comment/" .. sequence)
  vim.bo[buf].filetype = "markdown"
  vim.api.nvim_create_autocmd("BufWriteCmd", {
    buffer = buf,
    callback = function()
      if item.pending then error("Feedback is already being sent") end
      if item.partial then error("Feedback may already be in Pi's input. Check the target, then discard this draft with :q!") end
      local comment = table.concat(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "\n")
      if vim.trim(comment) == "" then error("Write a comment before sending feedback") end
      item.pending = true
      -- :wq can close the window while target discovery/picking is still running.
      vim.bo[buf].bufhidden = "hide"
      vim.bo[buf].modifiable = false
      vim.bo[buf].modified = false
      vim.schedule(function() submit(item, comment) end)
    end,
  })
  vim.api.nvim_create_autocmd("BufWipeout", {
    buffer = buf,
    once = true,
    callback = function()
      if draft == item then draft = nil end
    end,
  })
  show(item)
end

function M.setup()
  vim.api.nvim_create_user_command("RexFeedback", function(opts)
    M.annotate(opts.range > 0 and { opts.line1, opts.line2 } or nil)
  end, { range = true, desc = "Annotate text and send it to Pi in this Rex tab" })
  vim.api.nvim_create_user_command("RexFeedbackResume", M.resume, { desc = "Resume unsent Rex feedback" })
  vim.keymap.set({ "n", "x" }, "<leader>ac", function() M.annotate() end, { desc = "Annotate selection for Pi" })
end

return M
