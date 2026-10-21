import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  isPermissionGranted: vi.fn(async () => true),
  requestPermission: vi.fn(async () => "granted"),
  sendNotification: vi.fn(),
}));
const sonner = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@tauri-apps/plugin-notification", () => plugin);
vi.mock("sonner", () => sonner);

import { notifyRunDone } from "./notify";
import { resetNotifyPrefsForTests, setInAppEnabled, setSystemEnabled } from "./notifyPrefs";

function focus(focused: boolean) {
  vi.spyOn(document, "hasFocus").mockReturnValue(focused);
}

beforeEach(() => {
  localStorage.clear();
  resetNotifyPrefsForTests();
  vi.clearAllMocks();
});
afterEach(() => vi.restoreAllMocks());

describe("notifyRunDone", () => {
  it("Atelier en arrière-plan : notification macOS", async () => {
    focus(false);
    expect(await notifyRunDone({ threadId: "t", title: "Calibration", ok: true, summary: "fini" })).toBe(true);
    expect(plugin.sendNotification).toHaveBeenCalledWith(expect.objectContaining({ title: "Calibration", body: "fini" }));
    expect(sonner.toast).not.toHaveBeenCalled();
  });

  it("Atelier devant, autre fil : bandeau avec « Ouvrir », pas de notification macOS", async () => {
    focus(true);
    const onOpen = vi.fn();
    expect(await notifyRunDone({ threadId: "t", title: "Autorisation demandée", ok: true, summary: "Bash", visible: false, onOpen })).toBe(true);
    expect(plugin.sendNotification).not.toHaveBeenCalled();
    const [title, options] = sonner.toast.mock.calls[0] as unknown as [string, { description: string; action: { label: string; onClick: () => void } }];
    expect(title).toBe("Autorisation demandée");
    expect(options.description).toBe("Bash");
    options.action.onClick();
    expect(onOpen).toHaveBeenCalled();
  });

  it("Atelier devant sur ce fil : rien", async () => {
    focus(true);
    expect(await notifyRunDone({ threadId: "t", title: "x", ok: true, summary: "", visible: true })).toBe(false);
    expect(sonner.toast).not.toHaveBeenCalled();
    expect(plugin.sendNotification).not.toHaveBeenCalled();
  });

  it("chaque canal se coupe dans les réglages", async () => {
    setInAppEnabled(false);
    focus(true);
    expect(await notifyRunDone({ threadId: "t", title: "x", ok: true, summary: "", visible: false })).toBe(false);
    setSystemEnabled(false);
    focus(false);
    expect(await notifyRunDone({ threadId: "t", title: "x", ok: true, summary: "" })).toBe(false);
    expect(plugin.sendNotification).not.toHaveBeenCalled();
    expect(sonner.toast).not.toHaveBeenCalled();
  });
});
