local function block_under_cursor()
  local buf = vim.api.nvim_get_current_buf()
  local row = vim.api.nvim_win_get_cursor(0)[1] - 1
  for _, block in ipairs(require("mermaid-nvim.scanner").find_blocks(buf)) do
    if row >= block.start_row and row <= block.end_row then
      return block
    end
  end
end

local reveal_id = 0

local function reveal_block(block, preview)
  reveal_id = reveal_id + 1
  local id = reveal_id
  local win = vim.api.nvim_get_current_win()
  local buf = vim.api.nvim_get_current_buf()
  local fence = block.start_row + 1
  vim.api.nvim_win_set_cursor(win, { fence, 0 })
  if not preview then
    vim.cmd("normal! zt")
    return
  end

  local attempts = 0
  local function align()
    if id ~= reveal_id
      or vim.api.nvim_get_current_win() ~= win
      or vim.api.nvim_get_current_buf() ~= buf
      or vim.api.nvim_win_get_cursor(win)[1] ~= fence
    then
      return
    end
    local ns = vim.api.nvim_get_namespaces().mermaid_nvim
    local marks = vim.api.nvim_buf_get_extmarks(
      buf, ns, { block.start_row, 0 }, { block.start_row, -1 }, {}
    )
    -- The renderer is async on a cache miss. Align only after its virtual lines exist.
    if #marks > 0 then
      vim.cmd("normal! zb")
    elseif attempts < 200 then
      attempts = attempts + 1
      vim.defer_fn(align, 25)
    end
  end
  align()
end

return {
  {
    "searleser97/mermaid-nvim",
    ft = "markdown",
    opts = {
      cmd = { "termaid", "--padding-x", "1", "--padding-y", "0", "--gap", "2" },
      preview_mode = "float",
      on_error = "notify",
      highlights = {
        diagram = "Normal",
      },
    },
    keys = {
      { "<leader>mp", "<cmd>MermaidFloat<CR>", ft = "markdown", desc = "Preview Mermaid diagram" },
      {
        "<leader>mt",
        function()
          local block = block_under_cursor()
          local mermaid = require("mermaid-nvim")
          mermaid.toggle_block()
          if block then
            local hidden = mermaid.source_blocks[vim.api.nvim_get_current_buf()] or {}
            reveal_block(block, not hidden[block.start_row])
          end
        end,
        ft = "markdown",
        desc = "Toggle Mermaid diagram",
      },
      {
        "<leader>mr",
        function()
          local block = block_under_cursor()
          vim.cmd.MermaidClear()
          vim.cmd.MermaidRender()
          if block then
            reveal_block(block, true)
          end
        end,
        ft = "markdown",
        desc = "Render Mermaid diagrams",
      },
    },
  },
}
