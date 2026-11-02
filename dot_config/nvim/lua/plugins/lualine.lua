return {
  {
    "nvim-lualine/lualine.nvim",
    dependencies = {
      "nvim-mini/mini.nvim",
    },
    config = function(_, opts)
      local lualine = require("lualine")
      lualine.setup(opts)
      if opts.options.globalstatus then return end

      -- Lualine's normal refresh skips external windows (win_gettype = popup).
      local pending = false
      local function refresh_external()
        if pending then return end
        pending = true
        vim.schedule(function()
          pending = false
          local current = vim.api.nvim_get_current_win()
          local previous = vim.g.actual_curwin
          vim.g.actual_curwin = current
          for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
            if vim.api.nvim_win_get_config(win).external then
              local line = vim.api.nvim_win_call(win, function()
                return lualine.statusline(win == current)
              end)
              if line then
                vim.api.nvim_set_option_value("statusline", line, { win = win })
              end
            end
          end
          vim.g.actual_curwin = previous
        end)
      end
      local group = vim.api.nvim_create_augroup("neorex_lualine", { clear = true })
      vim.api.nvim_create_autocmd({
        "WinEnter", "WinLeave", "WinNew", "BufEnter", "ModeChanged",
        "CursorMoved", "CursorMovedI", "TextChanged", "TextChangedI", "BufWritePost", "FocusGained",
      }, { group = group, callback = refresh_external })
      refresh_external()
    end,
    opts = {
      options = {
        theme = "auto",
        -- neorex external windows need a statusline per pane.
        globalstatus = vim.v.servername:match("/neorex%-%d+%.nvim%.sock$") == nil,
      },
    },
  },
}
