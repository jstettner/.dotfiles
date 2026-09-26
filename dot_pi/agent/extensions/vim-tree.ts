import { TreeSelectorComponent, type ExtensionAPI, type Theme, type ThemeColor } from "@earendil-works/pi-coding-agent";
import {
  getKeybindings,
  matchesKey,
  stripTerminalSequences,
  truncateToWidth,
  type Keybinding,
} from "@earendil-works/pi-tui";

type Mode = "normal" | "search" | "label";
type VimState = { mode: Mode; pendingG: boolean };
type Originals = {
  handleInput: TreeSelectorComponent["handleInput"];
  render: TreeSelectorComponent["render"];
  ownRender: boolean;
};

// Extensions share pi's TreeSelectorComponent class, so patching its prototype covers the
// built-in /tree and /carry alike. The originals live on the prototype so /reload swaps the
// wrapper instead of stacking another one.
const ORIGINALS: unique symbol = Symbol.for("vim-tree.originals");
type PatchableProto = TreeSelectorComponent & { [ORIGINALS]?: Originals };

// Every action the tree list handles. A printable key bound to one of these (shift+l and
// shift+t by default) still reaches the tree in normal mode; other printable keys are dropped.
const TREE_ACTIONS: Keybinding[] = [
  "tui.select.up", "tui.select.down", "tui.select.pageUp", "tui.select.pageDown",
  "tui.select.confirm", "tui.select.cancel", "tui.editor.cursorLeft", "tui.editor.cursorRight",
  "tui.editor.deleteCharBackward", "app.tree.foldOrUp", "app.tree.unfoldOrDown", "app.message.copy",
  "app.tree.editLabel", "app.tree.toggleLabelTimestamp", "app.tree.filter.default",
  "app.tree.filter.noTools", "app.tree.filter.userOnly", "app.tree.filter.labeledOnly",
  "app.tree.filter.all", "app.tree.filter.cycleForward", "app.tree.filter.cycleBackward",
];

const MODIFIER_BITS: Record<string, number> = { shift: 1, alt: 2, ctrl: 4, super: 8 };
const CSI_FINAL: Record<string, string> = { up: "A", down: "B", right: "C", left: "D", home: "H", end: "F" };
const CSI_TILDE: Record<string, number> = { insert: 2, delete: 3, pageup: 5, pagedown: 6 };
const CODEPOINTS: Record<string, number> = {
  escape: 27, esc: 27, enter: 13, return: 13, tab: 9, space: 32, backspace: 127,
};

// Raw input candidates for a key id such as "ctrl+left"; sequenceFor keeps whichever pi-tui matches.
function encodeKey(key: string): string[] {
  let bits = 0;
  let base = key;
  let modifier: RegExpExecArray | null;
  while ((modifier = /^(ctrl|shift|alt|super)\+(.+)$/.exec(base))) {
    bits |= MODIFIER_BITS[modifier[1]];
    base = modifier[2];
  }
  const name = base.length > 1 ? base.toLowerCase() : base;
  const mod = bits + 1;
  const final = CSI_FINAL[name];
  if (final) return [bits ? `\x1b[1;${mod}${final}` : `\x1b[${final}`];
  const tilde = CSI_TILDE[name];
  if (tilde) return [bits ? `\x1b[${tilde};${mod}~` : `\x1b[${tilde}~`];
  const codepoint = CODEPOINTS[name] ?? (name.length === 1 ? name.codePointAt(0) : undefined);
  if (codepoint === undefined) return [];
  return bits ? [`\x1b[${codepoint};${mod}u`] : [String.fromCodePoint(codepoint), `\x1b[${codepoint}u`];
}

// Input that triggers an action under the user's current bindings, so remapped keys keep working.
function sequenceFor(action: Keybinding): string | undefined {
  const kb = getKeybindings();
  for (const key of kb.getKeys(action)) {
    const sequence = encodeKey(key).find((candidate) => kb.matches(candidate, action));
    if (sequence !== undefined) return sequence;
  }
  return undefined;
}

// Mirrors the tree's own test for keys that go to its search query.
function isPrintable(data: string): boolean {
  return data.length > 0 && ![...data].some((ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
  });
}

function modeLine(mode: "normal" | "search", query: string, theme: Theme | undefined): string {
  const fg = (color: ThemeColor, text: string) => theme ? theme.fg(color, text) : text;
  if (mode === "search") {
    return `  ${fg("muted", "SEARCH")}  ${fg("accent", `/${query}`)}  ${fg("dim", "enter done · esc clear")}`;
  }
  const filter = query ? `${fg("accent", `/${query}`)}  ` : "";
  return `  ${fg("muted", "NORMAL")}  ${filter}`
    + fg("dim", "j/k move · h/l fold · gg/G ends · / search · y copy · q quit");
}

