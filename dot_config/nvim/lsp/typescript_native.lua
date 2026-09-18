-- Use the project-local native server for TypeScript 7 (including Effect
-- patches), and typescript-language-server for older TypeScript projects.
return {
  cmd = function(dispatchers, config)
    local package_path = vim.fs.joinpath(config.root_dir, "node_modules", "typescript", "package.json")
    local package = vim.json.decode(table.concat(vim.fn.readfile(package_path), "\n"))
    local major = tonumber(package.version:match("^(%d+)"))

    if major and major >= 7 then
      local tsc = vim.fs.joinpath(config.root_dir, "node_modules", ".bin", "tsc")
      return vim.lsp.rpc.start({ tsc, "--lsp", "--stdio" }, dispatchers)
    end

    return vim.lsp.rpc.start({ "typescript-language-server", "--stdio" }, dispatchers)
  end,

  -- TypeScript watches a virtual `bundled:///libs` URI that Neovim 0.12
  -- cannot parse as a filesystem glob. Disable only dynamic file watchers.
  capabilities = {
    workspace = {
      didChangeWatchedFiles = {
        dynamicRegistration = false,
      },
    },
  },

  filetypes = {
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact",
  },

  root_dir = function(bufnr, on_dir)
    local root = vim.fs.root(bufnr, {
      "bun.lock",
      "bun.lockb",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      ".git",
    })

    if not root then
      return
    end

    local tsc = vim.fs.joinpath(root, "node_modules", ".bin", "tsc")
    local package_path = vim.fs.joinpath(root, "node_modules", "typescript", "package.json")
    if vim.fn.executable(tsc) == 1 and vim.fn.filereadable(package_path) == 1 then
      on_dir(root)
    end
  end,
}

