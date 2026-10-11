/**
 * Recolors the π logo in Pi's startup header with the pink → cyan gradient from
 * pi-powerline-footer's welcome screen, and continues that gradient down the
 * loaded-resource section headers ([Context], [Skills], [Prompts], [Extensions]).
 *
 * Pi has no hook for these colors, so this installs a header that wraps the
 * built-in one: everything (version, key hints, Ctrl+O expansion, the logo-click
 * easter egg) is delegated, and only the logo's four cells are repainted. The
 * loaded-resources container (the header's sibling) gets its render wrapped the
 * same way; warning sections such as [Extension issues] keep Pi's warning color.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import {
	backgroundAnsi,
	foregroundAnsi,
	mixColors,
	parseColor,
	sliceByColumn,
	stripTerminalSequences,
} from "@earendil-works/pi-tui";

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
const SECTIONS_PATCHED = Symbol("logo-gradient-sections");
const SECTION_HEADER = /^(\s*)\[(Context|Skills|Prompts|Extensions)\]\s*$/;

/** Gradient color at `t` in [0, 1], blended smoothly between the stops. */
function gradientAt(theme: Theme, t: number): string {
	const scaled = Math.min(1, Math.max(0, t)) * (GRADIENT.length - 1);
	const i = Math.min(GRADIENT.length - 2, Math.floor(scaled));
	const color = mixColors(parseColor(GRADIENT[i]), parseColor(GRADIENT[i + 1]), scaled - i, "oklch");
	return foregroundAnsi(color, theme.getColorMode());
}

/** Section headers run down the gradient; each one blends across its own slice of it. */
function recolorSections(theme: Theme, lines: string[]): string[] {
	const headers: number[] = [];
	lines.forEach((line, i) => {
		if (SECTION_HEADER.test(stripTerminalSequences(line))) headers.push(i);
	});
	headers.forEach((lineIdx, k) => {
		const [, indent, name] = SECTION_HEADER.exec(stripTerminalSequences(lines[lineIdx]))!;
		const label = `[${name}]`;
		const span = 1 / headers.length;
		let out = indent;
		for (let j = 0; j < label.length; j++) {
			out += `${gradientAt(theme, (k + j / label.length) * span)}${label[j]}`;
		}
		lines[lineIdx] = `${out}${RESET}`;
	});
	return lines;
}

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

const isHeader = (node: object) => WRAPPED in node || ("onLogoClick" in node && "setExpanded" in node);

/**
 * The path from `node` to the header: the built-in one (the only component with Pi's logo-click hook) or
 * our wrapper around it.
 */
function findHeaderPath(node: unknown, path: object[] = []): object[] | undefined {
	if (!node || typeof node !== "object") return undefined;
	if (isHeader(node)) return [...path, node];
	const children = (node as { children?: unknown }).children;
	if (!Array.isArray(children)) return undefined;
	for (const child of children) {
		const found = findHeaderPath(child, [...path, node]);
		if (found) return found;
	}
	return undefined;
}

/**
 * Pi's document is [headerContainer, loadedResourcesContainer, chat]. The resources container is cleared and
 * refilled on /reload but stays the same object, so wrapping its render once covers every listing.
 */
function patchSections(theme: Theme, path: object[]): void {
	const document = path.at(-3) as { children?: unknown[] } | undefined;
	const headerContainer = path.at(-2);
	if (!document || !Array.isArray(document.children)) return;
	const resources = document.children[document.children.indexOf(headerContainer) + 1] as
		| (Component & { [SECTIONS_PATCHED]?: true })
		| undefined;
	if (!resources || resources[SECTIONS_PATCHED]) return;
	const render = resources.render.bind(resources);
	resources.render = (width: number) => recolorSections(theme, render(width));
	resources[SECTIONS_PATCHED] = true;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setHeader((tui, theme) => {
			const path = findHeaderPath(tui);
			const found = path?.at(-1);
			if (!path || !found) return { render: () => [], invalidate() {} };
			const inner = (WRAPPED in found ? (found as { [WRAPPED]: Header })[WRAPPED] : found) as Header;
			patchSections(theme, path);
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
