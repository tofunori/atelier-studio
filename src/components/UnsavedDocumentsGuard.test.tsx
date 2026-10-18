// Audit 2026-10-18, problème 1 : la coquille Tauri connaît le nombre de
// documents modifiés (pour retenir la fermeture de la fenêtre) et l'app
// confirme avant de quitter.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (..._args: unknown[]) => undefined);
let quitRequested: (() => void) | null = null;
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event: string, handler: () => void) => {
    quitRequested = handler;
    return () => { quitRequested = null; };
  }),
}));

import { UnsavedDocumentsGuard, QUIT_REQUESTED_EVENT } from "./UnsavedDocumentsGuard";
import { setLanguage, t } from "../lib/i18n";
import { resetUnsavedDocumentsForTests, setDocumentUnsaved } from "../lib/unsavedDocuments";

const doc = { tabId: "t1", title: "main.tex", path: "/p/main.tex", url: "http://127.0.0.1:1/.fig_thumbs/latex_studio.html?path=%2Fp%2Fmain.tex" };

describe("UnsavedDocumentsGuard sous Tauri", () => {
  beforeEach(() => {
    setLanguage("fr");
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    invoke.mockClear();
  });
  afterEach(() => {
    cleanup();
    resetUnsavedDocumentsForTests();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("publie le nombre de documents modifiés à la coquille", async () => {
    render(<UnsavedDocumentsGuard />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("set_unsaved_documents", { count: 0 }));
    act(() => setDocumentUnsaved(doc, true));
    expect(invoke).toHaveBeenCalledWith("set_unsaved_documents", { count: 1 });
    act(() => setDocumentUnsaved(doc, false));
    expect(invoke).toHaveBeenLastCalledWith("set_unsaved_documents", { count: 0 });
  });

  it("quitter avec un document modifié demande confirmation, et Annuler garde l'app ouverte", async () => {
    render(<UnsavedDocumentsGuard />);
    act(() => setDocumentUnsaved(doc, true));
    await waitFor(() => expect(quitRequested).not.toBeNull());
    expect(QUIT_REQUESTED_EVENT).toBe("atelier-quit-requested");

    act(() => quitRequested!());
    expect(await screen.findByText(t("unsaved.quit-title"))).toBeInTheDocument();
    expect(screen.getByText(t("unsaved.quit-help", { names: "main.tex" }))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("action.cancel") }));
    await waitFor(() => expect(screen.queryByText(t("unsaved.quit-title"))).toBeNull());
    expect(invoke).not.toHaveBeenCalledWith("confirm_quit");

    act(() => quitRequested!());
    fireEvent.click(await screen.findByRole("button", { name: t("unsaved.quit-confirm") }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("confirm_quit"));
  });
});