function patchTreeSelector(getTheme: () => Theme | undefined): (() => void) | undefined {
  const proto: PatchableProto = TreeSelectorComponent.prototype;
  if (typeof proto.getTreeList !== "function" || typeof proto.handleInput !== "function") return undefined;
  const originals = proto[ORIGINALS] ??= {
    handleInput: proto.handleInput,
    render: proto.render,
    ownRender: Object.hasOwn(proto, "render"),
  };

  const states = new WeakMap<TreeSelectorComponent, VimState>();
  const stateOf = (selector: TreeSelectorComponent) => {
    let state = states.get(selector);
    if (!state) {
      state = { mode: "normal", pendingG: false };
      states.set(selector, state);
    }
    return state;
  };

  function handleInput(this: TreeSelectorComponent, data: string): void {
    const kb = getKeybindings();
    const state = stateOf(this);
    const list = this.getTreeList();
    const send = (key: string) => {
      // The label editor takes over input until it saves or cancels.
      const opensLabel = kb.matches(key, "app.tree.editLabel") && list.getSelectedNode() !== undefined;
      originals.handleInput.call(this, key);
      if (opensLabel) state.mode = "label";
    };
    const run = (action: Keybinding) => {
      const key = sequenceFor(action);
      if (key !== undefined) send(key);
    };
    // Page until the selection stops moving.
    const jump = (action: Keybinding) => {
      const key = sequenceFor(action);
      if (key === undefined) return;
      for (let i = 0; i < 10_000; i++) {
        const before = list.getSelectedNode();
        send(key);
        if (list.getSelectedNode() === before) return;
      }
    };

    if (state.mode === "label") {
      originals.handleInput.call(this, data);
      if (kb.matches(data, "tui.select.confirm") || kb.matches(data, "tui.select.cancel")) state.mode = "normal";
      return;
    }

    if (state.mode === "search") {
      const query = list.getSearchQuery();
      if (kb.matches(data, "tui.select.confirm")) {
        state.mode = "normal";
      } else if (kb.matches(data, "tui.select.cancel")) {
        // Escape with an empty query would close the tree; only leave search mode.
        if (query) send(data);
        state.mode = "normal";
      } else if (kb.matches(data, "tui.editor.deleteCharBackward") && !query) {
        state.mode = "normal";
      } else {
        send(data);
      }
      return;
    }

    const pendingG = state.pendingG;
    state.pendingG = false;
    if (matchesKey(data, "j")) run("tui.select.down");
    else if (matchesKey(data, "k")) run("tui.select.up");
    else if (matchesKey(data, "h")) run("app.tree.foldOrUp");
    else if (matchesKey(data, "l")) run("app.tree.unfoldOrDown");
    else if (matchesKey(data, "g")) {
      if (pendingG) jump("tui.select.pageUp");
      else state.pendingG = true;
    } else if (matchesKey(data, "shift+g")) jump("tui.select.pageDown");
    else if (matchesKey(data, "y")) run("app.message.copy");
    else if (matchesKey(data, "q")) {
      // The first escape only clears an active query.
      if (list.getSearchQuery()) run("tui.select.cancel");
      run("tui.select.cancel");
    } else if (matchesKey(data, "/")) state.mode = "search";
    else if (!isPrintable(data) || TREE_ACTIONS.some((action) => kb.matches(data, action))) send(data);
  }

  // Replace the "Type to search:" line with the mode line, or append it if that line moved.
  function render(this: TreeSelectorComponent, width: number): string[] {
    const lines = originals.render.call(this, width);
    const { mode } = stateOf(this);
    if (mode === "label") return lines;
    const line = truncateToWidth(modeLine(mode, this.getTreeList().getSearchQuery(), getTheme()), width);
    const index = lines.findIndex((l) => stripTerminalSequences(l).trimStart().startsWith("Type to search:"));
    if (index === -1) lines.push(line);
    else lines[index] = line;
    return lines;
  }

  proto.handleInput = handleInput;
  proto.render = render;
  return () => {
    // Leave a newer runtime's wrapper in place.
    if (proto.handleInput === handleInput) proto.handleInput = originals.handleInput;
    if (proto.render === render) {
      if (originals.ownRender) proto.render = originals.render;
      else delete (proto as Partial<PatchableProto>).render;
    }
  };
}

export default function vimTree(pi: ExtensionAPI) {
  let theme: Theme | undefined;
  const unpatch = patchTreeSelector(() => theme);

  pi.on("session_start", (_event, ctx) => {
    theme = ctx.ui.theme;
    if (!unpatch && ctx.mode === "tui") {
      ctx.ui.notify("vim-tree: pi's tree selector changed shape; vim keys are disabled.", "warning");
    }
  });
  pi.on("session_shutdown", (event) => {
    if (event.reason === "reload") unpatch?.();
  });
}
