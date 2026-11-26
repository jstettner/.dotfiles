/**
 * The bash commands bash-guard blocks, as pure functions of the command line so they can be tested alone.
 *
 * The parsing is deliberately rough: it splits on shell separators and whitespace and strips one level of
 * quotes. It catches the forms agents actually write, not every way a shell can spell them.
 */
import { homedir } from "node:os";

const home = homedir();

/** Seconds a bash command may run when the agent doesn't pass a timeout; it can always pass a longer one. */
export const DEFAULT_TIMEOUT_SECONDS = 120;

const HOME_ALIASES = ["~", "$HOME", "${HOME}"];

/** Top-level directories that hold everything, or the system. */
const TOP_LEVEL = ["/Users", "/System", "/Library", "/Applications", "/Volumes", "/private", "/home", "/usr", "/bin", "/sbin", "/etc", "/var", "/opt"];

/** Words that run the next word as a command. */
const PREFIXES = new Set(["sudo", "time", "nice", "nohup", "command", "exec", "xargs", "doas"]);

const unquote = (word: string): string => word.replace(/^(['"])(.*)\1$/, "$2");

/** Each simple command in `command`, as its program's name and its arguments. */
function commands(command: string): Array<{ name: string; args: string[] }> {
	return command.split(/\|\||&&|[;|&\n()`]|\$\(/).map((segment) => {
		const words = segment.trim().split(/\s+/).filter(Boolean).map(unquote);
		while (words.length > 0 && (PREFIXES.has(words[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]))) words.shift();
		const [program = "", ...args] = words;
		return { name: program.split("/").pop() ?? "", args };
	});
}

/** `path` with `~`, `$HOME` and `${HOME}` spelled as the home directory, and trailing `/` and `/*` removed. */
function normalize(path: string): string {
	let resolved = path;
	for (const alias of HOME_ALIASES) {
		if (resolved === alias || resolved.startsWith(`${alias}/`)) resolved = home + resolved.slice(alias.length);
	}
	while (/(\/\*?)$/.test(resolved) && resolved !== "/") resolved = resolved.replace(/\/\*?$/, "") || "/";
	return resolved;
}

// ---- Searches of the whole disk -------------------------------------------------------------------------------

/** Searches whose every path argument is walked recursively. */
const SEARCHES = new Set(["find", "fd", "fdfind", "rg", "ag", "du", "tree"]);
/** Searches that walk their paths only when given a recursive flag. */
const SEARCHES_WITH_FLAG: Record<string, RegExp> = {
	grep: /^(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive|--dereference-recursive)$/,
	ls: /^-[a-zA-Z]*R[a-zA-Z]*$/,
};
/** Too large to search; small system directories such as `/etc` search quickly. */
const SEARCH_ROOTS = new Set(["/", home, "/Users", "/System", "/Library", "/Volumes", "/private", "/home"]);
const SHALLOW = 2; // `find / -maxdepth 2` lists, it doesn't search

/** Returns the searched path when `command` searches the whole disk, the home directory or a top-level directory. */
export function wholeDiskScan(command: string): string | undefined {
	for (const { name, args } of commands(command)) {
		const flag = SEARCHES_WITH_FLAG[name];
		if (!SEARCHES.has(name) && !(flag && args.some((arg) => flag.test(arg)))) continue;
		const depth = args.indexOf("-maxdepth");
		if (name === "find" && depth >= 0 && Number(args[depth + 1]) <= SHALLOW) continue;
		const root = args.find((arg) => !arg.startsWith("-") && SEARCH_ROOTS.has(normalize(arg)) && !arg.endsWith("*"));
		if (root) return root;
	}
	return undefined;
}

// ---- Recursive deletion of the disk or the home directory ----------------------------------------------------

const RECURSIVE_FLAG = /^(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)$/;

/** Whether deleting `path` recursively would take the system, a top-level directory, the home directory or one of its own directories. */
function irreplaceable(path: string): boolean {
	const resolved = normalize(path);
	if (resolved === "/" || resolved === "" || TOP_LEVEL.includes(resolved) || resolved === home) return true;
	// The home directory's own directories: ~/src, ~/Documents, ~/.ssh, ~/Library.
	return resolved.startsWith(`${home}/`) && !resolved.slice(home.length + 1).includes("/");
}

/** Returns the target when `command` recursively deletes the root, a top-level directory, the home directory or one of its directories. */
export function destructiveRemoval(command: string): string | undefined {
	for (const { name, args } of commands(command)) {
		if (name !== "rm") continue;
		if (args.includes("--no-preserve-root")) return "/";
		if (!args.some((arg) => RECURSIVE_FLAG.test(arg))) continue;
		const target = args.find((arg) => !arg.startsWith("-") && irreplaceable(arg));
		if (target) return target;
	}
	return undefined;
}
