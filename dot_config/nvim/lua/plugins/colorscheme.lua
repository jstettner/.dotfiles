return {
  {
    "rebelot/kanagawa.nvim",
    lazy = false,
    priority = 1000,
    opts = {
      theme = "dragon",
      transparent = true,
      colors = {
        theme = {
          all = {
            ui = {
              bg_gutter = "none",
            },
          },
        },
      },
      overrides = function(colors)
        local palette = colors.palette
        local theme = colors.theme

        return {
          LineNr = { fg = palette.dragonGray },
          CursorLineNr = { fg = palette.carpYellow, bold = true },
          NormalFloat = { fg = theme.ui.fg_dim, bg = theme.ui.bg_m3 },
          FloatBorder = { fg = theme.ui.bg_p2, bg = theme.ui.bg_m3 },
          LazyNormal = { fg = theme.ui.fg_dim, bg = theme.ui.bg_m3 },
          MasonNormal = { fg = theme.ui.fg_dim, bg = theme.ui.bg_m3 },
        }
      end,
    },
    config = function(_, opts)
      require("kanagawa").setup(opts)
      vim.cmd.colorscheme("kanagawa-dragon")
    end,
  },
}
