/**
 * OMP-style composer for Pi: a port of oh-my-pi's "box" composer.
 *
 *   ╭── π ▏ opus-5.5 · high ▏ sideband ▏ main *2 ━━━━34%━━━━┃───200K─ my-session ──╮
 *   │  prompt text                                                                │
 *   ╰─ last line of the prompt                                                   ─╯
 *
 * - Status segments sit on a filled background inside the editor's top border.
 * - The rule between the left and right groups is the context gauge: filled up
 *   to current usage, with the context percentage anchored at the right.
 * - Named sessions get a stable accent color hashed from the name.
 * - A one-line prompt stays two rows tall: the last input row is merged into
 *   the bottom border.
 *
 * - On startup and /new, a comet swirls once around the frame, then the status
 *   segments wipe in. Set OMP_STATUSLINE_INTRO=0 to skip it.
 *
 * Icons default to Nerd Font glyphs; set OMP_STATUSLINE_ICONS=unicode to use
 * plain Unicode instead.
 */

import * as os from "node:os";
import * as path from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Component, EditorTheme, TUI, TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import {
	backgroundAnsi,
	foregroundAnsi,
	okhslColor,
	parseColor,
	sliceByColumn,
	stripTerminalSequences,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";

// ── Glyphs (from OMP's NERD_SYMBOLS / unicode SYMBOLS) ─────────────────────

const NERD = {
	brand: "π",
	model: "\uec19",
	folder: "\uf115",
	branch: "\uf126",
	subscription: "\u{f067a}",
	off: "\uf05e",
	sepLeft: "\ue0b1",
	sepRight: "\ue0b3",
	capLeft: "\ue0b6",
	capRight: "\ue0b4",
	thinking: {
		minimal: "\u{F0A9E} min",
		low: "\u{F0A9F} low",
		medium: "\u{F0AA1} med",
		high: "\u{F0AA3} high",
		xhigh: "\u{F0AA5} xhi",
		max: "\u{F06D} max",
	} as Record<string, string>,
};

const UNICODE: typeof NERD = {
	brand: "π",
	model: "◆",
	folder: "📁",
	branch: "⑂",
	subscription: "(sub)",
	off: "⊘",
	sepLeft: ">",
	sepRight: "<",
	capLeft: "",
	capRight: "",
	thinking: { minimal: "min", low: "low", medium: "med", high: "high", xhigh: "xhi", max: "max" },
};

const ICONS = process.env.OMP_STATUSLINE_ICONS === "unicode" ? UNICODE : NERD;
// 8-dot braille fills all four dot rows of the cell, so it sits centered against the timer text
// (6-dot frames use only the top three and ride high).
const SPINNER = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];

// ── Colors (OMP dark.json statusLine* tokens) ───────────────────────────────

const PALETTE = {
	sep: 244,
	model: "#d787af",
	path: "#00afaf",
	gitClean: "#5faf5f",
	gitDirty: "#d7af5f",
	staged: 70,
	unstaged: 178,
	untracked: 39,
	cost: 205,
};

