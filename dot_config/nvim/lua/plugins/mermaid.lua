return {
  {
    "searleser97/mermaid-nvim",
    ft = "markdown",
    opts = {
      cmd = { "termaid", "--padding-x", "1", "--padding-y", "0", "--gap", "2" },
      preview_mode = "float",
      highlights = {
        diagram = "Normal",
      },
    },
    keys = {
      { "<leader>mp", "<cmd>MermaidFloat<CR>", ft = "markdown", desc = "Preview Mermaid diagram" },
      { "<leader>mt", "<cmd>MermaidToggle<CR>", ft = "markdown", desc = "Toggle Mermaid diagram" },
      { "<leader>mr", "<cmd>MermaidRender<CR>", ft = "markdown", desc = "Render Mermaid diagrams" },
    },
  },
}
