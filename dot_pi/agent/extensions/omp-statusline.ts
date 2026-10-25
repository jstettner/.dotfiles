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
 * - Left segments take distinct colors from the π logo's pink → cyan palette; git status
 *   counts keep their own colors.
 * - Named sessions get a stable accent color hashed from the name (on the name).
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
	type Color,
	colorToHex,
	colorToOkhsl,
	colorToRgb,
	foregroundAnsi,
	mixColors,
	okhslColor,
	parseColor,
	rgbColor,
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

// ── Colors (OMP dark.json / light.json statusLine* tokens) ──────────────────

// The pill fill and separator per appearance (OMP's statusLineBg / statusLineSep). Every other color on
// the pill is a dark-theme color, darkened on light themes until it reads against the fill (`onPill`).
const PILL = {
	dark: { bg: "#121212", sep: 244 },
	light: { bg: "#e0e0e0", sep: "#808080" },
};

const PALETTE = {
	staged: 70,
	untracked: 39,
};

// The left segments take spread-out stops of the π logo's pink → cyan palette (pi-powerline-footer's
// GRADIENT_COLORS: 199, 171, 135, 99, 75, 51; the model and path take 169 and 134, duller cousins of 199
// and 135), one fixed color per segment so a missing segment doesn't shift the others.
const SEGMENT_COLOR = { model: 169, path: 134, git: 75, cost: 51 };

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
// ~60 fps, for the intro and for the glow while a turn runs.
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

const isLight = (theme: Theme) => theme.appearance === "light";
const pill = (theme: Theme) => (isLight(theme) ? PILL.light : PILL.dark);
const pillBg = (theme: Theme): Color => parseColor(pill(theme).bg);

/** WCAG relative luminance. */
function luminance(color: Color): number {
	const { r, g, b } = colorToRgb(color);
	const channel = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Color, b: Color): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

// WCAG AA for normal text.
const MIN_CONTRAST = 4.5;
const onPillCache = new Map<string, Color>();

/**
 * `value` as text on the pill. Dark themes use it as is; light themes keep its hue and saturation and
 * bisect its lightness down until it meets MIN_CONTRAST against the light fill (OMP darkens its session
 * accents the same way).
 */
function onPill(theme: Theme, value: string | number | Color): string {
	const color = typeof value === "object" ? value : parseColor(value);
	if (!isLight(theme)) return foregroundAnsi(color, theme.getColorMode());
	const bg = pillBg(theme);
	const key = `${colorToHex(color)}/${colorToHex(bg)}`;
	let fitted = onPillCache.get(key);
	if (!fitted) {
		fitted = color;
		if (contrast(color, bg) < MIN_CONTRAST) {
			const { h, s, l } = colorToOkhsl(color);
			let lo = 0;
			let hi = l;
			for (let i = 0; i < 20; i++) {
				const mid = (lo + hi) / 2;
				if (contrast(okhslColor(h, s, mid), bg) >= MIN_CONTRAST) lo = mid;
				else hi = mid;
			}
			fitted = okhslColor(h, s, lo);
		}
		onPillCache.set(key, fitted);
	}
	return foregroundAnsi(fitted, theme.getColorMode());
}

function segmentAnsi(theme: Theme, segment: keyof typeof SEGMENT_COLOR): string {
	return onPill(theme, SEGMENT_COLOR[segment]);
}

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

/** 0 at `off` to 1 at `max`. */
function levelIntensity(level: string): number {
	const index = THINKING_LEVELS.indexOf(level);
	return index < 0 ? 0.5 : index / (THINKING_LEVELS.length - 1);
}

/** The thinking level in the model's pink, from faint and dusty at `off` to vivid at `max`. */
function thinkingAnsi(theme: Theme, level: string): string {
	const t = levelIntensity(level);
	const { h } = colorToOkhsl(parseColor(SEGMENT_COLOR.model));
	const s = 0.12 + t * 0.88;
	const l = isLight(theme) ? 0.62 - t * 0.2 : 0.5 + t * 0.22;
	return foregroundAnsi(okhslColor(h, s, l), theme.getColorMode());
}

