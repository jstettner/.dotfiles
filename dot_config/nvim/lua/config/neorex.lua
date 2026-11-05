local M = {}

-- neorex starts its Neovim server with this socket name.
local in_neorex = vim.v.servername:match("/neorex%-%d+%.nvim%.sock$") ~= nil
local runtime = vim.fn.expand("~/src/neorex/runtime")
M.active = in_neorex
M.enabled = (in_neorex or vim.g.rex_diffview_overlay == true)
  and vim.fn.filereadable(runtime .. "/colors/neorex.lua") == 1
if M.enabled then
  vim.opt.rtp:append(runtime)
  -- The native TUI needs ANSI palette colors; NeoRex renders cterm colors itself.
  if not in_neorex then vim.opt.termguicolors = false end
end

return M
