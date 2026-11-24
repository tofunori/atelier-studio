import { describe, expect, it } from "vitest";
import { terminalInputBytes, terminalShortcutFor } from "./terminalShortcuts";

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

  it("supports Linux Ctrl+Shift terminal chords while keeping plain Ctrl for SIGINT/shell", () => {
    expect(shortcut({ metaKey: false, ctrlKey: true, shiftKey: false, code: "KeyC", key: "c" })).toBeNull();
    expect(shortcut({ metaKey: false, ctrlKey: true, shiftKey: true, code: "KeyC", key: "C" })).toEqual({ kind: "copy" });
    expect(shortcut({ metaKey: false, ctrlKey: true, shiftKey: true, code: "KeyV", key: "V" })).toEqual({ kind: "paste" });
    expect(shortcut({ metaKey: false, ctrlKey: true, shiftKey: true, code: "KeyT", key: "T" })).toEqual({ kind: "new-tab" });
    expect(shortcut({ metaKey: false, ctrlKey: true, shiftKey: true, code: "KeyW", key: "W" })).toEqual({ kind: "close-tab" });
  });
});

describe("terminalInputBytes", () => {
  const key = (overrides: Partial<KeyboardEvent>) =>
    ({
      altKey: false, code: "", ctrlKey: false, key: "", metaKey: false, shiftKey: false,
      ...overrides,
    }) as KeyboardEvent;

  it("envoie ESC DEL pour Ctrl+⌫ hors Mac (backward-kill-word de readline)", () => {
    expect(terminalInputBytes(key({ code: "Backspace", key: "Backspace", ctrlKey: true }), true))
      .toBe("\u001b\u007f");
  });

  it("ne touche pas aux raccourcis Mac, ni aux variantes avec modificateurs", () => {
    expect(terminalInputBytes(key({ code: "Backspace", ctrlKey: true }), false)).toBeNull();
    expect(terminalInputBytes(key({ code: "Backspace", ctrlKey: true, shiftKey: true }), true)).toBeNull();
    expect(terminalInputBytes(key({ code: "Backspace", ctrlKey: true, altKey: true }), true)).toBeNull();
    expect(terminalInputBytes(key({ code: "Backspace", ctrlKey: true, metaKey: true }), true)).toBeNull();
  });

  it("laisse ⌫ seul et les autres codes au terminal", () => {
    expect(terminalInputBytes(key({ code: "Backspace" }), true)).toBeNull();
    expect(terminalInputBytes(key({ code: "KeyH", key: "h", ctrlKey: true }), true)).toBeNull();
  });
});
