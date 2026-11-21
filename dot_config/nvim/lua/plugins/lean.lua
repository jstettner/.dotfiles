return {
  {
    "Julian/lean.nvim",
    event = { "BufReadPre *.lean", "BufNewFile *.lean" },
    -- lean.nvim has no setup(); it reads vim.g.lean_config on load.
    init = function()
      ---@type lean.Config
      vim.g.lean_config = {
        -- Default keymaps (<LocalLeader>i toggles the infoview, etc.).
        mappings = true,
      }
    end,
  },
}