// The spinner and timer while a turn runs: a pulsing pink glow, a white-hot shimmer sweeping across
// them, and a bloom that tints the status bar's background with each pulse. All of it grows with the
// thinking level. On light themes the glow deepens instead: the shimmer is ink-dark and the bloom a
// pale pink wash.

// Everything beats on one clock: each PULSE_MS the glow swells quickly to a peak at PULSE_PEAK and then
// fades slowly, the bloom spreads outward from the spinner as a soft disc of light, and the shimmer
// crosses the text as the glow peaks. The pulse starts and ends at zero, so between pulses the background is plain and no cell is
// ever left as a lit block. Terminal cells are hard-edged, so the disc's edge is a wide Gaussian.
const PULSE_MS = 1500;
const PULSE_PEAK = 0.22; // fraction of the pulse spent swelling
const PULSE_REACH = 22; // cells the bloom spreads by the end of a pulse

const pulsePhase = (elapsed: number) => (elapsed % PULSE_MS) / PULSE_MS;

/** How lit the pulse is right now (0-1): 0 at the start and end of each pulse, 1 at PULSE_PEAK. */
function pulse(elapsed: number): number {
	const phase = pulsePhase(elapsed);
	const rising = phase < PULSE_PEAK;
	const k = rising ? phase / PULSE_PEAK : (1 - phase) / (1 - PULSE_PEAK);
	// A cosine ease on each side keeps the start, peak, and end free of kinks.
	return 0.5 - 0.5 * Math.cos(Math.PI * k);
}

/** Bloom strength (0-1) at `distance` cells from the spinner (negative is to its left). */
function bloomAmount(elapsed: number, level: string, distance: number): number {
	const strength = 0.24 + 0.16 * levelIntensity(level);
	const d = Math.abs(distance);
	const radius = pulsePhase(elapsed) * PULSE_REACH;
	const width = 3.5 + pulsePhase(elapsed) * 6;
	// Inside the disc the bloom is nearly flat (its leading edge a little brighter), so the spinner never
	// sits in a darker hole with lit cells around it.
	const inside = d < radius ? 0.7 + 0.3 * Math.exp(-(((radius - d) / 6) ** 2)) : 1;
	const edge = Math.exp(-((Math.max(0, d - radius) / width) ** 2));
	const amount = strength * pulse(elapsed) * inside * edge;
	return Math.min(1, amount);
}

// Mixing in OKLCH toward a fully saturated magenta keeps faint bloom rich instead of greying out: a deep
// one on dark themes, a pale one on light themes (so the dark glow text stays readable over it).
function bloomColor(theme: Theme, amount: number): Color {
	const { h } = colorToOkhsl(parseColor(SEGMENT_COLOR.model));
	return mixColors(pillBg(theme), okhslColor(h, 1, isLight(theme) ? 0.8 : 0.42), amount, "oklch");
}

function bloomBg(theme: Theme, amount: number): string {
	return backgroundAnsi(bloomColor(theme, amount), theme.getColorMode());
}

const ESCAPE_AT = /\x1b\[[0-9;:?]*[A-Za-z]|\x1b[\]_P^][^\x07\x1b]*(?:\x07|\x1b\\)/y;
const graphemes = new Intl.Segmenter();

