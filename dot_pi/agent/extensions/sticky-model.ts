// Keep the current model + thinking level when starting a new session with /new
// (instead of resetting to defaultProvider/defaultModel from settings.json).
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Carry = { provider: string; id: string; thinking: string };
const KEY = Symbol.for("pi.sticky-model.carry");
const g = globalThis as any;

export default function (pi: ExtensionAPI) {
	pi.on("session_shutdown", async (event, ctx) => {
		if (event.reason !== "new" || !ctx.model) return;
		g[KEY] = {
			provider: ctx.model.provider,
			id: ctx.model.id,
			thinking: pi.getThinkingLevel(),
		} satisfies Carry;
	});

	pi.on("session_start", async (event, ctx) => {
		const carry: Carry | undefined = g[KEY];
		g[KEY] = undefined;
		if (event.reason !== "new" || !carry) return;

		const model = ctx.modelRegistry.find(carry.provider, carry.id);
		if (model && (ctx.model?.provider !== model.provider || ctx.model?.id !== model.id)) {
			const ok = await pi.setModel(model);
			if (!ok) ctx.ui.notify(`sticky-model: no auth for ${carry.provider}/${carry.id}`, "warning");
		}
		pi.setThinkingLevel(carry.thinking as any);
	});
}
