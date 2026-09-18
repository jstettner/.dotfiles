return {
  {
    "nvim-mini/mini.nvim",
    version = "*",
    config = function()
      local icons = require("mini.icons")
      icons.setup()
      icons.mock_nvim_web_devicons()

      require("mini.pick").setup()
      vim.keymap.set("n", "<leader>ff", function()
        MiniPick.builtin.files()
      end, { desc = "Find files" })
      vim.keymap.set("n", "<leader>fg", function()
        MiniPick.builtin.grep_live()
      end, { desc = "Live grep" })
      vim.keymap.set("n", "<leader>fb", function()
        MiniPick.builtin.buffers()
      end, { desc = "Find buffers" })

      require("mini.diff").setup({
        view = {
          style = "sign",
          signs = {
            add = "+",
            change = "~",
            delete = "-",
          },
        },
      })
    end,
  },
}
