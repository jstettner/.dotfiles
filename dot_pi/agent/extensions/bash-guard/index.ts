/**
 * bash-guard: blocks bash commands an agent should never run, and tells it what to do instead.
 *
 * - Searches of the whole disk, the home directory or a top-level directory (`find / -name foo`, `rg x ~`).
 *   Agents reach for them to locate a file or package, and they run for hours.
 * - Recursive deletion of the root, a top-level directory, the home directory or one of its directories
 *   (`rm -rf /`, `rm -rf ~/src`, `rm -rf "$HOME"/*`), and any `rm --no-preserve-root`.
 *
 * Subagents start with `--no-extensions`; pi-subagent passes them this extension through
 * `~/.pi/agent/subagent-extensions`.
 */
import { type ExtensionAPI, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { destructiveRemoval, wholeDiskScan } from "./rules.ts";

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", (event) => {
		if (!isToolCallEventType("bash", event)) return;
		const { command } = event.input;

		const removed = destructiveRemoval(command);
		if (removed) {
			return {
				block: true,
				reason:
					`Blocked: this deletes \`${removed}\` recursively, which would destroy the system or the user's files. ` +
					"Delete only the specific files or directories you created, by their full paths.",
			};
		}

		const scanned = wholeDiskScan(command);
		if (scanned) {
			return {
				block: true,
				reason:
					`Blocked: this searches all of \`${scanned}\`, which takes hours. Search where the file can be instead: ` +
					"the working directory or a path you know (`find . -path '*node_modules/<pkg>'`, " +
					"`ls node_modules/<pkg>`), or ask Node where a package resolves " +
					"(`node -p \"require.resolve('<pkg>/package.json')\"`).",
			};
		}
	});
}
