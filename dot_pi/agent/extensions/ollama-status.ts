/**
 * ollama-status: when the session's current model is a local one, show the state of its server in the
 * footer status line. Shows nothing for other models.
 *
 * - Ollama: where the model is running (the PROCESSOR column of `ollama ps`), warning when any of it has
 *   spilled onto the CPU.
 * - llama-server (`llama-local`): how many of its slots are busy, warning when all are, since the next
 *   request then takes over another session's slot and its KV cache.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const OLLAMA = "ollama"; // provider keys in ~/.pi/agent/models.json
const LLAMA = "llama-local";
const STATUS_KEY = "ollama";
const POLL_MS = 5000;
const EXEC_TIMEOUT_MS = 4000;

type Model = NonNullable<ExtensionContext["model"]>;

// Columns are fixed-width and values contain spaces ("100% GPU"), so slice by header offsets.
function processorFor(stdout: string, modelId: string): string | undefined {
  const [header = "", ...rows] = stdout.split("\n");
  const nameEnd = header.indexOf("ID");
  const start = header.indexOf("PROCESSOR");
  const end = header.indexOf("CONTEXT");
  if (nameEnd < 0 || start < 0) return undefined;
  for (const row of rows) {
    if (row.slice(0, nameEnd).trim() !== modelId) continue;
    return row.slice(start, end < 0 ? undefined : end).trim();
  }
  return undefined;
}

interface Slot {
  is_processing?: boolean;
}

/** Polls llama-server's `/slots`, next to the `/v1` the model's baseUrl names. */
async function llamaStatus(model: Model, theme: ExtensionContext["ui"]["theme"]): Promise<string> {
  const base = (model.baseUrl ?? "http://127.0.0.1:9931/v1").replace(/\/v1\/?$/, "");
  try {
    const response = await fetch(`${base}/slots`, { signal: AbortSignal.timeout(EXEC_TIMEOUT_MS) });
    if (!response.ok) return theme.fg("error", `llama: HTTP ${response.status}`);
    const slots = (await response.json()) as Slot[];
    const busy = slots.filter((slot) => slot.is_processing).length;
    const text = `llama: ${busy}/${slots.length} slots`;
    return theme.fg(busy >= slots.length ? "warning" : "success", text);
  } catch {
    return theme.fg("error", "llama: unreachable");
  }
}

async function ollamaStatus(pi: ExtensionAPI, model: Model, theme: ExtensionContext["ui"]["theme"]): Promise<string> {
  const result = await pi.exec("ollama", ["ps"], { timeout: EXEC_TIMEOUT_MS });
  if (result.code !== 0 || result.killed) return theme.fg("error", "ollama: unreachable");
  const processor = processorFor(result.stdout, model.id);
  if (processor === undefined) return theme.fg("dim", "ollama: not loaded");
  if (/CPU/i.test(processor)) return theme.fg("warning", `ollama: ${processor}`);
  return theme.fg("success", `ollama: ${processor}`);
}

export default function (pi: ExtensionAPI) {
  let ctx: ExtensionContext | undefined;
  let model: Model | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0; // invalidates in-flight polls after a model switch or shutdown

  const stop = (): void => {
    generation++;
    clearTimeout(timer);
    timer = undefined;
    ctx?.ui.setStatus(STATUS_KEY, undefined);
  };

  const poll = async (gen: number): Promise<void> => {
    if (!ctx || !model) return;
    const { theme } = ctx.ui;
    const text =
      model.provider === LLAMA ? await llamaStatus(model, theme) : await ollamaStatus(pi, model, theme);
    if (gen !== generation || !ctx) return;
    ctx.ui.setStatus(STATUS_KEY, text);
    timer = setTimeout(() => void poll(gen), POLL_MS);
  };

  const track = (next: Model | undefined): void => {
    stop();
    model = next?.provider === OLLAMA || next?.provider === LLAMA ? next : undefined;
    if (ctx?.mode === "tui" && model) void poll(generation);
  };

  pi.on("session_start", (_event, c) => {
    ctx = c;
    track(c.model);
  });
  pi.on("model_select", (event) => track(event.model));
  // Ollama loads the model on the first request, and slots free as turns end, so refresh right after one.
  pi.on("agent_settled", () => track(model));
  pi.on("session_shutdown", () => {
    stop();
    ctx = undefined;
  });
}
