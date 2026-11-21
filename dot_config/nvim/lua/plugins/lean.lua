return {
  {
    "Julian/lean.nvim",
    event = { "BufReadPre *.lean", "BufNewFile *.lean" },
    dependencies = {
      "neovim/nvim-lspconfig",
      "nvim-lua/plenary.nvim",
    },
    opts = {
      -- Default keymaps (<LocalLeader>i toggles the infoview, etc.).
      mappings = true,
    },
  },
}
