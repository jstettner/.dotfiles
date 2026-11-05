local directory = vim.fn.tempname()
local cwd = vim.fn.getcwd()
local ok, err = xpcall(function()
  vim.fn.mkdir(directory, "p")
  local function git(args)
    local command = { "git", "-C", directory, "-c", "core.hooksPath=/dev/null" }
    vim.list_extend(command, args)
    local result = vim.system(command, { text = true }):wait()
    assert(result.code == 0, result.stderr)
  end
  git({ "init", "-q" })
  local path = directory .. "/plan with spaces.md"
  vim.fn.writefile({ "# Before", "", "Old text" }, path)
  git({ "add", "plan with spaces.md" })
  git({ "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial" })
  vim.fn.writefile({ "# After", "", "New text" }, path)
  vim.cmd.cd(vim.fn.fnameescape(directory))
  vim.cmd.edit(vim.fn.fnameescape(path))
  local source = vim.api.nvim_get_current_buf()
  local tab = vim.api.nvim_get_current_tabpage()
  local before = vim.api.nvim_buf_get_lines(source, 0, -1, false)

  vim.api.nvim_feedkeys(vim.keycode("<Space>dv"), "xt", false)
  local lib = require("diffview.lib")
  assert(vim.wait(5000, function()
    local view = lib.get_current_view()
    return view and view.files and view.files:len() == 1
  end, 20), "Diffview did not load the changed Markdown file")
  assert(vim.api.nvim_get_current_tabpage() ~= tab, "diff should use a separate Neovim tab")
  assert(vim.wait(5000, function()
    for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
      if vim.wo[win].diff then return true end
    end
    return false
  end, 20), "no diff window appeared")
  assert(vim.wait(5000, function()
    local headers = {}
    for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do headers[#headers + 1] = vim.wo[win].winbar end
    local text = table.concat(headers, "\n")
    return text:find("INDEX", 1, true) and text:find("WORKING TREE", 1, true)
  end, 20), "before/after revision headers are missing")
  vim.cmd.DiffviewClose()
  assert(vim.api.nvim_get_current_tabpage() == tab, "closing diff did not restore the original tab")
  assert(vim.deep_equal(vim.api.nvim_buf_get_lines(source, 0, -1, false), before), "diff altered the source")

  vim.api.nvim_feedkeys(vim.keycode("<Space>dh"), "xt", false)
  assert(vim.wait(5000, function()
    local view = lib.get_current_view()
    return view and view.ready and view.panel and view.panel.entries
      and #view.panel.entries == 1 and not view.panel.updating
  end, 20), "file history did not finish loading")
  vim.cmd.DiffviewClose()
  assert(vim.api.nvim_get_current_tabpage() == tab)

  for _, key in ipairs({ "<leader>dv", "<leader>dh", "<leader>dc" }) do
    assert(not vim.tbl_isempty(vim.fn.maparg(key, "n", false, true)), "missing mapping " .. key)
  end
  print("PASS: Diffview opens Markdown diffs and file history, closes cleanly, and preserves source")
end, debug.traceback)
vim.cmd.cd(vim.fn.fnameescape(cwd))
vim.fn.delete(directory, "rf")
if not ok then
  vim.api.nvim_err_writeln(err)
  vim.cmd.cquit(1)
end