/** Give every cell of `line` its own background: the bloom at that column, or `baseBg` where it is ~0. */
function paintBloom(theme: Theme, line: string, baseBg: string, amountAt: (col: number) => number): string {
	let out = "";
	let col = 0;
	let i = 0;
	while (i < line.length) {
		ESCAPE_AT.lastIndex = i;
		const escape = ESCAPE_AT.exec(line);
		if (escape) {
			out += escape[0];
			i += escape[0].length;
			continue;
		}
		const end = line.indexOf("\x1b", i) < 0 ? line.length : line.indexOf("\x1b", i);
		for (const { segment } of graphemes.segment(line.slice(i, end))) {
			const amount = amountAt(col);
			out += `${amount > 0.004 ? bloomBg(theme, amount) : baseBg}${segment}`;
			col += visibleWidth(segment);
		}
		i = end;
	}
	return out;
}

function glowText(theme: Theme, text: string, elapsed: number, level: string): string {
	const mode = theme.getColorMode();
	const t = levelIntensity(level);
	const { h } = colorToOkhsl(parseColor(SEGMENT_COLOR.model));
	const chars = Array.from(text);
	const breath = pulse(elapsed);
	// The sweep crosses the middle of the text at PULSE_PEAK, when the glow peaks, and is offstage after.
	const sweep = (pulsePhase(elapsed) / (2 * PULSE_PEAK)) * (chars.length + 6) - 3;
	let out = "";
	for (let i = 0; i < chars.length; i++) {
		const shimmer = Math.max(0, 1 - Math.abs(i - sweep) / 1.6);
		const core = i === 0 ? 0.1 : 0;
		const l = isLight(theme)
			? Math.max(0.15, 0.44 - 0.06 * t - 0.08 * breath - 0.24 * shimmer - core)
			: Math.min(0.97, 0.58 + 0.1 * t + 0.1 * breath + 0.26 * shimmer + core);
		const s = Math.max(0, 0.55 + 0.35 * t - 0.6 * shimmer);
		out += `${foregroundAnsi(okhslColor(h, s, l), mode)}${chars[i]}`;
	}
	return `${out}${FG_RESET}`;
}

