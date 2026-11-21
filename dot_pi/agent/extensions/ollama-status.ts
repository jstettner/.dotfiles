/**
 * ollama-status: when the session's current model is a local one, show the state of its server in the
 * footer status line. Shows nothing for other models.
 *
 * - Ollama: where the model is running (the PROCESSOR column of `ollama ps`), warning when any of it has
 *   spilled onto the CPU. It asks the server the model's baseUrl names (`/api/ps`), so a model served from
 *   another machine over the tailnet shows that machine's state.
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

interface RunningModel {
  name?: string;
  size?: number;
  size_vram?: number;
}

/** The PROCESSOR column of `ollama ps`, worked out from sizes as the CLI does. */
function processorFor(running: RunningModel): string {
  const size = running.size ?? 0;
  const vram = running.size_vram ?? 0;
  if (vram === 0) return "100% CPU";
  if (vram === size) return "100% GPU";
  if (vram > size || size === 0) return "unknown";
  const cpu = Math.round(((size - vram) / size) * 100);
  return `${cpu}%/${100 - cpu}% CPU/GPU`;
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

/** Polls Ollama's `/api/ps`, next to the `/v1` the model's baseUrl names. */
async function ollamaStatus(model: Model, theme: ExtensionContext["ui"]["theme"]): Promise<string> {
  const base = (model.baseUrl ?? "http://127.0.0.1:11434/v1").replace(/\/v1\/?$/, "");
  let models: RunningModel[];
  try {
    const response = await fetch(`${base}/api/ps`, { signal: AbortSignal.timeout(EXEC_TIMEOUT_MS) });
    if (!response.ok) return theme.fg("error", `ollama: HTTP ${response.status}`);
    models = ((await response.json()) as { models?: RunningModel[] }).models ?? [];
  } catch {
    return theme.fg("error", "ollama: unreachable");
  }
  const running = models.find((m) => m.name === model.id);
  if (running === undefined) return theme.fg("dim", "ollama: not loaded");
  const processor = processorFor(running);
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
      model.provider === LLAMA ? await llamaStatus(model, theme) : await ollamaStatus(model, theme);
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
