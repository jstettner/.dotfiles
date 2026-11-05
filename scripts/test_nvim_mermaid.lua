local ok, err = xpcall(function()
  vim.o.lines = 20
  vim.o.columns = 100
  vim.cmd.enew()
  local buf = vim.api.nvim_get_current_buf()
  local lines = { "# Mermaid viewport regression" }
  for i = 1, 30 do
    lines[#lines + 1] = "Before diagram " .. i
  end
  lines[#lines + 1] = "```mermaid"
  local fence = #lines
  lines[#lines + 1] = "graph LR"
  lines[#lines + 1] = "A[START_LABEL] --> B[END_LABEL]"
  for i = 1, 30 do
    lines[#lines + 1] = "%% comment " .. i
  end
  lines[#lines + 1] = "```"
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.bo[buf].filetype = "markdown"

  local ns = vim.api.nvim_get_namespaces().mermaid_nvim
  local function rendered()
    return #vim.api.nvim_buf_get_extmarks(buf, ns, 0, -1, {}) > 0
  end
  assert(vim.wait(5000, rendered, 20), "initial rendering timed out")

  local function screen()
    vim.cmd.redraw()
    local cells = {}
    for row = 1, vim.api.nvim_win_get_height(0) do
      for col = 1, vim.o.columns do
        cells[#cells + 1] = vim.fn.screenstring(row, col)
      end
      cells[#cells + 1] = "\n"
    end
    return table.concat(cells)
  end

  local function press(key)
    vim.api.nvim_feedkeys(vim.keycode("<Space>" .. key), "xt", false)
  end

  local function move_to_block_end()
    vim.api.nvim_win_set_cursor(0, { #lines - 1, 0 })
    vim.cmd("normal! zz")
  end

  local function assert_visible()
    assert(vim.wait(5000, function()
      return rendered() and screen():find("START_LABEL", 1, true) ~= nil
    end, 20), "inline diagram is still off-screen")
    local visible = screen()
    assert(visible:find("END_LABEL", 1, true), "inline diagram is clipped unexpectedly")
    assert(vim.api.nvim_win_get_cursor(0)[1] == fence, "cursor should be at the opening fence")
  end

  move_to_block_end()
  assert(not screen():find("START_LABEL", 1, true), "fixture should start with the diagram off-screen")
  press("mt")
  assert(not rendered(), "toggle should hide inline rendering")
  assert(screen():find("graph LR", 1, true), "hiding should reveal the source")
  press("mt")
  assert_visible()

  move_to_block_end()
  press("mt")
  assert(not rendered(), "toggle should hide the diagram again")
  move_to_block_end()
  press("mr")
  assert_visible()

  -- Exercise async rendering, not just the renderer's cached callback.
  require("mermaid-nvim.cache").clear()
  press("mt")
  move_to_block_end()
  press("mr")
  assert_visible()

  require("mermaid-nvim.cache").clear()
  press("mt")
  move_to_block_end()
  press("mr")
  vim.api.nvim_win_set_cursor(0, { 1, 0 })
  assert(vim.wait(5000, rendered, 20), "background rendering timed out")
  vim.wait(100, function() return false end, 10)
  assert(vim.api.nvim_win_get_cursor(0)[1] == 1, "async rendering stole the cursor after navigation")
  assert(vim.deep_equal(vim.api.nvim_buf_get_lines(buf, 0, -1, false), lines), "shortcuts changed source text")

  print("PASS: Mermaid toggle/refresh reveal inline output without stealing the cursor after navigation")
end, debug.traceback)

if not ok then
  vim.api.nvim_err_writeln(err)
  vim.cmd.cquit(1)
end
