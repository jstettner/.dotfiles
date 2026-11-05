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
    init = function() require("config.rex_diffview").setup() end,
    opts = {
      enhanced_diff_hl = true,
      view = {
        default = { winbar_info = true },
        file_history = { winbar_info = true },
      },
    },
    keys = {
      { "<leader>dv", function() require("config.rex_diffview").open() end, desc = "Open diff view" },
      { "<leader>dh", function() require("config.rex_diffview").history() end, desc = "File history" },
      { "<leader>dc", function() require("config.rex_diffview").close() end, desc = "Close diff view" },
    },
  },
}
