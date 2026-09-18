local parsers = {
  "bash",
  "css",
  "html",
  "javascript",
  "json",
  "jsonc",
  "lua",
  "markdown",
  "markdown_inline",
  "tsx",
  "typescript",
  "vim",
  "vimdoc",
}

local filetypes = {
  "css",
  "html",
  "javascript",
  "javascriptreact",
  "json",
  "jsonc",
  "lua",
  "markdown",
  "sh",
  "typescript",
  "typescriptreact",
  "vim",
}

return {
  {
    "nvim-treesitter/nvim-treesitter",
    lazy = false,
    build = ":TSUpdate",

    config = function()
      require("nvim-treesitter").install(parsers)

      vim.api.nvim_create_autocmd("FileType", {
        group = vim.api.nvim_create_augroup("user.treesitter", {
          clear = true,
        }),
        pattern = filetypes,
        callback = function(event)
          vim.treesitter.start(event.buf)
        end,
      })
    end,
  }
}
