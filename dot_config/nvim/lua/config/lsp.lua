-- Use Neovim's built-in completion UI for every attached language server.
vim.opt.completeopt = { "menuone", "noinsert", "popup" }

vim.api.nvim_create_autocmd("LspAttach", {
  group = vim.api.nvim_create_augroup("user.lsp", { clear = true }),
  callback = function(event)
    local client = assert(vim.lsp.get_client_by_id(event.data.client_id))

    if client:supports_method("textDocument/completion") then
      vim.lsp.completion.enable(true, client.id, event.buf, {
        autotrigger = true,
      })
    end
    vim.keymap.set("n", "gd", vim.lsp.buf.definition, {
      buffer = event.buf,
      desc = "LSP: Go to definition",
    })
    vim.keymap.set("i", "<C-Space>", vim.lsp.completion.get, {
      buffer = event.buf,
      desc = "Trigger LSP completion",
    })
    vim.keymap.set("n", "gl", function()
      vim.diagnostic.open_float({ scope = "cursor" })
    end, {
      buffer = event.buf,
      desc = "LSP: Show line diagnostics",
    })
  end,
})

vim.lsp.enable("typescript_native")
