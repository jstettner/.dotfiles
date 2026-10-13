import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, getPackageDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
	let tui: TUI | undefined;
	let layoutWidth: number | undefined;
	let markdownWidth: { columns: number; terminalColumns: number } | undefined;

	pi.registerMarkdownTransformer((markdown, context) => {
		if (context.messageType === "assistant" && tui) {
			markdownWidth = { columns: context.availableWidth, terminalColumns: tui.terminal.columns };
		}
		return markdown;
	});

	const observedMarkdownWidth = () =>
		tui && markdownWidth?.terminalColumns === tui.terminal.columns ? markdownWidth?.columns : undefined;

	pi.on("session_start", (_event, ctx) => {
		tui = undefined;
		layoutWidth = undefined;
		markdownWidth = undefined;
		if (ctx.mode !== "tui") return;

		// Observe layout without replacing another extension's header, footer, or editor.
		ctx.ui.setWidget("ui-size-observer", (activeTui) => {
			tui = activeTui;
			return {
				render(width: number) {
					layoutWidth = width;
					return [];
				},
				invalidate() {},
			};
		});
	});

	pi.on("session_shutdown", () => {
		tui = undefined;
		layoutWidth = undefined;
		markdownWidth = undefined;
	});

	pi.registerTool(defineTool({
		name: "ui_size",
		label: "UI size",
		description: "Read live Pi terminal dimensions, last observed widget layout width, and assistant Markdown width when observed at the current terminal width, in character cells. Use before drawing diagrams. Returns unavailable outside terminal UI mode.",
		parameters: Type.Object({}),
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			const details = ctx.mode === "tui" && tui
				? {
					available: true,
					terminalColumns: tui.terminal.columns,
					terminalRows: tui.terminal.rows,
					...(layoutWidth === undefined ? {} : { layoutColumns: layoutWidth }),
					...(observedMarkdownWidth() === undefined ? {} : { markdownColumns: observedMarkdownWidth() }),
					measurement: "Terminal dimensions are live; layoutColumns is the last widget width. markdownColumns, when present, is the last assistant Markdown width observed at this terminal width.",
				}
				: { available: false, reason: "Pi terminal UI dimensions are unavailable in this mode or before UI initialization." };
			return { content: [{ type: "text" as const, text: JSON.stringify(details) }], details };
		},
	}));

	pi.registerTool(defineTool({
		name: "mermaid_check",
		label: "Mermaid check",
		description: "Preflight raw Mermaid source with Pi's installed grok-mermaid renderer. Reports rendered width, warnings, and whether it fits the observed assistant Markdown width. Optional availableWidth overrides the viewport for calibration. This is not screen feedback; rendering mode, other transformers, or later resizing can change display.",
		parameters: Type.Object({
			source: Type.String({ maxLength: 20000, description: "Complete Mermaid source, without Markdown fences." }),
			availableWidth: Type.Optional(Type.Integer({ minimum: 1, maximum: 10000, description: "Optional viewport width in character cells; otherwise use observed Markdown width or an explicitly marked estimate." })),
		}),
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const observed = ctx.mode === "tui" ? observedMarkdownWidth() : undefined;
			const estimate = ctx.mode === "tui" && tui ? Math.max(1, tui.terminal.columns - 4) : undefined;
			const availableWidth = params.availableWidth ?? observed ?? estimate;
			const widthSource = params.availableWidth !== undefined ? "explicit"
				: observed !== undefined ? "observed-assistant-markdown"
				: estimate !== undefined ? "estimated-terminal-minus-four" : "unavailable";

			// Resolve from Pi itself so preflight uses its renderer version, not a separately installed copy.
			try {
				const require = createRequire(join(getPackageDir(), "package.json"));
				const rendererPath = require.resolve("grok-mermaid");
				const { render } = await import(pathToFileURL(rendererPath).href);
				const art = render(params.source);
				const fits = art && availableWidth !== undefined ? art.width <= availableWidth : null;
				const details = {
					rendererAvailable: true,
					rendered: art !== null,
					renderedColumns: art?.width ?? null,
					availableColumns: availableWidth ?? null,
					widthSource,
					warnings: art?.warnings ?? [],
					fits,
					passesPreflight: art === null || art.warnings.length > 0 ? false : fits,
					note: "Pi falls back for missing art, excessive width, or finalized renderer warnings. A passing preflight assumes Mermaid rendering is enabled and the viewport remains unchanged; it is not proof of screen output.",
				};
				return { content: [{ type: "text" as const, text: JSON.stringify(details) }], details };
			} catch (error) {
				const details = { rendererAvailable: false, reason: error instanceof Error ? error.message : String(error) };
				return { content: [{ type: "text" as const, text: JSON.stringify(details) }], details };
			}
		},
	}));
}
