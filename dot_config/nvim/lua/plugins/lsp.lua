return {
  {
    "mason-org/mason-lspconfig.nvim",
    opts = {
      ensure_installed = {
        "lua_ls",
        "ts_ls",
      },
      automatic_enable = {
        exclude = {
          "ts_ls",
	  "vtsls",
	  "tsgo",
        },
      },
    },
    dependencies = {
      {
        "mason-org/mason.nvim",
	opts = {},
      },
      "neovim/nvim-lspconfig",
    },
  },
}
