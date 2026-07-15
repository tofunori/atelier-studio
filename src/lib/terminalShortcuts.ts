export type TerminalShortcut =
  | { kind: "new-tab" }
  | { kind: "close-tab" }
  | { kind: "previous-tab" }
  | { kind: "next-tab" }
  | { kind: "select-tab"; index: number }
  | { kind: "split-vertical" }
  | { kind: "split-horizontal" }
  | { kind: "clear" }
  | { kind: "copy" }
  | { kind: "paste" }
  | { kind: "select-all" }
  | { kind: "font-increase" }
  | { kind: "font-decrease" }
  | { kind: "font-reset" };

type TerminalKeyEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

/**
 * Resolve macOS terminal shortcuts from physical key codes first. This keeps
 * Cmd+1…9 working on layouts where Digit2 produces "é", Digit7 produces "è",
 * etc. `key` remains a fallback for bracket navigation generated with Option.
 */
export function terminalShortcutFor(event: TerminalKeyEvent): TerminalShortcut | null {
  if (!event.metaKey || event.ctrlKey) return null;

  const digit = /^Digit([1-9])$/.exec(event.code);
  if (digit && !event.shiftKey && !event.altKey) {
    return { kind: "select-tab", index: Number(digit[1]) - 1 };
  }

  if (event.altKey && ["ArrowLeft", "ArrowUp"].includes(event.code)) return { kind: "previous-tab" };
  if (event.altKey && ["ArrowRight", "ArrowDown"].includes(event.code)) return { kind: "next-tab" };
  if (event.shiftKey && (event.code === "BracketLeft" || event.key === "[")) return { kind: "previous-tab" };
  if (event.shiftKey && (event.code === "BracketRight" || event.key === "]")) return { kind: "next-tab" };

  if (event.altKey || event.shiftKey) {
    if (event.shiftKey && !event.altKey && event.code === "KeyD") return { kind: "split-horizontal" };
    return null;
  }

  switch (event.code) {
    case "KeyT": return { kind: "new-tab" };
    case "KeyW": return { kind: "close-tab" };
    case "KeyD": return { kind: "split-vertical" };
    case "KeyK": return { kind: "clear" };
    case "KeyC": return { kind: "copy" };
    case "KeyV": return { kind: "paste" };
    case "KeyA": return { kind: "select-all" };
    case "Equal":
    case "NumpadAdd": return { kind: "font-increase" };
    case "Minus":
    case "NumpadSubtract": return { kind: "font-decrease" };
    case "Digit0":
    case "Numpad0": return { kind: "font-reset" };
    default: return null;
  }
}
