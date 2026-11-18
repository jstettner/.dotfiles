/**
 * serial-subagents: when on, Ollama-backed subagents take turns running whole tasks instead of
 * interleaving model calls. Ollama with OLLAMA_NUM_PARALLEL=1 keeps one KV cache slot, so
 * interleaved agents evict each other and re-prefill their whole context on every call. Here a
 * subagent takes a machine-wide FIFO lock before its first model call and holds it until its run
 * settles, so each follow-up call only prefills what's new.
 *
 * Toggle with `/serial` from any pi (the flag is a file, so every running subagent sees it).
 * Only subagents (PI_SUBAGENT_RUN_DIR) on the `ollama` provider wait; the parent never does, so
 * it can't deadlock while it waits on its children.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const PROVIDER = "ollama";
const STATUS_KEY = "serial";
const POLL_MS = 500;

const root = join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "serial-subagents");
const flagFile = join(root, "enabled");
const queueDir = join(root, "queue"); // one ticket per waiter or holder: `<ms>-<pid>`
const heldDir = join(root, "held"); // mkdir is the atomic lock; `pid` inside names the holder

const isEnabled = (): boolean => existsSync(flagFile);

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};

const ticketPid = (name: string): number => Number(name.split("-")[1]);

/** Live tickets in arrival order, removing those of processes that died. */
const liveTickets = (): string[] => {
  const names = readdirSync(queueDir).sort();
  return names.filter((name) => {
    if (alive(ticketPid(name))) return true;
    rmSync(join(queueDir, name), { force: true });
    return false;
  });
};

const tryTakeHeld = (): boolean => {
  try {
    mkdirSync(heldDir);
    writeFileSync(join(heldDir, "pid"), String(process.pid));
    return true;
  } catch {
    // Steal the lock from a holder that died without releasing it.
    let holder = NaN;
    try {
      holder = Number(readFileSync(join(heldDir, "pid"), "utf8"));
    } catch {
      return false; // being created right now
    }
    if (!Number.isNaN(holder) && !alive(holder)) rmSync(heldDir, { recursive: true, force: true });
    return false;
  }
};

export default function (pi: ExtensionAPI) {
  const isSubagent = !!process.env.PI_SUBAGENT_RUN_DIR;
  let ticket: string | undefined;
  let held = false;

  const release = (ctx?: ExtensionContext): void => {
    if (held) {
      try {
        if (readFileSync(join(heldDir, "pid"), "utf8") === String(process.pid)) {
          rmSync(heldDir, { recursive: true, force: true });
        }
      } catch {}
    }
    if (ticket) rmSync(join(queueDir, ticket), { force: true });
    held = false;
    ticket = undefined;
    ctx?.ui.setStatus(STATUS_KEY, undefined);
  };

  const acquire = async (ctx: ExtensionContext): Promise<void> => {
    mkdirSync(queueDir, { recursive: true });
    ticket ??= `${String(Date.now()).padStart(15, "0")}-${process.pid}`;
    writeFileSync(join(queueDir, ticket), "");
    const { theme } = ctx.ui;
    while (!ctx.signal?.aborted) {
      if (!isEnabled()) {
        release(ctx);
        return;
      }
      const tickets = liveTickets();
      const position = tickets.indexOf(ticket);
      if (position === 0 && tryTakeHeld()) {
        held = true;
        ctx.ui.setStatus(STATUS_KEY, theme.fg("success", "serial: running"));
        return;
      }
      ctx.ui.setStatus(STATUS_KEY, theme.fg("warning", `serial: waiting (#${Math.max(position, 1)} in queue)`));
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    release(ctx); // aborted while waiting
  };

  pi.registerCommand("serial", {
    description: "Toggle running Ollama subagents one at a time (keeps the KV cache warm)",
    handler: async (_args, ctx) => {
      mkdirSync(root, { recursive: true });
      if (isEnabled()) rmSync(flagFile, { force: true });
      else writeFileSync(flagFile, "");
      ctx.ui.notify(`serial subagents: ${isEnabled() ? "on" : "off"}`, "info");
    },
  });

  if (!isSubagent) return;

  // Fires before every model call: block the first call of a run until it's this agent's turn.
  pi.on("context", async (_event, ctx) => {
    if (held || !isEnabled() || ctx.model?.provider !== PROVIDER) return;
    await acquire(ctx);
  });

  // Hold through retries, compactions and queued follow-ups; let go once the run is truly over.
  pi.on("agent_settled", (_event, ctx) => release(ctx));
  // A dialog waiting on a person shouldn't stall the other agents.
  pi.on("ui_prompt_start", (_event, ctx) => release(ctx));
  pi.on("session_shutdown", (_event, ctx) => release(ctx));
  process.once("exit", () => release());
}
