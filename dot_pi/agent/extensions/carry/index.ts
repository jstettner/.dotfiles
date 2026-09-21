import {
  TreeSelectorComponent,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

export default function carry(pi: ExtensionAPI) {
  let running = false;

  pi.registerCommand("carry", {
    description: "Carry the latest assistant text to a tree position as a branch summary",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        throw new Error("/carry requires Pi's interactive terminal mode.");
      }
      if (running) {
        ctx.ui.notify("/carry is already open.", "warning");
        return;
      }
      if (!ctx.isIdle()) {
        ctx.ui.notify("Wait for the current response to finish before using /carry.", "warning");
        return;
      }

      running = true;
      try {
        // Match /copy: ignore empty aborted responses and concatenate only text blocks.
        const source = ctx.sessionManager.buildContextEntries().findLast(
          (entry) => entry.type === "message" && entry.message.role === "assistant"
            && !(entry.message.stopReason === "aborted" && entry.message.content.length === 0),
        );
        if (!source || source.type !== "message" || source.message.role !== "assistant") {
          ctx.ui.notify("No assistant message to carry yet.", "warning");
          return;
        }
        const text = source.message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");
        if (!text.trim()) {
          ctx.ui.notify("The latest assistant message has no text to carry.", "warning");
          return;
        }

        const sessionId = ctx.sessionManager.getSessionId();
        const oldLeafId = ctx.sessionManager.getLeafId();
        const targetId = await ctx.ui.custom<string | undefined>((tui, _theme, _keys, done) =>
          new TreeSelectorComponent(
            ctx.sessionManager.getTree(),
            oldLeafId,
            tui.terminal.rows,
            done,
            () => done(undefined),
          ),
        );
        if (targetId === undefined) return;
        if (targetId === oldLeafId) {
          ctx.ui.notify("Choose a different tree position to carry the message to.", "warning");
          return;
        }
        if (ctx.sessionManager.getSessionId() !== sessionId
          || ctx.sessionManager.getLeafId() !== oldLeafId) {
          throw new Error("The session changed while /carry was open. Please retry.");
        }

        // Only intercept this navigation; never change ordinary /tree summaries.
        const unsubscribe = pi.on("session_before_tree", (event) => {
          if (event.preparation.targetId !== targetId
            || event.preparation.oldLeafId !== oldLeafId) return;
          return {
            summary: {
              summary: text,
              details: { source: "carry", sourceLeafId: oldLeafId },
            },
          };
        });
        try {
          const result = await ctx.navigateTree(targetId, { summarize: true });
          if (!result.cancelled) {
            ctx.ui.notify("Carried assistant text as a branch summary. No model call made.", "info");
          }
        } finally {
          unsubscribe();
        }
      } finally {
        running = false;
      }
    },
  });
}
