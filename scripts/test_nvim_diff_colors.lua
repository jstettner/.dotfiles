local colors = require("config.rex_diff_colors")
local original = {
  theme = vim.g.colors_name,
  overlay = vim.g.rex_diffview_overlay,
  truecolor = vim.o.termguicolors,
  background = vim.o.background,
}
local normal = vim.api.nvim_get_hl(0, { name = "Normal" })
local diff_add = vim.api.nvim_get_hl(0, { name = "DiffAdd" })

local function eq(actual, expected)
  assert(vim.deep_equal(actual, expected), vim.inspect({ actual = actual, expected = expected }))
end

local function check(light)
  local expected = {
    DiffviewDiffAdd = light and 194 or 22,
    DiffviewDiffAddAsDelete = light and 224 or 52,
    DiffviewDiffDelete = light and 254 or 235,
    DiffviewDiffChange = light and 254 or 235,
    DiffviewDiffText = light and 229 or 58,
  }
  for group, background in pairs(expected) do
    local highlight = vim.api.nvim_get_hl(0, { name = group, link = false })
    eq(highlight.ctermbg, background)
    assert(not highlight.reverse, group .. " must not invert text")
    assert(not highlight.fg and not highlight.bg, group .. " must not set fixed RGB colors")
    if group ~= "DiffviewDiffDelete" then
      assert(not highlight.ctermfg, group .. " must preserve the syntax/text foreground")
    end
  end
  assert(vim.api.nvim_get_hl(0, { name = "DiffviewDiffText" }).bold)
  eq(vim.api.nvim_get_hl(0, { name = "Normal" }), normal)
  eq(vim.api.nvim_get_hl(0, { name = "DiffAdd" }), diff_add)
end

local ok, err = xpcall(function()
  -- Exercise the palette-only rules without requiring the external NeoRex runtime.
  vim.g.colors_name = nil
  vim.o.background = "dark"
  vim.o.termguicolors = false
  vim.g.rex_diffview_overlay, vim.g.colors_name = true, "neorex"
  normal = vim.api.nvim_get_hl(0, { name = "Normal" })
  diff_add = vim.api.nvim_get_hl(0, { name = "DiffAdd" })
  colors.setup()
  check(false)

  vim.api.nvim_set_hl(0, "DiffviewDiffText", { ctermfg = 3, reverse = true })
  vim.api.nvim_exec_autocmds("ColorScheme", { pattern = "neorex" })
  check(false)

  vim.g.colors_name = nil
  vim.o.background = "light"
  vim.g.colors_name = "neorex"
  normal = vim.api.nvim_get_hl(0, { name = "Normal" })
  diff_add = vim.api.nvim_get_hl(0, { name = "DiffAdd" })
  vim.api.nvim_exec_autocmds("OptionSet", { pattern = "background" })
  check(true)

  for _, outside in ipairs({ "regular", "truecolor", "other-theme" }) do
    vim.g.rex_diffview_overlay = outside ~= "regular"
    vim.o.termguicolors = outside == "truecolor"
    vim.g.colors_name = outside == "other-theme" and "kanagawa" or "neorex"
    vim.api.nvim_set_hl(0, "DiffviewDiffText", { reverse = true })
    colors.apply()
    assert(vim.api.nvim_get_hl(0, { name = "DiffviewDiffText" }).reverse, "must leave " .. outside .. " alone")
  end
  print("PASS: independent light/dark diff tints, normal foregrounds, theme reloads, and scoped overrides")
end, debug.traceback)

vim.api.nvim_del_augroup_by_name("user.rex-diff-colors")
vim.g.colors_name = nil
vim.o.background, vim.o.termguicolors = original.background, original.truecolor
vim.g.colors_name, vim.g.rex_diffview_overlay = original.theme, original.overlay
if not ok then
  vim.api.nvim_err_writeln(err)
  vim.cmd.cquit(1)
end
