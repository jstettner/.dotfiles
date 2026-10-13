import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Run with: node ui-tools.test.mjs /absolute/path/to/pi-coding-agent
const packageDir = process.argv[2];
assert.ok(packageDir, "Pass the installed pi-coding-agent package directory");
const require = createRequire(join(packageDir, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { alias: {
	"@earendil-works/pi-ai": join(packageDir, "../pi-ai/dist/index.js"),
	"@earendil-works/pi-coding-agent": join(packageDir, "dist/index.js"),
	"@earendil-works/pi-tui": join(packageDir, "../pi-tui/dist/index.js"),
} });
const { default: extension } = await jiti.import(new URL("../../../extensions/ui-size.ts", import.meta.url).pathname);
const { render } = await import(pathToFileURL(require.resolve("grok-mermaid")).href);
const { createMermaidMarkdownTransformer } = await jiti.import(join(packageDir, "dist/modes/interactive/components/mermaid.js"));
const events = new Map();
const tools = new Map();
let observer;
let widget;
extension({
	on: (name, handler) => events.set(name, handler),
	registerTool: tool => tools.set(tool.name, tool),
	registerMarkdownTransformer: transformer => { observer = transformer; },
});
const terminal = { columns: 126, rows: 56 };
const ctx = { mode: "tui", ui: { setWidget: (_key, factory) => { widget = factory({ terminal }); } } };
const call = async (name, params = {}, context = ctx) =>
	(await tools.get(name).execute("test", params, undefined, undefined, context)).details;
assert.equal((await call("ui_size")).available, false);
events.get("session_start")({}, ctx);
assert.deepEqual(widget.render(126), []);
assert.equal((await call("ui_size")).terminalColumns, 126);
assert.equal(observer("unchanged", { messageType: "assistant", availableWidth: 124 }), "unchanged");
assert.equal((await call("ui_size")).markdownColumns, 124);
observer("thinking", { messageType: "assistant-thinking", availableWidth: 90 });
assert.equal((await call("ui_size")).markdownColumns, 124);

const fixture = await readFile(new URL("./fixtures/request-flow.mmd", import.meta.url), "utf8");
const art = render(fixture);
assert.ok(art);
assert.deepEqual(art.warnings, []);
const measured = await call("mermaid_check", { source: fixture });
assert.equal(measured.renderedColumns, art.width);
assert.equal(measured.availableColumns, 124);
assert.equal(measured.widthSource, "observed-assistant-markdown");
assert.equal(measured.passesPreflight, art.width <= 124);

const transform = createMermaidMarkdownTransformer({ getMode: () => "streaming" });
for (const availableWidth of [art.width - 1, art.width, art.width + 1]) {
	const result = await call("mermaid_check", { source: fixture, availableWidth });
	assert.equal(result.fits, art.width <= availableWidth);
	assert.equal(result.passesPreflight, result.fits);
	assert.equal(result.widthSource, "explicit");
	const markdown = "```mermaid\n" + fixture + "\n```\n";
	const output = transform(markdown, { messageType: "assistant", isStreaming: false, availableWidth });
	assert.equal(output !== markdown, result.passesPreflight);
}
const warningSource = "stateDiagram-v2\n A --> B\n some garbage line";
const warning = await call("mermaid_check", { source: warningSource, availableWidth: 1000 });
assert.ok(warning.warnings.length > 0);
assert.equal(warning.passesPreflight, false);
for (const source of ["", "unsupportedDiagram\n A --> B"]) {
	assert.equal((await call("mermaid_check", { source })).passesPreflight, false);
}
terminal.columns = 80;
assert.equal((await call("ui_size")).markdownColumns, undefined);
assert.equal((await call("mermaid_check", { source: fixture })).widthSource, "estimated-terminal-minus-four");
observer("resized", { messageType: "assistant", availableWidth: 78 });
assert.equal((await call("mermaid_check", { source: fixture })).availableColumns, 78);
const nonTui = await call("mermaid_check", { source: fixture }, { mode: "rpc" });
assert.equal(nonTui.availableColumns, null);
assert.equal(nonTui.passesPreflight, null);
assert.equal((await call("ui_size", {}, { mode: "rpc" })).available, false);
events.get("session_shutdown")();
assert.equal((await call("ui_size")).available, false);
events.get("session_start")({}, { mode: "print" });
assert.equal((await call("ui_size")).available, false);
console.log(`ui tools passed: renderer parity, boundary widths (${art.width} columns), warnings, unsupported source, resize, modes, and shutdown`);
