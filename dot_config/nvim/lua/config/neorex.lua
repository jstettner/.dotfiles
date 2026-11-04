local M = {}

-- neorex starts its Neovim server with this socket name.
local in_neorex = vim.v.servername:match("/neorex%-%d+%.nvim%.sock$") ~= nil
local runtime = vim.fn.expand("~/src/neorex/runtime")
M.enabled = in_neorex and vim.fn.filereadable(runtime .. "/colors/neorex.lua") == 1
if M.enabled then
  vim.opt.rtp:append(runtime)
end

return M
