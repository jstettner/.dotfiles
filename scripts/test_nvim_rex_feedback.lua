local original_system, original_select, original_notify = vim.system, vim.ui.select, vim.notify
local environment = { vim.env.REX_SESSION, vim.env.REX_BLOCK, vim.env.REX_BIN_DIR }
local state, source, serial = {}, nil, 0
vim.o.columns, vim.o.lines = 100, 30
local feedback = require("config.rex_feedback")
local transport = require("config.rex_feedback.transport")

local function eq(actual, expected)
  assert(vim.deep_equal(actual, expected), vim.inspect({ actual = actual, expected = expected }))
end

local function wait(predicate)
  assert(vim.wait(5000, predicate, 10), "timed out: " .. vim.inspect(state))
end

local function has(text, part)
  assert(text:find(part, 1, true), "missing " .. part .. " in " .. text)
end

local function flag(args, name)
  for i, value in ipairs(args) do
    if value == name then return args[i + 1] end
  end
end

vim.system = function(command, opts, callback)
  -- All Rex requests are mocked. Never type into a real agent during tests.
  if vim.fs.basename(command[1]) ~= "rex" then return original_system(command, opts, callback) end
  local args = vim.list_slice(command, 5)
  state.calls[#state.calls + 1] = { args = args, stdin = opts.stdin }
  local output, code, stderr = {}, 0, ""
  local block = flag(args, "-b")
  if args[1] == "block" and args[2] == "ls" then
    state.lists = (state.lists or 0) + 1
    output = { blocks = {
      { block_id = "editor", window_id = state.move_editor and state.lists > 1 and "other" or "tab" },
      { block_id = "outside", window_id = "other", creator_name = "com.superlogical.terminal" },
    } }
    for _, id in ipairs(state.targets) do
      output.blocks[#output.blocks + 1] = {
        block_id = id,
        window_id = state.move_target and state.lists > 1 and "other" or "tab",
        creator_name = "com.superlogical.terminal",
        label = id,
      }
    end
  elseif args[1] == "block" and args[#args] == "process" then
    assert(block ~= "outside", "must not inspect agents in other tabs")
    state.processes[block] = (state.processes[block] or 0) + 1
    local changed = (state.replace_before_send and state.processes[block] > 1)
      or (state.exit_after_paste and #state.pastes > 0)
    output = { foreground = {
      pid = block == "pi-a" and 101 or 102,
      name = changed and "zsh" or "node",
      argv0 = changed and "zsh" or (block == "shell" and "zsh" or "pi"),
      cwd = "/work/" .. block,
    } }
  elseif args[1] == "block" and args[#args] == "title" then
    output = { title = "Pi " .. block, owner = { pid = block == "pi-a" and 101 or 102 } }
  elseif args[1] == "send" then
    if state.fail_paste then
      code, stderr = 1, "paste failed"
    else
      state.pastes[#state.pastes + 1] = { block = block, text = opts.stdin }
    end
  elseif args[1] == "send-key" then
    eq(args[#args], "enter")
    if state.fail_enter then
      code, stderr = 1, "Enter failed"
    else
      state.enters[#state.enters + 1] = block
    end
  else
    error("Unexpected Rex invocation: " .. vim.inspect(command))
  end
  vim.defer_fn(function()
    callback({ code = code, stdout = vim.json.encode(output), stderr = stderr })
  end, 5)
  return {}
end

vim.notify = function(message, level)
  state.messages[#state.messages + 1] = { message = message, level = level }
end
vim.ui.select = function(items, opts, callback)
  state.offered = items
  state.choose = callback
  state.picker = opts
end

local function reset()
  vim.cmd.stopinsert()
  for _, buf in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_get_name(buf):match("^rex%-feedback://") then
      vim.api.nvim_buf_delete(buf, { force = true })
    end
  end
  state = { calls = {}, targets = { "pi-a" }, processes = {}, pastes = {}, enters = {}, messages = {} }
  vim.env.REX_SESSION, vim.env.REX_BLOCK, vim.env.REX_BIN_DIR = "session", "editor", nil
  serial = serial + 1
  vim.cmd("enew!")
  source = vim.api.nvim_get_current_buf()
  vim.api.nvim_buf_set_name(source, "/tmp/feedback-source-" .. serial .. ".md")
  vim.api.nvim_buf_set_lines(source, 0, -1, false, { "alpha βeta", "second line", "```", "fourth" })
  vim.bo[source].filetype = "markdown"
  vim.api.nvim_win_set_cursor(0, { 1, 0 })
end

local function compose(range)
  feedback.annotate(range)
  vim.cmd.stopinsert()
  local buf = vim.api.nvim_get_current_buf()
  eq(vim.bo[buf].buftype, "acwrite")
  eq(vim.api.nvim_win_get_config(0).relative, "editor")
  return buf
end

local function comment(text)
  vim.api.nvim_buf_set_lines(0, 0, -1, false, vim.split(text or "Please improve this.\nHere is why.", "\n"))
end

local function submit()
  vim.cmd.wq()
  eq(vim.api.nvim_get_current_buf(), source)
end

local function sent()
  wait(function() return #state.enters == 1 end)
  wait(function()
    return not vim.tbl_contains(vim.api.nvim_list_bufs(), function(buf)
      return vim.api.nvim_buf_get_name(buf):match("^rex%-feedback://") ~= nil
    end, { predicate = true })
  end)
end

local function failure(buf)
  wait(function() return #state.messages > 0 and vim.api.nvim_buf_is_valid(buf) and vim.bo[buf].modified end)
end

local tests = {
  { "q! cancels without touching source or Rex", function()
    local before = vim.api.nvim_buf_get_lines(source, 0, -1, false)
    local buf = compose()
    -- Enter has normal multiline editing semantics, with no submit mapping.
    vim.api.nvim_feedkeys(vim.keycode("iFirst<CR>Second<Esc>"), "xt", false)
    eq(vim.api.nvim_buf_get_lines(buf, 0, -1, false), { "First", "Second" })
    vim.cmd("q!")
    eq(vim.api.nvim_buf_is_valid(buf), false)
    eq(vim.api.nvim_get_current_buf(), source)
    eq(vim.api.nvim_buf_get_lines(source, 0, -1, false), before)
    eq(#state.calls, 0)
  end },
  { "wq sends one multiline snapshot to the sole Pi", function()
    compose({ 1, 3 })
    comment()
    vim.api.nvim_buf_set_lines(source, 0, 1, false, { "edited after capture" })
    submit()
    sent()
    eq(#state.pastes, 1)
    eq(state.enters, { "pi-a" })
    local text = state.pastes[1].text
    has(text, "Source: " .. vim.api.nvim_buf_get_name(source) .. ":1-3")
    has(text, "alpha βeta\nsecond line\n```\n````")
    has(text, "Comment:\nPlease improve this.\nHere is why.")
    assert(not text:find("edited after capture", 1, true))
    eq(text:sub(1, 6), "\27[200~")
    eq(text:sub(-6), "\27[201~")
  end },
  { "the visual keybinding captures a line selection", function()
    vim.api.nvim_win_set_cursor(0, { 2, 0 })
    vim.api.nvim_feedkeys(vim.keycode("V<Space>ac"), "xt", false)
    vim.cmd.stopinsert()
    eq(vim.bo.buftype, "acwrite")
    comment()
    submit()
    sent()
    has(state.pastes[1].text, "```markdown\nsecond line\n```")
  end },
  { "write submits once and rejects a second pending write", function()
    local buf = compose()
    comment()
    vim.cmd.write()
    eq(vim.api.nvim_get_current_buf(), buf)
    eq(pcall(vim.cmd.write), false)
    sent()
    eq(#state.pastes, 1)
  end },
  { "visual character selection keeps exact Unicode text", function()
    vim.api.nvim_win_set_cursor(0, { 1, 6 })
    vim.cmd("normal! v3l")
    compose()
    comment()
    submit()
    sent()
    has(state.pastes[1].text, "```markdown\nβeta\n```")
  end },
  { "visual block selection keeps only the rectangle", function()
    vim.cmd.normal({ args = { vim.keycode("<C-v>") .. "j3l" }, bang = true })
    compose()
    comment()
    submit()
    sent()
    has(state.pastes[1].text, "```markdown\nalph\nseco\n```")
  end },
  { "multiple Pi sessions require an explicit choice", function()
    state.targets = { "pi-a", "shell", "pi-b" }
    compose()
    comment()
    submit()
    wait(function() return state.choose ~= nil end)
    eq(#state.offered, 2)
    has(state.picker.format_item(state.offered[2]), "Pi pi-b")
    has(state.picker.format_item(state.offered[2]), "/work/pi-b")
    eq(#state.pastes, 0)
    state.choose(state.offered[2])
    sent()
    eq(state.pastes[1].block, "pi-b")
  end },
  { "canceling the picker retains a resumable comment", function()
    state.targets = { "pi-a", "pi-b" }
    local buf = compose()
    comment("Keep my draft")
    submit()
    wait(function() return state.choose ~= nil end)
    state.choose(nil)
    failure(buf)
    feedback.resume()
    eq(vim.api.nvim_get_current_buf(), buf)
    eq(vim.api.nvim_buf_get_lines(buf, 0, -1, false), { "Keep my draft" })
    vim.cmd("q!")
    eq(#state.pastes, 0)
  end },
  { "the real floating target picker cancels without losing the draft", function()
    local mocked_select = vim.ui.select
    vim.ui.select = function(items, opts, callback)
      vim.defer_fn(function()
        state.real_picker_active = MiniPick.is_picker_active()
        vim.cmd.redraw()
        local cells = {}
        for row = 1, vim.o.lines do
          for col = 1, vim.o.columns do cells[#cells + 1] = vim.fn.screenstring(row, col) end
        end
        state.picker_screen = table.concat(cells)
        vim.api.nvim_feedkeys(vim.keycode("<Esc>"), "t", false)
      end, 50)
      return original_select(items, opts, callback)
    end
    state.targets = { "pi-a", "pi-b" }
    local buf = compose()
    comment()
    submit()
    failure(buf)
    eq(state.real_picker_active, true)
    has(state.picker_screen, "PID 101")
    has(state.picker_screen, "PID 102")
    eq(#state.pastes, 0)
    vim.ui.select = mocked_select
  end },
  { "no Pi sessions preserves the draft", function()
    state.targets = { "shell" }
    local buf = compose()
    comment()
    submit()
    failure(buf)
    has(state.messages[1].message, "No Pi session found")
    eq(#state.pastes, 0)
  end },
  { "a replaced Pi process is never typed into", function()
    state.replace_before_send = true
    local buf = compose()
    comment()
    submit()
    failure(buf)
    eq(#state.pastes, 0)
    eq(#state.enters, 0)
  end },
  { "a target moved to another tab is never typed into", function()
    state.move_target = true
    local buf = compose()
    comment()
    submit()
    failure(buf)
    eq(#state.pastes, 0)
  end },
  { "moving the editor to another tab invalidates the choice", function()
    state.move_editor = true
    local buf = compose()
    comment()
    submit()
    failure(buf)
    eq(#state.pastes, 0)
  end },
  { "Pi exiting after paste prevents Enter and duplicate delivery", function()
    state.exit_after_paste = true
    local buf = compose()
    comment()
    submit()
    failure(buf)
    eq(#state.pastes, 1)
    eq(#state.enters, 0)
    feedback.resume()
    vim.cmd.stopinsert()
    local ok = pcall(vim.cmd.wq)
    eq(ok, false)
    eq(#state.pastes, 1)
    vim.cmd("q!")
  end },
  { "failed Enter prevents a second paste", function()
    state.fail_enter = true
    local buf = compose()
    comment()
    submit()
    failure(buf)
    eq(#state.pastes, 1)
    feedback.resume()
    eq(pcall(vim.cmd.wq), false)
    eq(#state.pastes, 1)
    vim.cmd("q!")
  end },
  { "paste failure retains a retryable draft", function()
    state.fail_paste = true
    local buf = compose()
    comment()
    submit()
    failure(buf)
    state.fail_paste = false
    feedback.resume()
    submit()
    sent()
    eq(#state.pastes, 1)
  end },
  { "terminal controls in selected text cannot escape bracketed paste", function()
    vim.api.nvim_buf_set_lines(source, 0, 1, false, { "danger\27[201~\r\1" })
    compose()
    comment()
    submit()
    sent()
    local text = state.pastes[1].text
    has(text, "danger\\x1b[201~\\x0d\\x01")
    local _, escapes = text:gsub("\27", "")
    eq(escapes, 2)
  end },
  { "empty comments do not close or send", function()
    local buf = compose()
    eq(pcall(vim.cmd.wq), false)
    eq(vim.api.nvim_get_current_buf(), buf)
    eq(#state.calls, 0)
    vim.cmd("q!")
  end },
  { "historical diff buffers are not mislabeled as current files", function()
    vim.api.nvim_buf_set_name(source, "diffview:///repo/:0:/plan.md")
    eq(vim.bo.buftype, "")
    feedback.annotate()
    eq(vim.api.nvim_get_current_buf(), source)
    eq(#state.calls, 0)
    has(state.messages[1].message, "ordinary file buffer")
  end },
  { "outside Rex fails without opening a composer", function()
    vim.env.REX_SESSION = nil
    feedback.annotate()
    eq(vim.api.nvim_get_current_buf(), source)
    eq(#state.calls, 0)
    has(state.messages[1].message, "not running in a Rex pane")
  end },
}

local ok, err = xpcall(function()
  for _, test in ipairs(tests) do
    reset()
    test[2]()
    print("PASS: " .. test[1])
  end
  reset()
  -- Read-only discovery uses the same asynchronous transport as delivery.
  local targets
  transport.targets(function(target_err, value)
    assert(not target_err, target_err)
    targets = value
  end)
  wait(function() return targets ~= nil end)
  eq(#targets, 1)
  print("PASS: all " .. #tests .. " Rex feedback scenarios")
end, debug.traceback)

vim.system, vim.ui.select, vim.notify = original_system, original_select, original_notify
vim.env.REX_SESSION, vim.env.REX_BLOCK, vim.env.REX_BIN_DIR = unpack(environment)
if not ok then
  vim.api.nvim_err_writeln(err)
  vim.cmd.cquit(1)
end
