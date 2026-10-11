/**
 * Recolors the π logo in Pi's startup header with the pink → cyan gradient from
 * pi-powerline-footer's welcome screen.
 *
 * Pi has no hook for the logo's colors, so this installs a header that wraps the
 * built-in one: everything (version, key hints, Ctrl+O expansion, the logo-click
 * easter egg) is delegated, and only the logo's four cells are repainted.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import { backgroundAnsi, foregroundAnsi, parseColor, sliceByColumn, stripTerminalSequences } from "@earendil-works/pi-tui";

type Theme = ExtensionContext["ui"]["theme"];

// pi-powerline-footer's GRADIENT_COLORS (256-color indices).
const GRADIENT = [199, 171, 135, 99, 75, 51];

// Pi's logo as square pixels (4 wide, 4 tall), drawn two rows per line with half blocks.
const PIXELS = ["███ ", "█ █ ", "██ █", "█  █"];
// What the built-in logo's cells read as once styling is stripped; anything else is left alone.
const BUILT_IN_LOGO = ["▀▀█ ", "█▀ █"];
// The header's text has one column of padding before the logo.
const LOGO_COL = 1;
const LOGO_WIDTH = 4;
const RESET = "\x1b[0m";

type Header = Component & {
	setExpanded?(expanded: boolean): void;
	handleMouse?(event: TuiMouseEvent): TuiMouseEventResult | undefined;
	dispose?(): void;
};

const WRAPPED = Symbol("logo-gradient");

/** Diagonal gradient: top-left pink, bottom-right cyan. */
function pixelColor(row: number, col: number): number | undefined {
	if (PIXELS[row][col] === " ") return undefined;
	const steps = PIXELS.length + LOGO_WIDTH - 2;
	return GRADIENT[Math.round(((row + col) / steps) * (GRADIENT.length - 1))];
}

function logoLine(theme: Theme, line: number): string {
	const mode = theme.getColorMode();
	const fg = (c: number) => foregroundAnsi(parseColor(c), mode);
	const bg = (c: number) => backgroundAnsi(parseColor(c), mode);
	let out = "";
	for (let col = 0; col < LOGO_WIDTH; col++) {
		const top = pixelColor(line * 2, col);
		const bottom = pixelColor(line * 2 + 1, col);
		if (top === undefined && bottom === undefined) out += " ";
		else if (bottom === undefined) out += `${fg(top!)}▀${RESET}`;
		else if (top === undefined) out += `${fg(bottom)}▄${RESET}`;
		else if (top === bottom) out += `${fg(top)}█${RESET}`;
		else out += `${fg(top)}${bg(bottom)}▀${RESET}`;
	}
	return out;
}

/** The built-in header: the one component in the tree with Pi's logo-click hook. */
function findBuiltInHeader(node: unknown): Header | undefined {
	if (!node || typeof node !== "object") return undefined;
	if (WRAPPED in node) return (node as { [WRAPPED]: Header })[WRAPPED];
	if ("onLogoClick" in node && "setExpanded" in node) return node as unknown as Header;
	const children = (node as { children?: unknown }).children;
	if (!Array.isArray(children)) return undefined;
	for (const child of children) {
		const found = findBuiltInHeader(child);
		if (found) return found;
	}
	return undefined;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setHeader((tui, theme) => {
			const inner = findBuiltInHeader(tui);
			if (!inner) return { render: () => [], invalidate() {} };
			return {
				[WRAPPED]: inner,
				render(width: number): string[] {
					const lines = inner.render(width);
					for (const i of [0, 1]) {
						const line = lines[i];
						if (line === undefined || width < LOGO_COL + LOGO_WIDTH) break;
						const cells = stripTerminalSequences(sliceByColumn(line, LOGO_COL, LOGO_WIDTH));
						if (cells !== BUILT_IN_LOGO[i]) break;
						const rest = sliceByColumn(line, LOGO_COL + LOGO_WIDTH, width - LOGO_COL - LOGO_WIDTH);
						lines[i] = `${sliceByColumn(line, 0, LOGO_COL)}${logoLine(theme, i)}${rest}`;
					}
					return lines;
				},
				invalidate: () => inner.invalidate(),
				setExpanded: (expanded: boolean) => inner.setExpanded?.(expanded),
				handleMouse: (event: TuiMouseEvent) => inner.handleMouse?.(event),
			};
		});
	});
}
