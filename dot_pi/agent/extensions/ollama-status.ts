/**
 * ollama-status: when the session's current model is an Ollama model, show where
 * it's running (the PROCESSOR column of `ollama ps`) in the footer status line.
 * Warns when any of it has spilled onto the CPU. Shows nothing for other models.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const PROVIDER = "ollama"; // provider key in ~/.pi/agent/models.json
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
    const result = await pi.exec("ollama", ["ps"], { timeout: EXEC_TIMEOUT_MS });
    if (gen !== generation) return;

    let text: string;
    if (result.code !== 0 || result.killed) {
      text = theme.fg("error", "ollama: unreachable");
    } else {
      const processor = processorFor(result.stdout, model.id);
      if (processor === undefined) text = theme.fg("dim", "ollama: not loaded");
      else if (/CPU/i.test(processor)) text = theme.fg("warning", `ollama: ${processor}`);
      else text = theme.fg("success", `ollama: ${processor}`);
    }
    ctx.ui.setStatus(STATUS_KEY, text);
    timer = setTimeout(() => void poll(gen), POLL_MS);
  };

  const track = (next: Model | undefined): void => {
    stop();
    model = next?.provider === PROVIDER ? next : undefined;
    if (ctx?.mode === "tui" && model) void poll(generation);
  };

  pi.on("session_start", (_event, c) => {
    ctx = c;
    track(c.model);
  });
  pi.on("model_select", (event) => track(event.model));
  // Ollama loads the model on the first request, so refresh right after a turn instead of waiting.
  pi.on("agent_settled", () => track(model));
  pi.on("session_shutdown", () => {
    stop();
    ctx = undefined;
  });
}
