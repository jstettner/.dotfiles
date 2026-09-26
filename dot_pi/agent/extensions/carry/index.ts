import {
  getMarkdownTheme,
  keyText,
  TreeSelectorComponent,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Box, Markdown, Spacer, Text } from "@earendil-works/pi-tui";

const CARRY_TYPE = "carry";
// What the model sees before the carried text; the renderer hides it.
const CARRY_HEADER = "Carried from another branch of this conversation (your reply there):\n\n";

export default function carry(pi: ExtensionAPI) {
  let running = false;

  // Mirror pi's collapsible branch-summary block, labelled as a carry.
  pi.registerMessageRenderer(CARRY_TYPE, (message, { expanded, outputPad }, theme) => {
    const content = typeof message.content === "string"
      ? message.content
      : message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
    const text = content.startsWith(CARRY_HEADER) ? content.slice(CARRY_HEADER.length) : content;
    const box = new Box(outputPad, 1, (t) => theme.bg("customMessageBg", t));
    box.addChild(new Text(theme.fg("customMessageLabel", "\x1b[1m[carry]\x1b[22m"), 0, 0));
    box.addChild(new Spacer(1));
    if (expanded) {
      box.addChild(new Markdown(`**Carried from another branch**\n\n${text}`, 0, 0, getMarkdownTheme(), {
        color: (t) => theme.fg("customMessageText", t),
      }));
    } else {
      box.addChild(new Text(theme.fg("customMessageText", "Carried from another branch (")
        + theme.fg("dim", keyText("app.tools.expand"))
        + theme.fg("customMessageText", " to expand)"), 0, 0));
    }
    return box;
  });

  pi.registerCommand("carry", {
    description: "Carry the latest assistant text to a tree position",
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

        // Navigate without summarizing, so no summarizer (pi's or pi-claude-bridge's) runs,
        // then append the text at the new position. While idle, sendMessage appends at once.
        const result = await ctx.navigateTree(targetId, { summarize: false });
        if (result.cancelled) return;
        pi.sendMessage(
          {
            customType: CARRY_TYPE,
            content: CARRY_HEADER + text,
            display: true,
            details: { sourceLeafId: oldLeafId },
          },
          { triggerTurn: false },
        );
        ctx.ui.notify("Carried the latest assistant text.", "info");
      } finally {
        running = false;
      }
    },
  });
}
