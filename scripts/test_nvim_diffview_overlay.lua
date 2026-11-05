local original_system, original_notify = vim.system, vim.notify
local neorex = require("config.neorex")
local active = neorex.active
local environment = { vim.env.REX_SESSION, vim.env.REX_BLOCK, vim.env.REX_BIN_DIR }
local bridge = require("config.rex_diffview")
local state
local directory = vim.fn.tempname()
local cwd = vim.fn.getcwd()

local function eq(actual, expected)
  assert(vim.deep_equal(actual, expected), vim.inspect({ actual = actual, expected = expected }))
end

local function wait(predicate)
  assert(vim.wait(5000, predicate, 10), "timed out: " .. vim.inspect(state))
end

vim.system = function(command, opts, callback)
  if vim.fs.basename(command[1]) ~= "rex" then return original_system(command, opts, callback) end
  local args = vim.list_slice(command, 5)
  state.calls[#state.calls + 1] = args
  local output, code, stderr = {}, 0, ""
  if args[1] == "block" and args[2] == "ls" then
    output = { blocks = state.detached and {} or { { block_id = "editor", window_id = "editor-tab" } } }
  elseif args[1] == "api" and args[3] == "session.new_layer" then
    state.layer = vim.json.decode(opts.stdin)
    if state.fail then code, stderr = 1, "layer failed" end
    output = { layer_id = "overlay", block_ids = { "native-nvim" } }
  else
    error("Unexpected Rex request: " .. vim.inspect(command))
  end
  vim.defer_fn(function()
    callback({ code = code, stdout = vim.json.encode(output), stderr = stderr })
  end, 5)
  return {}
end
vim.notify = function(message) state.messages[#state.messages + 1] = message end

local function reset()
  state = { calls = {}, messages = {} }
  neorex.active = true
  vim.env.REX_SESSION, vim.env.REX_BLOCK, vim.env.REX_BIN_DIR = "session", "editor", nil
  vim.bo.modified = false
end

local function launch(kind, args)
  local done, failure, result = false, nil, nil
  bridge.open(kind, args, function(err, value)
    done, failure, result = true, err, value
  end)
  wait(function() return done end)
  return failure, result
end

local ok, err = xpcall(function()
  vim.cmd("enew!")
  local source = vim.api.nvim_get_current_buf()
  local filename = vim.fn.tempname() .. "/plan's spaced name.md"
  vim.api.nvim_buf_set_name(source, filename)
  local tabs = #vim.api.nvim_list_tabpages()

  reset()
  local failure, result = launch("diff", { "origin/main...HEAD" })
  eq(failure, nil)
  eq(result.block_ids, { "native-nvim" })
  eq(state.layer.session_id, "session")
  eq(state.layer.window_id, "editor-tab")
  eq(state.layer.layout.block.options.shell, "none")
  eq(state.layer.layout.block.options.command[1], vim.v.progpath)
  eq(state.layer.layout.split, nil)
  eq(state.layer.layout.block.options.cwd, cwd)
  eq(#vim.api.nvim_list_tabpages(), tabs)
  eq(vim.api.nvim_get_current_buf(), source)
  local command = state.layer.layout.block.options.command
  eq(command[4], "--")
  eq(command[5], vim.api.nvim_buf_get_name(source))
  local startup, saved_start = nil, bridge.start
  bridge.start = function(options) startup = options end
  assert(loadstring(command[3]:gsub("^lua ", "")))()
  bridge.start = saved_start
  eq(startup, { kind = "diff", args = { "origin/main...HEAD" } })
  print("PASS: NeoRex launches one native-Neovim block in its own Rex tab's floating layer")

  reset()
  local history_done = false
  bridge.history(nil, function(history_err) assert(not history_err, history_err); history_done = true end)
  wait(function() return history_done end)
  command = state.layer.layout.block.options.command
  bridge.start = function(options) startup = options end
  assert(loadstring(command[3]:gsub("^lua ", "")))()
  bridge.start = saved_start
  eq(startup.kind, "history")
  eq(startup.args, { vim.api.nvim_buf_get_name(source) })
  print("PASS: file history preserves spaces and quotes without shell or Ex interpolation")

  reset()
  vim.api.nvim_buf_set_lines(source, 0, -1, false, { "unsaved work" })
  failure = launch()
  assert(failure:find("Save or discard", 1, true))
  eq(#state.calls, 0)
  eq(vim.bo.modified, true)
  print("PASS: unsaved source buffers are neither saved nor silently omitted")

  reset()
  state.detached = true
  failure = launch()
  assert(failure:find("no longer", 1, true))
  eq(state.layer, nil)

  reset()
  vim.env.REX_SESSION = nil
  failure = launch()
  assert(failure:find("not running", 1, true))
  eq(#state.calls, 0)

  reset()
  state.fail = true
  failure = launch()
  eq(failure, "layer failed")
  eq(#vim.api.nvim_list_tabpages(), tabs)
  print("PASS: missing context and launch failures never fall back to broken NeoRex splits")

  reset()
  local completed = false
  bridge.open("diff", {}, function(first_err) assert(not first_err, first_err); completed = true end)
  failure = launch()
  assert(failure:find("already opening", 1, true))
  wait(function() return completed end)
  local launches = 0
  for _, args in ipairs(state.calls) do
    if args[1] == "api" then launches = launches + 1 end
  end
  eq(launches, 1)
  print("PASS: repeated keys while launching do not create duplicate overlays")

  -- These children use real Diffview. No Rex RPCs or real agents are involved.
  vim.system, vim.notify = original_system, original_notify
  neorex.active = active
  vim.fn.mkdir(directory, "p")
  local function git(args)
    local command_args = { "git", "-C", directory, "-c", "core.hooksPath=/dev/null" }
    vim.list_extend(command_args, args)
    local child = original_system(command_args, { text = true }):wait()
    eq(child.code, 0)
  end
  git({ "init", "-q" })
  local path = directory .. "/plan with spaces.md"
  vim.fn.writefile({ "# Before" }, path)
  git({ "add", "." })
  git({ "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial" })
  vim.fn.writefile({ "# After" }, path)

  for _, kind in ipairs({ "diff", "history" }) do
    local options = vim.json.encode({ kind = kind, args = kind == "history" and { path } or {} })
    local code = string.format([[
      assert(not require("config.neorex").active)
      require("config.rex_diffview").start(vim.json.decode(%q))
      assert(vim.wait(5000, function()
        local view = require("diffview.lib").get_current_view()
        if %q == "diff" then return view and view.files and view.files:len() == 1 end
        return view and view.ready and view.panel.entries and #view.panel.entries == 1 and not view.panel.updating
      end, 20))
      if require("diffview.lib").get_current_view().files then
        vim.o.columns = 200
        vim.api.nvim_exec_autocmds("VimResized", {})
        assert(vim.wait(1000, function()
          local widths = {}
          for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
            if vim.wo[win].diff then widths[#widths+1] = vim.api.nvim_win_get_width(win) end
          end
          return #widths == 2 and math.abs(widths[1] - widths[2]) <= 1
        end, 20), "diff columns did not rebalance after the terminal grew")
      end
      print("NATIVE_OVERLAY_READY")
      require("config.rex_diffview").close()
    ]], options, kind)
    local child = original_system(
      { vim.v.progpath, "--headless", "-i", "NONE", "-c", "lua " .. code, "--", path },
      { text = true, cwd = directory, timeout = 10000 }
    ):wait()
    eq(child.code, 0)
    assert(child.stderr:find("NATIVE_OVERLAY_READY", 1, true), child.stderr)
    print("PASS: native " .. kind .. " child exits automatically when its final Diffview closes")
  end

  local code = [[
    require("config.rex_diffview").start({kind="diff",args={}})
    assert(vim.wait(5000,function()
      local view=require("diffview.lib").get_current_view()
      return view and view.files and view.files:len()==1
    end,20))
    local path=vim.uv.fs_realpath(vim.fn.argv(0))
    local file=vim.fn.bufnr(path)
    assert(file>0, "working-tree buffer missing")
    vim.api.nvim_buf_set_lines(file,0,-1,false,{"Do not discard this edit"})
    assert(vim.bo[file].modified)
    require("config.rex_diffview").close()
    vim.defer_fn(function()
      assert(vim.bo[file].modified)
      print("UNSAVED_EDIT_PRESERVED")
      vim.cmd("qa!")
    end,100)
  ]]
  local child = original_system(
    { vim.v.progpath, "--headless", "-i", "NONE", "-c", "lua " .. code, "--", path },
    { text = true, cwd = directory, timeout = 10000 }
  ):wait()
  eq(child.code, 0)
  assert(child.stderr:find("UNSAVED_EDIT_PRESERVED", 1, true), child.stderr)
  eq(vim.fn.readfile(path), { "# After" })
  print("PASS: closing the overlay cannot discard edits made during review")
end, debug.traceback)

vim.system, vim.notify = original_system, original_notify
neorex.active = active
vim.env.REX_SESSION, vim.env.REX_BLOCK, vim.env.REX_BIN_DIR = unpack(environment)
vim.fn.delete(directory, "rf")
if not ok then
  vim.api.nvim_err_writeln(err)
  vim.cmd.cquit(1)
end
