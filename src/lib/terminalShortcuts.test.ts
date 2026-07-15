import { describe, expect, it } from "vitest";
import { terminalShortcutFor } from "./terminalShortcuts";

function shortcut(overrides: Partial<KeyboardEvent>) {
  return terminalShortcutFor({
    altKey: false,
    code: "",
    ctrlKey: false,
    key: "",
    metaKey: true,
    shiftKey: false,
    ...overrides,
  } as KeyboardEvent);
}

describe("terminalShortcutFor", () => {
  it("uses the physical digit on French keyboards", () => {
    expect(shortcut({ code: "Digit2", key: "é" })).toEqual({ kind: "select-tab", index: 1 });
    expect(shortcut({ code: "Digit7", key: "è" })).toEqual({ kind: "select-tab", index: 6 });
  });

  it("maps Kaku-style tab and pane shortcuts", () => {
    expect(shortcut({ code: "KeyT", key: "t" })).toEqual({ kind: "new-tab" });
    expect(shortcut({ code: "KeyW", key: "w" })).toEqual({ kind: "close-tab" });
    expect(shortcut({ code: "KeyD", key: "d" })).toEqual({ kind: "split-vertical" });
    expect(shortcut({ code: "KeyD", key: "D", shiftKey: true })).toEqual({ kind: "split-horizontal" });
    expect(shortcut({ code: "BracketRight", key: "]", shiftKey: true })).toEqual({ kind: "next-tab" });
  });

  it("maps clipboard, clear and font shortcuts without stealing Ctrl commands", () => {
    expect(shortcut({ code: "KeyC", key: "c" })).toEqual({ kind: "copy" });
    expect(shortcut({ code: "KeyV", key: "v" })).toEqual({ kind: "paste" });
    expect(shortcut({ code: "KeyK", key: "k" })).toEqual({ kind: "clear" });
    expect(shortcut({ code: "Equal", key: "+" })).toEqual({ kind: "font-increase" });
    expect(shortcut({ code: "KeyC", key: "c", ctrlKey: true })).toBeNull();
  });
});
