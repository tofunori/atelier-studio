import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({ invoke: vi.fn() }));
const events = vi.hoisted(() => ({ handlers: new Map<string, (e: { payload: unknown }) => void>() }));
const plugin = vi.hoisted(() => ({
  isPermissionGranted: vi.fn(async () => true),
  requestPermission: vi.fn(async () => "granted"),
  sendNotification: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => core);
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, handler: (e: { payload: unknown }) => void) => {
    events.handlers.set(name, handler);
    return () => events.handlers.delete(name);
  }),
}));
vi.mock("@tauri-apps/plugin-notification", () => plugin);

import {
  checkForUpdate,
  getUpdateState,
  installUpdate,
  resetUpdateStateForTests,
  shouldOpenCard,
  snoozeUpdate,
  SNOOZE_MS,
} from "./appUpdate";
import { setDocumentUnsaved, resetUnsavedDocumentsForTests, subscribeDiscardRequests, answerDiscard } from "./unsavedDocuments";

const INFO = { version: "2.5.0", currentVersion: "2.4.0", notes: null, date: null };

beforeEach(() => {
  localStorage.clear();
  resetUpdateStateForTests();
  resetUnsavedDocumentsForTests();
  events.handlers.clear();
  vi.clearAllMocks();
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("vérification", () => {
  it("une nouvelle version ouvre la carte", async () => {
    core.invoke.mockResolvedValueOnce(INFO);
    await checkForUpdate();
    expect(core.invoke).toHaveBeenCalledWith("update_check");
    expect(getUpdateState()).toMatchObject({ phase: { kind: "available", info: INFO }, cardOpen: true });
    expect(plugin.sendNotification).not.toHaveBeenCalled();
  });

  it("Atelier en arrière-plan : notification système en plus", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    core.invoke.mockResolvedValueOnce(INFO);
    await checkForUpdate();
    await vi.waitFor(() => expect(plugin.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Atelier", body: expect.stringContaining("2.5.0") }),
    ));
  });

  it("« Plus tard » tient 24 h pour la même version, pas pour la suivante", () => {
    const now = Date.now();
    localStorage.setItem("atelier-studio.update.snooze", JSON.stringify({ version: "2.5.0", until: now + SNOOZE_MS }));
    expect(shouldOpenCard("2.5.0", false, now)).toBe(false);
    expect(shouldOpenCard("2.5.0", false, now + SNOOZE_MS + 1)).toBe(true);
    expect(shouldOpenCard("2.5.1", false, now)).toBe(true);
    expect(shouldOpenCard("2.5.0", true, now)).toBe(true); // bouton « Rechercher »
  });

  it("snoozeUpdate ferme la carte et retient la version", async () => {
    core.invoke.mockResolvedValueOnce(INFO);
    await checkForUpdate();
    snoozeUpdate();
    expect(getUpdateState().cardOpen).toBe(false);
    core.invoke.mockResolvedValueOnce(INFO);
    await checkForUpdate();
    expect(getUpdateState().cardOpen).toBe(false);
  });

  it("à jour : dit « À jour » seulement après une recherche à la main", async () => {
    core.invoke.mockResolvedValueOnce(null);
    await checkForUpdate();
    expect(getUpdateState()).toMatchObject({ phase: { kind: "idle" }, upToDate: false });
    core.invoke.mockResolvedValueOnce(null);
    await checkForUpdate(true);
    expect(getUpdateState().upToDate).toBe(true);
    expect(getUpdateState().lastCheck).not.toBeNull();
  });

  it("échec silencieux en automatique, signalé à la main", async () => {
    core.invoke.mockRejectedValueOnce("offline");
    await checkForUpdate();
    expect(getUpdateState().phase.kind).toBe("idle");
    core.invoke.mockRejectedValueOnce("offline");
    await checkForUpdate(true);
    expect(getUpdateState().phase).toMatchObject({ kind: "error", info: null });
    expect(getUpdateState().cardOpen).toBe(false);
  });
});

describe("installation", () => {
  it("suit le téléchargement puis l'installation", async () => {
    core.invoke.mockResolvedValueOnce(INFO);
    await checkForUpdate();
    let finish!: () => void;
    core.invoke.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const done = installUpdate();
    await vi.waitFor(() => expect(core.invoke).toHaveBeenCalledWith("update_install"));
    events.handlers.get("atelier-update-progress")?.({ payload: { downloaded: 10, total: 40 } });
    expect(getUpdateState().phase).toMatchObject({ kind: "downloading", downloaded: 10, total: 40 });
    events.handlers.get("atelier-update-installing")?.({ payload: null });
    expect(getUpdateState().phase.kind).toBe("installing");
    finish();
    await done;
  });

  it("une erreur garde la version pour « Réessayer »", async () => {
    core.invoke.mockResolvedValueOnce(INFO);
    await checkForUpdate();
    core.invoke.mockRejectedValueOnce("signature invalide");
    await installUpdate();
    expect(getUpdateState()).toMatchObject({ phase: { kind: "error", info: INFO }, cardOpen: true });
  });

  it("un document modifié passe par la garde de sortie, et un refus annule", async () => {
    core.invoke.mockResolvedValueOnce(INFO);
    await checkForUpdate();
    setDocumentUnsaved({ tabId: "doc", title: "chapitre.tex", path: "/c.tex", url: "http://127.0.0.1:1/e" }, true);
    const off = subscribeDiscardRequests((request) => { if (request) answerDiscard(false); });
    await installUpdate();
    off();
    expect(core.invoke).not.toHaveBeenCalledWith("update_install");
    expect(getUpdateState().phase.kind).toBe("available");
  });
});
