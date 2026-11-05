local M = {}

function M.apply()
  if vim.g.rex_diffview_overlay ~= true or vim.g.colors_name ~= "neorex" or vim.o.termguicolors then return end
  -- Extended ANSI colors keep diff tints independent of Rex's first 16 palette entries.
  local light = vim.o.background == "light"
  local added, removed = light and 194 or 22, light and 224 or 52
  local changed, words = light and 254 or 235, light and 229 or 58
  local groups = {
    DiffviewDiffAdd = { ctermbg = added },
    DiffviewDiffAddAsDelete = { ctermbg = removed },
    DiffviewDiffDelete = { ctermfg = 8, ctermbg = changed },
    DiffviewDiffDeleteDim = { ctermfg = 8, ctermbg = changed },
    DiffviewDiffChange = { ctermbg = changed },
    DiffviewDiffText = { ctermbg = words, bold = true },
  }
  for name, highlight in pairs(groups) do
    vim.api.nvim_set_hl(0, name, highlight)
  end
end

function M.setup()
  local group = vim.api.nvim_create_augroup("user.rex-diff-colors", { clear = true })
  vim.api.nvim_create_autocmd("ColorScheme", { group = group, callback = M.apply })
  vim.api.nvim_create_autocmd("OptionSet", { group = group, pattern = "background", callback = M.apply })
  M.apply()
end

return M
