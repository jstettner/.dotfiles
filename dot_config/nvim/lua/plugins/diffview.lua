return {
  {
    "sindrets/diffview.nvim",
    cmd = {
      "DiffviewOpen",
      "DiffviewClose",
      "DiffviewFileHistory",
      "DiffviewToggleFiles",
      "DiffviewFocusFiles",
      "DiffviewRefresh",
    },
    opts = {},
    keys = {
      { "<leader>dv", "<cmd>DiffviewOpen<CR>", desc = "Open diff view" },
      { "<leader>dh", "<cmd>DiffviewFileHistory %<CR>", desc = "File history" },
      { "<leader>dc", "<cmd>DiffviewClose<CR>", desc = "Close diff view" },
    },
  },
}
