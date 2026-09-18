import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("label", {
    description: "Label the current step: /label <text>",
    handler: async (args, ctx) => {
      const label = args.trim();
      const id = ctx.sessionManager.getLeafId();

      if (!label || !id) {
        ctx.ui.notify("Usage: /label <text> (requires a current step)", "warning");
        return;
      }

      pi.setLabel(id, label);
      ctx.ui.notify(`Labeled: ${label}`, "info");
    },
  });
}
