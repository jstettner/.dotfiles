// Teleport: hand this pi session, and the Rex session around it, to another machine.
//
// Rex's teleport action (~/.config/rex/teleport.lua, on the Mac) does the work. This extension gives it two things:
// a record of which session file each pi process has open and whether it's mid-run, in
// ~/.pi/agent/teleport/pids/PID.json, so the action can resume every pi pane it moves; and /teleport, which runs the
// action on the session this pi is in, asking where to send it unless told.
//
// On a machine other than the Mac, ~/.pi/agent/teleport/config.json says how to reach the Mac's Rex:
//   { "hub": "https://stetbook-rex.tailc00e92.ts.net", "self": "ambral-server" }
// where self is this machine's host label on the Mac.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const dir = join(homedir(), ".pi", "agent", "teleport");
const record = join(dir, "pids", `${process.pid}.json`);

type Config = { hub?: string; self?: string };
type Destination = { to: string; name: string };

const readConfig = (): Config => {
  const path = join(dir, "config.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
};

const rexBin = () => (process.env.REX_BIN_DIR ? join(process.env.REX_BIN_DIR, "rex") : "rex");

// Runs an action on the Mac's Rex, whose result `rex do --json` prints. This pane's REX_SESSION and REX_BLOCK, which
// name things on this machine's server, mustn't reach it.
const runAction = (hub: string | undefined, action: string, pairs: Array<string>) => {
  const { REX_SESSION: _s, REX_BLOCK: _b, ...env } = process.env;
  const argv = [...(hub ? ["-S", hub] : []), "--timeout", "15m", "do", action, ...pairs, "--json"];
  return new Promise<{ result?: unknown; error?: string }>((resolve) =>
    execFile(rexBin(), argv, { env }, (err, stdout, stderr) =>
      resolve(
        err
          ? { error: stderr.trim().replace(/^Error: /, "") || err.message }
          : { result: stdout.trim() ? JSON.parse(stdout) : undefined },
      )
    )
  );
};

export default function (pi: ExtensionAPI) {
  let file: string | undefined;
  let busy = false;

  const save = () => {
    if (!file || !process.env.REX_BLOCK) return;
    mkdirSync(join(dir, "pids"), { recursive: true });
    writeFileSync(record, JSON.stringify({ file, busy }));
  };

  pi.on("session_start", (_event, ctx) => {
    file = ctx.sessionManager.getSessionFile();
    save();
  });
  pi.on("agent_start", () => {
    busy = true;
    save();
  });
  pi.on("agent_settled", () => {
    busy = false;
    save();
  });
  pi.on("session_shutdown", (event) => {
    if (event.reason === "quit") rmSync(record, { force: true });
  });

  pi.registerCommand("teleport", {
    description: "Move this Rex session, its worktree and its pi sessions to another machine: /teleport [host]",
    handler: async (args, ctx) => {
      const session = process.env.REX_SESSION;
      const block = process.env.REX_BLOCK;
      if (!session || !block) {
        ctx.ui.notify("/teleport needs pi to run in a Rex pane", "error");
        return;
      }
      const { hub, self } = readConfig();
      const from = self ? [`from=${self}`] : [];

      let to = args.trim();
      let name = to;
      if (!to) {
        const listed = await runAction(hub, "teleport_destinations", from);
        if (listed.error) {
          ctx.ui.notify(`Teleport failed: ${listed.error}`, "error");
          return;
        }
        const destinations = listed.result as Array<Destination>;
        name = (await ctx.ui.select("Teleport to:", destinations.map((d) => d.name))) ?? "";
        if (!name) return;
        to = destinations.find((d) => d.name === name)!.to;
      }

      ctx.ui.notify(`Teleporting to ${name}…`, "info");
      // On success, the action opens the session on the other machine and shows it in the app.
      const done = await runAction(hub, "teleport", [`session=${session}`, `block=${block}`, `to=${to}`, "follow=true", ...from]);
      if (done.error) ctx.ui.notify(`Teleport failed: ${done.error}`, "error");
    },
  });
}
