import { execFile } from "node:child_process";
import { basename } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Reports what Pi is doing as a `$doing` pane token, shown in Herdr's agent sidebar
// (see ui.sidebar.agents in ~/.config/herdr/config.toml).

const SOURCE = "pi-activity";
// Clears the token if Pi dies without cleaning up.
const TTL_MS = 30 * 60 * 1000;

function clip(text: string, max = 60): string {
  const line = text.trim().split("\n")[0].replace(/\s+/g, " ");
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function describe(tool: string, args: Record<string, unknown> | undefined): string {
  const str = (key: string) => (typeof args?.[key] === "string" ? (args[key] as string) : undefined);
  const file = str("path") ?? str("file_path");
  switch (tool) {
    case "read":
      return file ? `reading ${basename(file)}` : "reading";
    case "edit":
      return file ? `editing ${basename(file)}` : "editing";
    case "write":
      return file ? `writing ${basename(file)}` : "writing";
    case "bash":
      return str("command") ? `$ ${clip(str("command")!)}` : "running a command";
    case "grep":
      return str("pattern") ? `searching ${clip(str("pattern")!, 40)}` : "searching";
    case "find":
    case "ls":
      return "browsing files";
    default:
      return tool.replace(/^mcp__.+?__/, "").replaceAll("_", " ");
  }
}

export default function (pi: ExtensionAPI) {
  const paneId = process.env.HERDR_ENV === "1" ? process.env.HERDR_PANE_ID : undefined;
  if (!paneId) return;
  const bin = process.env.HERDR_BIN_PATH || "herdr";

  let seq = Date.now() * 1000;
  let shown: string | undefined;
  let pending: string | null | undefined; // undefined: nothing queued, null: clear
  let sending = false;

  const flush = (): void => {
    if (sending || pending === undefined) return;
    const next = pending;
    pending = undefined;
    if ((next ?? undefined) === shown) return;
    sending = true;
    const args = ["pane", "report-metadata", paneId, "--source", SOURCE, "--seq", String(++seq)];
    if (next === null) args.push("--clear-token", "doing");
    else args.push("--token", `doing=${next}`, "--ttl-ms", String(TTL_MS));
    execFile(bin, args, { timeout: 3000 }, (error) => {
      sending = false;
      if (!error) shown = next ?? undefined;
      flush();
    });
  };

  const report = (activity: string | null): void => {
    pending = activity;
    flush();
  };

  pi.on("agent_start", () => report("thinking"));
  pi.on("tool_execution_start", (event) => report(describe(event.toolName, event.args)));
  pi.on("tool_execution_end", () => report("thinking"));
  pi.on("agent_settled", () => report(null));
  pi.on("session_shutdown", () => {
    // Best effort: Pi may exit before this finishes, and the TTL covers that.
    execFile(bin, ["pane", "report-metadata", paneId, "--source", SOURCE, "--seq", String(++seq), "--clear-token", "doing"]);
  });
}