const FG_RESET = "\x1b[39m";
const RESET = "\x1b[0m";
const BOX = { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" };

// Editor padding of 3 leaves room for the frame (`│  ` / `╰─ `) without
// changing Pi's own cursor, wrapping, or mouse math.
const PADDING_X = 3;
const MIN_FRAMED_WIDTH = 16;
const BOTTOM_SENTINEL = "\u0000omp-statusline-bottom";

// Intro: one comet lap around the frame, then the status line wipes in.
const INTRO_ENABLED = process.env.OMP_STATUSLINE_INTRO !== "0";
const INTRO_LAP_MS = 1100;
const INTRO_REVEAL_MS = 500;
const INTRO_FRAME_MS = 16;
const COMET_TAIL = 0.22; // fraction of the perimeter
const SHIMMER_WIDTH = 3;

// Directories whose prefix is dropped from the path segment, as OMP does for ~/Projects.
const WORK_ROOTS = [
	path.join(os.homedir(), "src"),
	path.join(os.homedir(), "Projects"),
	path.join(os.homedir(), "repos"),
	"/work",
];

// ── Helpers ──────────────────────────────────────────────────────────────

type Theme = ExtensionContext["ui"]["theme"];

interface GitState {
	branch?: string;
	staged: number;
	unstaged: number;
	untracked: number;
}

function fgHex(theme: Theme, value: string | number): string {
	return foregroundAnsi(parseColor(value), theme.getColorMode());
}

function paint(ansi: string, text: string): string {
	return `${ansi}${text}${FG_RESET}`;
}

/** Stable per-session accent: djb2 hash of the name → OKHSL hue. */
function sessionAccent(theme: Theme, name: string | undefined): string | undefined {
	if (!name) return undefined;
	let hash = 5381;
	for (let i = 0; i < name.length; i++) {
		hash = (((hash << 5) + hash) ^ name.charCodeAt(i)) >>> 0;
	}
	const lightness = theme.appearance === "light" ? 0.45 : 0.72;
	return foregroundAnsi(okhslColor(hash % 360, 0.75, lightness), theme.getColorMode());
}

function formatPercent(pct: number): string {
	return `${pct > 0 && pct < 1 ? pct.toFixed(1) : Math.round(pct)}%`;
}

function displayPath(cwd: string, maxLength: number): string {
	let display = cwd;
	const root = WORK_ROOTS.find(r => cwd.startsWith(r + path.sep));
	if (root) {
		display = cwd.slice(root.length + 1);
	} else if (cwd === os.homedir() || cwd.startsWith(os.homedir() + path.sep)) {
		display = `~${cwd.slice(os.homedir().length)}`;
	}
	return display.length <= maxLength ? display : `…${display.slice(-(maxLength - 1))}`;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Comet color at `k` (0 = head, 1 = tail end): white-hot head fading through the hue wheel. */
function cometAnsi(theme: Theme, k: number, hueBase: number): string {
	const hue = (hueBase + k * 220) % 360;
	const lightness = 0.95 - k * 0.5;
	const saturation = Math.min(1, 0.2 + k * 2);
	return foregroundAnsi(okhslColor(hue, saturation, lightness), theme.getColorMode());
}

const ESCAPE = /\x1b\[[0-9;:?]*[A-Za-z]|\x1b[\]_P^][^\x07\x1b]*(?:\x07|\x1b\\)/;

/**
 * Replace the cell at column `x` with `text` (one column wide), keeping the styling of the cells after it.
 * `sliceByColumn` replays every escape before the slice; non-SGR ones already emitted in `before` (Pi's
 * zero-width cursor marker, OSC 8 links) are dropped so they aren't duplicated.
 */
function overlayCell(line: string, x: number, width: number, text: string): string {
	const before = sliceByColumn(line, 0, x);
	const after = sliceByColumn(line, x + 1, width - x - 1);
	const prefix = new RegExp(`^(?:${ESCAPE.source})*`).exec(after)?.[0] ?? "";
	let emitted = before;
	const kept = prefix.replace(new RegExp(ESCAPE.source, "g"), code => {
		if (/^\x1b\[[0-9;:]*m$/.test(code)) return code;
		const at = emitted.indexOf(code);
		if (at < 0) return code;
		emitted = emitted.slice(0, at) + emitted.slice(at + code.length);
		return "";
	});
	return `${before}${RESET}${text}${RESET}${kept}${after.slice(prefix.length)}`;
}

function parseGitStatus(stdout: string): GitState {
	const state: GitState = { staged: 0, unstaged: 0, untracked: 0 };
	for (const line of stdout.split("\n")) {
		if (line.startsWith("## ")) {
			const head = line.slice(3);
			if (head.startsWith("No commits yet on ")) state.branch = head.slice(18);
			else if (!head.startsWith("HEAD (no branch)")) state.branch = head.split("...")[0];
			else state.branch = "detached";
			continue;
		}
		if (line.length < 2) continue;
		if (line.startsWith("??")) {
			state.untracked++;
			continue;
		}
		if (line[0] !== " ") state.staged++;
		if (line[1] !== " ") state.unstaged++;
	}
	return state;
}

// ── Extension ────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let activeTui: TUI | undefined;
	let turnStartedAt: number | undefined;
	let spinnerTimer: ReturnType<typeof setInterval> | undefined;
	let git: GitState = { staged: 0, unstaged: 0, untracked: 0 };
	let gitRefreshTimer: ReturnType<typeof setTimeout> | undefined;
	// Intro state: pending until the first framed render starts the clock.
	let intro: { startedAt?: number; timer?: ReturnType<typeof setInterval> } | undefined;

	const requestRender = () => activeTui?.requestRender();

	const stopIntro = () => {
		if (intro?.timer) clearInterval(intro.timer);
		intro = undefined;
	};

	const stopSpinner = () => {
		if (spinnerTimer) clearInterval(spinnerTimer);
		spinnerTimer = undefined;
	};

	const refreshGit = async (cwd: string) => {
		const result = await pi
			.exec("git", ["status", "--porcelain=v1", "-b", "--ignore-submodules"], { cwd })
			.catch(() => undefined);
		git = result && result.code === 0 ? parseGitStatus(result.stdout) : { staged: 0, unstaged: 0, untracked: 0 };
		requestRender();
	};

	const scheduleGitRefresh = (cwd: string) => {
		if (gitRefreshTimer) clearTimeout(gitRefreshTimer);
		gitRefreshTimer = setTimeout(() => void refreshGit(cwd), 250);
	};

	pi.on("agent_start", () => {
		turnStartedAt = Date.now();
		stopSpinner();
		spinnerTimer = setInterval(requestRender, 80);
		requestRender();
	});

	pi.on("agent_settled", (_event, ctx) => {
		turnStartedAt = undefined;
		stopSpinner();
		scheduleGitRefresh(ctx.cwd);
		requestRender();
	});

	pi.on("tool_execution_end", (_event, ctx) => scheduleGitRefresh(ctx.cwd));
	pi.on("user_bash", (_event, ctx) => scheduleGitRefresh(ctx.cwd));
	pi.on("model_select", requestRender);
	pi.on("thinking_level_select", requestRender);
	pi.on("session_info_changed", requestRender);
	pi.on("message_end", requestRender);
	pi.on("session_compact", requestRender);

	pi.on("session_shutdown", () => {
		stopSpinner();
		stopIntro();
		if (gitRefreshTimer) clearTimeout(gitRefreshTimer);
		activeTui = undefined;
	});

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setWorkingVisible(false);
		void refreshGit(ctx.cwd);

		stopIntro();
		if (INTRO_ENABLED && (_event.reason === "startup" || _event.reason === "new")) {
			intro = { timer: setInterval(requestRender, INTRO_FRAME_MS) };
		}

		// ── Segments ───────────────────────────────────────────────────────

		const brandSegment = (theme: Theme): string => {
			if (turnStartedAt === undefined) return theme.fg("dim", ICONS.brand);
			const elapsed = Math.floor((Date.now() - turnStartedAt) / 1000);
			const timer = elapsed < 60 ? `${elapsed}s` : elapsed < 3600 ? `${Math.floor(elapsed / 60)}m` : `${Math.floor(elapsed / 3600)}h`;
			const frame = SPINNER[Math.floor(Date.now() / 80) % SPINNER.length];
			return theme.fg("accent", `${frame} ${timer}`);
		};

		const modelSegment = (theme: Theme, accent: string | undefined): string | undefined => {
			const model = ctx.model;
			if (!model) return undefined;
			const name = (model.name || model.id).replace(/^Claude /, "");
			let text = `${ICONS.model} ${name}`;
			if (model.reasoning) {
				const level = pi.getThinkingLevel();
				text += ` · ${level === "off" ? `${ICONS.off} off` : (ICONS.thinking[level] ?? level)}`;
			}
			return paint(accent ?? fgHex(theme, PALETTE.model), text);
		};

		const pathSegment = (theme: Theme, maxLength: number): string =>
			paint(fgHex(theme, PALETTE.path), `${ICONS.folder} ${displayPath(ctx.cwd, maxLength)}`);

		const gitSegment = (theme: Theme): string | undefined => {
			if (!git.branch) return undefined;
			const dirty = git.staged + git.unstaged + git.untracked > 0;
			const base = fgHex(theme, dirty ? PALETTE.gitDirty : PALETTE.gitClean);
			let text = paint(base, `${ICONS.branch} ${git.branch}`);
			const indicators: string[] = [];
			if (git.unstaged) indicators.push(paint(fgHex(theme, PALETTE.unstaged), `*${git.unstaged}`));
			if (git.staged) indicators.push(paint(fgHex(theme, PALETTE.staged), `+${git.staged}`));
			if (git.untracked) indicators.push(paint(fgHex(theme, PALETTE.untracked), `?${git.untracked}`));
			if (indicators.length) text += ` ${indicators.join(" ")}`;
			return text;
		};

		const costSegment = (theme: Theme): string | undefined => {
			let cost = 0;
			for (const entry of ctx.sessionManager.getEntries()) {
				if (entry.type === "message" && entry.message.role === "assistant") {
					cost += (entry.message as AssistantMessage).usage?.cost?.total ?? 0;
				}
			}
			const subscription = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;
			if (!cost && !subscription) return undefined;
			const text = cost ? `$${cost.toFixed(2)}` : ICONS.subscription;
			return paint(fgHex(theme, PALETTE.cost), text);
		};

		const sessionNameSegment = (theme: Theme, accent: string | undefined): string | undefined => {
			const name = pi.getSessionName()?.replace(/\s+/g, " ").trim();
			if (!name) return undefined;
			return paint(accent ?? theme.getFgAnsi("accent"), name);
		};

		// ── Gauge ──────────────────────────────────────────────────────────

		const renderGauge = (
			theme: Theme,
			gapWidth: number,
			accent: string | undefined,
			border: (s: string) => string,
		): string => {
			const usedColor = accent ?? theme.getFgAnsi("borderAccent");
			const usage = ctx.getContextUsage();
			const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
			const pct = usage?.percent ?? null;
			if (contextWindow <= 0) return border(BOX.h.repeat(gapWidth));

			const clamped = pct === null ? 0 : Math.min(100, Math.max(0, pct));
			const percentLabel = pct === null ? "" : formatPercent(pct);
			const labelsFit = percentLabel !== "" && gapWidth >= visibleWidth(percentLabel) + 2;
			const scaleWidth = labelsFit ? gapWidth - visibleWidth(percentLabel) - 1 : gapWidth;
			const usedCount = Math.round((clamped / 100) * scaleWidth);
			const rule = paint(usedColor, BOX.h.repeat(usedCount)) + border(BOX.h.repeat(scaleWidth - usedCount));
			if (!labelsFit) return rule;
			const labelColor = pct !== null && pct > 100 ? theme.getFgAnsi("error") : usedColor;
			return rule + paint(labelColor, percentLabel) + border(BOX.h);
		};

		// ── Status line (fills exactly `width` columns) ────────────────────

		const renderStatusLine = (theme: Theme, width: number, border: (s: string) => string): string => {
			const accent = sessionAccent(theme, pi.getSessionName());
			const mode = theme.getColorMode();
			const segmentBg = parseColor("#121212");
			const bgAnsi = backgroundAnsi(segmentBg, mode);
			const capAnsi = foregroundAnsi(segmentBg, mode);
			const sepAnsi = fgHex(theme, PALETTE.sep);
			const textAnsi = theme.getFgAnsi("text");

			type Segment = { id: string; text: string };
			const segments = (entries: [string, string | undefined][]): Segment[] =>
				entries.filter((e): e is [string, string] => !!e[1]).map(([id, text]) => ({ id, text }));
			const build = (pathMax: number) => ({
				left: segments([
					["pi", brandSegment(theme)],
					["model", modelSegment(theme, accent)],
					["path", pathSegment(theme, pathMax)],
					["git", gitSegment(theme)],
					["cost", costSegment(theme)],
				]),
				right: segments([["session_name", sessionNameSegment(theme, accent)]]),
			});

			const group = (parts: Segment[], direction: "left" | "right"): string => {
				if (parts.length === 0) return "";
				const sep = direction === "left" ? ICONS.sepLeft : ICONS.sepRight;
				const texts = parts.map(p => p.text);
				const body = `${bgAnsi}${textAnsi} ${texts.join(` ${sepAnsi}${sep}${textAnsi} `)} ${RESET}`;
				const leftCap = ICONS.capLeft ? `${capAnsi}${ICONS.capLeft}${RESET}` : "";
				const rightCap = ICONS.capRight ? `${capAnsi}${ICONS.capRight}${RESET}` : "";
				return leftCap + body + rightCap;
			};

			const usage = ctx.getContextUsage();
			const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
			const minGauge = contextWindow > 0 ? visibleWidth(usage?.percent == null ? "" : formatPercent(usage.percent)) + 4 : 1;

			// Overflow: truncate the session name, then shrink the path, then drop
			// left segments from the right (keeping the path as long as possible).
			let pathMax = 40;
			let { left, right } = build(pathMax);
			const widthOf = () => visibleWidth(group(left, "left")) + visibleWidth(group(right, "right"));
			if (right.length && widthOf() + minGauge > width) {
				const over = widthOf() + minGauge - width;
				const name = right[0];
				right = [{ ...name, text: truncateToWidth(name.text, Math.max(8, visibleWidth(name.text) - over)) }];
				if (widthOf() + minGauge > width) right = [];
			}
			while (widthOf() + minGauge > width && pathMax > 8) {
				pathMax = Math.max(8, pathMax - (widthOf() + minGauge - width));
				({ left } = build(pathMax));
			}
			while (widthOf() + minGauge > width && left.length > 0) {
				const dropIdx = left.findLastIndex(s => s.id !== "path");
				left.splice(dropIdx >= 0 ? dropIdx : left.length - 1, 1);
			}

			const leftGroup = group(left, "left");
			const rightGroup = group(right, "right");
			const gapWidth = Math.max(0, width - visibleWidth(leftGroup) - visibleWidth(rightGroup));
			return truncateToWidth(leftGroup + renderGauge(theme, gapWidth, accent, border) + rightGroup, width, "");
		};

		// ── Editor ─────────────────────────────────────────────────────────

		class OmpEditor extends CustomEditor {
			#framed = false;
			#hiddenBelow = 0;
			#merged = false;
			#mergedRow = -1;

			constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
				super(tui, theme, keybindings, { paddingX: PADDING_X });
				activeTui = tui;
			}

			// Pi applies its configured editor padding after installing a custom
			// editor (and on settings changes). The frame needs its own padding.
			setPaddingX(_padding: number): void {
				super.setPaddingX(PADDING_X);
			}

			protected renderTopBorder(width: number, hiddenLineCount: number): string {
				if (!this.#framed) return super.renderTopBorder(width, hiddenLineCount);
				const border = (s: string) => this.borderColor(s);
				const lead = BOX.h.repeat(PADDING_X - 1);
				const full = `${border(BOX.tl + lead)}${renderStatusLine(ctx.ui.theme, width - PADDING_X * 2, border)}${border(lead + BOX.tr)}`;

				const elapsed = this.#introElapsed();
				if (elapsed === undefined) return full;
				const plain = border(BOX.tl + BOX.h.repeat(width - 2) + BOX.tr);
				if (elapsed < INTRO_LAP_MS) return plain;

				// Reveal: the real status line up to a shimmering edge, plain border after it.
				const edge = Math.round(easeOut((elapsed - INTRO_LAP_MS) / INTRO_REVEAL_MS) * width);
				const theme = ctx.ui.theme;
				const shimmerCount = Math.max(0, Math.min(SHIMMER_WIDTH, width - edge));
				let shimmer = "";
				for (let i = 0; i < shimmerCount; i++) {
					shimmer += paint(cometAnsi(theme, (SHIMMER_WIDTH - 1 - i) / SHIMMER_WIDTH, elapsed / 4), BOX.h);
				}
				const restStart = edge + shimmerCount;
				return `${sliceByColumn(full, 0, edge)}${RESET}${shimmer}${sliceByColumn(plain, restStart, width - restStart)}`;
			}

			/** Milliseconds into the intro, or undefined once it is over (or disabled). */
			#introElapsed(): number | undefined {
				if (!intro) return undefined;
				intro.startedAt ??= Date.now();
				const elapsed = Date.now() - intro.startedAt;
				if (elapsed >= INTRO_LAP_MS + INTRO_REVEAL_MS) {
					stopIntro();
					return undefined;
				}
				return elapsed;
			}

			/** Paint the comet over the frame: rows `0..bottom`, clockwise from the top-left corner. */
			#drawComet(lines: string[], width: number, bottom: number, elapsed: number): void {
				const sides = Math.max(0, bottom - 1);
				const perimeter = 2 * width + 2 * sides;
				const cell = (p: number): [number, number] => {
					if (p < width) return [0, p];
					p -= width;
					if (p < sides) return [1 + p, width - 1];
					p -= sides;
					if (p < width) return [bottom, width - 1 - p];
					p -= width;
					return [bottom - 1 - p, 0];
				};
				const theme = ctx.ui.theme;
				const t = elapsed / INTRO_LAP_MS;
				const head = Math.floor(easeInOut(t) * perimeter);
				// The tail grows out of the start corner and shrinks into it at the end of the lap.
				const tail = Math.max(1, Math.round(perimeter * COMET_TAIL * Math.sin(Math.PI * Math.min(1, t))));
				for (let i = Math.min(tail, head + 1) - 1; i >= 0; i--) {
					const [row, col] = cell(head - i);
					const glyph = stripTerminalSequences(sliceByColumn(lines[row], col, 1));
					// Blank cells (an empty prompt in a merged bottom row) get a rule so the comet stays visible.
					const ch = glyph === "" || glyph === " " ? (row === 0 || row === bottom ? BOX.h : BOX.v) : glyph;
					const k = i / tail;
					const styled = i === 0 ? `\x1b[1m${paint(cometAnsi(theme, 0, 0), ch)}` : paint(cometAnsi(theme, k, elapsed / 6), ch);
					lines[row] = overlayCell(lines[row], col, width, styled);
				}
			}

			protected renderBottomBorder(width: number, hiddenLineCount: number): string {
				if (!this.#framed) return super.renderBottomBorder(width, hiddenLineCount);
				this.#hiddenBelow = hiddenLineCount;
				return BOTTOM_SENTINEL;
			}

			render(width: number): string[] {
				this.#framed = width >= MIN_FRAMED_WIDTH;
				this.#merged = false;
				this.#mergedRow = -1;
				const lines = super.render(width);
				if (!this.#framed) return lines;

				const bottomIdx = lines.indexOf(BOTTOM_SENTINEL);
				if (bottomIdx < 0) return lines;
				const border = (s: string) => this.borderColor(s);

				// Body rows start with the editor's literal left padding and end with
				// its literal right padding (at least two spaces even when the cursor
				// overflows into it); draw the frame over those cells.
				const merge = this.#hiddenBelow === 0 && bottomIdx > 1;
				const lastBody = merge ? bottomIdx - 1 : bottomIdx;
				for (let i = 1; i < lastBody; i++) {
					lines[i] = `${border(BOX.v)}${sliceByColumn(lines[i], 1, width - 2)}${border(BOX.v)}`;
				}

				if (merge) {
					// Merge the last input row into the bottom border: `╰─ text ─╯`.
					lines[lastBody] = `${border(BOX.bl + BOX.h)}${sliceByColumn(lines[lastBody], 2, width - 4)}${border(BOX.h + BOX.br)}`;
					lines.splice(bottomIdx, 1);
					this.#merged = true;
					this.#mergedRow = bottomIdx;
				} else {
					const label = this.#hiddenBelow > 0 ? ` ↓ ${this.#hiddenBelow} more ` : "";
					const fill = BOX.h.repeat(Math.max(0, width - 2 - visibleWidth(label) - 1));
					lines[bottomIdx] = border(`${BOX.bl}${BOX.h}${label}${fill}${BOX.br}`);
				}

				const elapsed = this.#introElapsed();
				if (elapsed !== undefined && elapsed < INTRO_LAP_MS) {
					this.#drawComet(lines, width, merge ? lastBody : bottomIdx, elapsed);
				}
				return lines.map(line => truncateToWidth(line, width, ""));
			}

			handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
				// Rows below the merged border shifted up one; map them back.
				if (this.#merged && event.y >= this.#mergedRow) {
					return super.handleMouse({ ...event, y: event.y + 1 });
				}
				return super.handleMouse(event);
			}
		}

		ctx.ui.setEditorComponent((tui, theme, keybindings) => new OmpEditor(tui, theme, keybindings));

		// The bar carries everything Pi's footer showed; keep only extension statuses.
		ctx.ui.setFooter((tui, theme, footerData) => {
			activeTui = tui;
			const unsubscribe = footerData.onBranchChange(() => scheduleGitRefresh(ctx.cwd));
			const footer: Component & { dispose(): void } = {
				dispose: unsubscribe,
				invalidate() {},
				render(width: number): string[] {
					const statuses = [...footerData.getExtensionStatuses().values()].filter(Boolean);
					if (statuses.length === 0) return [];
					return [truncateToWidth(` ${theme.fg("dim", statuses.join(" · "))}`, width)];
				},
			};
			return footer;
		});
	});
}