/** Stable per-session accent: djb2 hash of the name → OKHSL hue. */
function sessionAccent(theme: Theme, name: string | undefined): string | undefined {
	if (!name) return undefined;
	let hash = 5381;
	for (let i = 0; i < name.length; i++) {
		hash = (((hash << 5) + hash) ^ name.charCodeAt(i)) >>> 0;
	}
	return onPill(theme, okhslColor(hash % 360, 0.75, 0.72));
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

/**
 * Comet color at `k` (0 = head, 1 = tail end): a white-hot head (ink-dark on light themes) fading
 * through the hue wheel toward the background.
 */
function cometAnsi(theme: Theme, k: number, hueBase: number): string {
	const hue = (hueBase + k * 220) % 360;
	const lightness = isLight(theme) ? 0.25 + k * 0.45 : 0.95 - k * 0.5;
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

/**
 * The gauge fill: a brighter shade of the editor's current border color, which Pi sets from the thinking
 * level (or bash mode), so the fill follows it while staying distinct from the unfilled rule.
 */
function gaugeFillAnsi(theme: Theme, border: (s: string) => string): string {
	const open = border("x");
	const rgb = /\x1b\[38;2;(\d+);(\d+);(\d+)m/.exec(open);
	const indexed = /\x1b\[38;5;(\d+)m/.exec(open);
	const color = rgb
		? rgbColor(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]))
		: indexed
			? parseColor(Number(indexed[1]))
			: undefined;
	if (!color) return theme.getFgAnsi("borderAccent");
	const { h, s, l } = colorToOkhsl(color);
	const shade =
		isLight(theme)
			? okhslColor(h, Math.min(1, s + 0.15), Math.max(0, l - 0.18))
			: okhslColor(h, Math.min(1, s + 0.15), Math.min(0.92, l + 0.18));
	return foregroundAnsi(shade, theme.getColorMode());
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
		spinnerTimer = setInterval(requestRender, INTRO_FRAME_MS);
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
			return glowText(theme, `${frame} ${timer}`, Date.now() - turnStartedAt, pi.getThinkingLevel());
		};

		const modelSegment = (theme: Theme): string | undefined => {
			const model = ctx.model;
			if (!model) return undefined;
			const name = (model.name || model.id).replace(/^Claude /, "");
			const modelAnsi = segmentAnsi(theme, "model");
			let text = paint(modelAnsi, `${ICONS.model} ${name}`);
			if (model.reasoning) {
				const level = pi.getThinkingLevel();
				const label = level === "off" ? `${ICONS.off} off` : (ICONS.thinking[level] ?? level);
				text += `${paint(modelAnsi, " · ")}${paint(thinkingAnsi(theme, level), label)}`;
			}
			return text;
		};

		const pathSegment = (theme: Theme, maxLength: number): string =>
			paint(segmentAnsi(theme, "path"), `${ICONS.folder} ${displayPath(ctx.cwd, maxLength)}`);

		const gitSegment = (theme: Theme): string | undefined => {
			if (!git.branch) return undefined;
			let text = paint(segmentAnsi(theme, "git"), `${ICONS.branch} ${git.branch}`);
			const indicators: string[] = [];
			if (git.unstaged) indicators.push(paint(segmentAnsi(theme, "git"), `*${git.unstaged}`));
			if (git.staged) indicators.push(paint(onPill(theme, PALETTE.staged), `+${git.staged}`));
			if (git.untracked) indicators.push(paint(onPill(theme, PALETTE.untracked), `?${git.untracked}`));
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
			return paint(segmentAnsi(theme, "cost"), text);
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
			border: (s: string) => string,
		): string => {
			const usedColor = gaugeFillAnsi(theme, border);
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
			const segmentBg = pillBg(theme);
			const bgAnsi = backgroundAnsi(segmentBg, mode);
			const capAnsi = foregroundAnsi(segmentBg, mode);
			const sepAnsi = fgHex(theme, pill(theme).sep);
			const textAnsi = theme.getFgAnsi("text");

			type Segment = { id: string; text: string };
			const segments = (entries: [string, string | undefined][]): Segment[] =>
				entries.filter((e): e is [string, string] => !!e[1]).map(([id, text]) => ({ id, text }));
			const build = (pathMax: number) => ({
				left: segments([
					["pi", brandSegment(theme)],
					["model", modelSegment(theme)],
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
				// While a turn runs the bloom is painted across the whole group; the spinner sits at body
				// column 1, after the padding cell. It also tints the rounded cap, so the halo fades out at
				// the pill's edge instead of stopping at a hard line.
				const glowing = parts[0].id === "pi" && turnStartedAt !== undefined;
				const bloomAt = (distance: number) =>
					bloomAmount(Date.now() - (turnStartedAt ?? 0), pi.getThinkingLevel(), distance);
				const plain = `${bgAnsi}${textAnsi} ${texts.join(` ${sepAnsi}${sep}${textAnsi} `)} ${RESET}`;
				const body = glowing ? paintBloom(theme, plain, bgAnsi, col => bloomAt(col - 1)) : plain;
				const leftCapAnsi =
					glowing && direction === "left" ? foregroundAnsi(bloomColor(theme, bloomAt(-2)), mode) : capAnsi;
				const leftCap = ICONS.capLeft ? `${leftCapAnsi}${ICONS.capLeft}${RESET}` : "";
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
			return truncateToWidth(leftGroup + renderGauge(theme, gapWidth, border) + rightGroup, width, "");
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
					// Hide HumanLayer's idle/off badge locally; preserve active and error statuses.
					const statuses = [...footerData.getExtensionStatuses()]
						.filter(([key, text]) => text && !(key === "humanlayer" && stripTerminalSequences(text).trim() === "HumanLayer: off"))
						.map(([, text]) => text);
					if (statuses.length === 0) return [];
					return [truncateToWidth(` ${theme.fg("dim", statuses.join(" · "))}`, width)];
				},
			};
			return footer;
		});
	});
}
