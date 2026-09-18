return {
  {
    "obsidian-nvim/obsidian.nvim",
    version = "*",
    config = function()
      local function obsidian_workspaces()
        local home = vim.fn.expand("~")
        local config_home = vim.env.XDG_CONFIG_HOME
          or vim.fs.joinpath(home, ".config")
        local registries = {
          vim.fs.joinpath(
            home,
            "Library",
            "Application Support",
            "obsidian",
            "obsidian.json"
          ),
          vim.fs.joinpath(config_home, "obsidian", "obsidian.json"),
          vim.fs.joinpath(
            home,
            ".var",
            "app",
            "md.obsidian.Obsidian",
            "config",
            "obsidian",
            "obsidian.json"
          ),
          vim.fs.joinpath(
            home,
            "snap",
            "obsidian",
            "current",
            ".config",
            "obsidian",
            "obsidian.json"
          ),
        }
      
        if vim.env.APPDATA then
          table.insert(
            registries,
            vim.fs.joinpath(vim.env.APPDATA, "obsidian", "obsidian.json")
          )
        end
      
        local discovered = {}
        local seen_paths = {}
      
        for _, registry in ipairs(registries) do
          if vim.uv.fs_stat(registry) then
            local ok, lines = pcall(vim.fn.readfile, registry)
            local decoded_ok, data = pcall(
              vim.json.decode,
              ok and table.concat(lines, "\n") or ""
            )
      
            if decoded_ok
              and type(data) == "table"
              and type(data.vaults) == "table"
            then
              for id, vault in pairs(data.vaults) do
                if type(vault.path) == "string" then
                  local path = vim.fs.normalize(vault.path)
                  local stat = vim.uv.fs_stat(path)
      
                  if stat and stat.type == "directory" and not seen_paths[path] then
                    seen_paths[path] = true
                    table.insert(discovered, {
                      id = id,
                      open = vault.open == true,
                      path = path,
                    })
                  end
                end
              end
            end
          end
        end
      
        -- Headless servers do not have Obsidian's desktop vault registry.
        if #discovered == 0
          and vim.env.OBSIDIAN_VAULT
          and vim.env.OBSIDIAN_VAULT ~= ""
        then
          local path = vim.fs.normalize(vim.fn.expand(vim.env.OBSIDIAN_VAULT))
          local stat = vim.uv.fs_stat(path)
      
          if stat and stat.type == "directory" then
            table.insert(discovered, {
              id = "environment",
              open = true,
              path = path,
            })
          end
        end
      
        table.sort(discovered, function(a, b)
          if a.open ~= b.open then
            return a.open
          end
          return a.path < b.path
        end)
      
        local workspaces = {}
        local names = {}
      
        for _, vault in ipairs(discovered) do
          local name = vim.fs.basename(vault.path)
          if names[name] then
            name = string.format("%s (%s)", name, vault.id:sub(1, 6))
          end
          names[name] = true
          table.insert(workspaces, { name = name, path = vault.path })
        end
      
        return workspaces
      end
      
      local workspaces = obsidian_workspaces()
      if #workspaces > 0 then
        require("obsidian").setup({
          legacy_commands = false,
          workspaces = workspaces,
          backlinks = {
            parse_headers = false,
          },
          picker = {
            name = "mini.pick",
          },
        })
      end
    end,
  },
}
