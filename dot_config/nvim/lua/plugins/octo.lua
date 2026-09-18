return {
  {
    "pwntester/octo.nvim",
    cmd = "Octo",
    dependencies = {
      "nvim-lua/plenary.nvim",
    },
    opts = {
      -- Octo does not support mini.pick directly, so use vim.ui.select.
      picker = "default",
      enable_builtin = true,
      -- Show the checked-out working-tree file on the right side of reviews.
      use_local_fs = true,
      reviews = {
        focus = "right",
        auto_show_threads = true,
      },
    },
    keys = {
      {
        "<leader>op",
        "<cmd>Octo pr list<cr>",
        desc = "List GitHub pull requests",
      },
      {
        "<leader>or",
        "<cmd>Octo review<cr>",
        desc = "Start or resume Octo review",
      },
      {
        "<leader>oc",
        "<cmd>Octo review comments<cr>",
        desc = "Review pending comments",
      },
      {
        "<leader>os",
        "<cmd>Octo review submit<cr>",
        desc = "Submit Octo review",
      },
    },
  },
}
