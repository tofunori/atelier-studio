// Réglages › Claude : l'état du connecteur, les dossiers ouverts (ajout par
// le sélecteur du Mac, retrait), le code d'accès, la déconnexion et les
// dernières actions. Tout passe par une seule action (commande Tauri), qui
// répond l'état à jour.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.reject(new Error("pas de Tauri"))) }));

import { open } from "@tauri-apps/plugin-dialog";
import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage } from "../../../lib/i18n";
import { ClaudePanel, actionLabel, shortPath, when, type ClaudeStatus } from "./Claude";
import ClaudeSection from "./Claude";
import type { SectionProps } from "../shared";

const HOME = "/Users/t";
const now = Math.floor(Date.now() / 1000);

function fakeConnector(initial: ClaudeStatus) {
  let state: ClaudeStatus = { ...initial };
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const action = vi.fn(async (name: string, payload?: Record<string, unknown>) => {
    calls.push([name, payload]);
    if (name === "addRoot") state = { ...state, roots: [...(state.roots ?? []), String(payload?.path)] };
    if (name === "removeRoot") state = { ...state, roots: (state.roots ?? []).filter((r) => r !== payload?.path) };
    if (name === "enable") state = { ...state, enabled: !!payload?.on, running: !!payload?.on };
    if (name === "setCode") {
      if (String(payload?.code).length < 8) throw "le code doit avoir au moins 8 caractères";
      state = { ...state, codeSet: true, linked: false, linkedSince: null };
    }
    if (name === "disconnect") state = { ...state, linked: false, linkedSince: null };
    return state;
  });
  return { action, calls };
}

const BASE: ClaudeStatus = {
  enabled: true,
  running: true,
  byAtelier: true,
  roots: [`${HOME}/Documents/atelier-mcp-essai-tex`],
  url: "https://mac.tail.ts.net/mcp",
  home: HOME,
  codeSet: true,
  linked: true,
  client: "Claude",
  linkedSince: now - 86_400,
  activity: [
    { t: now - 60, tool: "compile_tex", path: `${HOME}/Documents/m/main_ngeo.tex`, ok: true },
    { t: now - 90, tool: "render_pdf_page", path: `${HOME}/Documents/m/main_ngeo.pdf`, ok: true },
    { t: now - 120, tool: "save_tex_file", path: `${HOME}/Documents/m/sections/results.tex`, ok: false },
  ],
};

beforeEach(() => {
  resetTestState();
  setLanguage("fr");
  vi.mocked(open).mockReset();
});
afterEach(() => cleanup());

describe("Réglages › Claude", () => {
  it("montre l'état, l'adresse, les dossiers et les dernières actions", async () => {
    const { action } = fakeConnector(BASE);
    renderUi(<ClaudePanel action={action} />);
    expect(await screen.findByText("Actif · lancé par Atelier")).toBeTruthy();
    expect(screen.getByText("https://mac.tail.ts.net/mcp")).toBeTruthy();
    expect(screen.getByText("atelier-mcp-essai-tex")).toBeTruthy();
    expect(screen.getByText("~/Documents/atelier-mcp-essai-tex")).toBeTruthy();
    expect(screen.getByText("Compilé")).toBeTruthy();
    expect(screen.getByText("main_ngeo.tex")).toBeTruthy();
    // Une page de PDF par appel : trop bavard pour le journal.
    expect(screen.queryByText("main_ngeo.pdf")).toBeNull();
    expect(screen.getByText("échec")).toBeTruthy();
    expect(screen.getByText(/^Relié le /)).toBeTruthy();
  });

  it("ajoute un dossier choisi dans le sélecteur du Mac et le retire", async () => {
    const { action, calls } = fakeConnector(BASE);
    vi.mocked(open).mockResolvedValue(`${HOME}/Documents/atelier-manuscrit-copie`);
    renderUi(<ClaudePanel action={action} />);
    await screen.findByText("atelier-mcp-essai-tex");
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: "Ajouter un dossier…" })[0]); });
    expect(vi.mocked(open)).toHaveBeenCalledWith({ directory: true, multiple: false });
    expect(await screen.findByText("atelier-manuscrit-copie")).toBeTruthy();
    expect(calls).toContainEqual(["addRoot", { path: `${HOME}/Documents/atelier-manuscrit-copie` }]);
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: "Retirer" })[0]); });
    await waitFor(() => expect(screen.queryByText("atelier-mcp-essai-tex")).toBeNull());
    // Sélecteur fermé sans choix : rien n'est envoyé.
    vi.mocked(open).mockResolvedValue(null);
    const before = calls.length;
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: "Ajouter un dossier…" })[0]); });
    expect(calls.length).toBe(before);
  });

  it("choisit le code d'accès et déconnecte Claude", async () => {
    const { action, calls } = fakeConnector(BASE);
    renderUi(<ClaudePanel action={action} />);
    const change = await screen.findByRole("button", { name: "Changer le code…" });
    await act(async () => { fireEvent.click(change); });
    const input = screen.getByPlaceholderText("8 caractères au moins") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.change(input, { target: { value: "court" } });
    expect((screen.getByRole("button", { name: "Enregistrer le code" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "glacier-albedo-2026" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enregistrer le code" })); });
    expect(calls).toContainEqual(["setCode", { code: "glacier-albedo-2026" }]);
    expect(await screen.findByText("Code enregistré. Claude devra se relier avec lui.")).toBeTruthy();
    expect(screen.queryByPlaceholderText("8 caractères au moins")).toBeNull();
    expect(screen.getByText("Pas encore relié")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Déconnecter" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("coupe le connecteur avec l'interrupteur", async () => {
    const { action, calls } = fakeConnector(BASE);
    renderUi(<ClaudePanel action={action} />);
    const toggle = await screen.findByRole("switch", { name: "Connecteur Claude" });
    await act(async () => { fireEvent.click(toggle); });
    expect(calls).toContainEqual(["enable", { on: false }]);
    expect(await screen.findByText("Coupé : Claude ne joint plus ce Mac")).toBeTruthy();
  });

  it("affiche le refus du connecteur tel quel", async () => {
    const action = vi.fn(async (name: string) => {
      if (name === "removeRoot") throw "le port 8791 est utilisé par un autre programme";
      return BASE;
    });
    renderUi(<ClaudePanel action={action} />);
    const remove = await screen.findByRole("button", { name: "Retirer" });
    await act(async () => { fireEvent.click(remove); });
    expect(await screen.findByText("le port 8791 est utilisé par un autre programme")).toBeTruthy();
  });

  it("hors de l'app (navigateur) : le dit au lieu d'une page vide", async () => {
    renderUi(<ClaudeSection {...({} as SectionProps)} />);
    expect(await screen.findByText("Ce réglage n’existe que dans l’app Atelier.")).toBeTruthy();
  });

  it("formate chemins, heures et libellés", () => {
    expect(shortPath("/Users/t/Documents/x", "/Users/t")).toBe("~/Documents/x");
    expect(shortPath("/Volumes/x", "/Users/t")).toBe("/Volumes/x");
    const ref = new Date(2026, 10, 10, 20, 0);
    expect(when(new Date(2026, 10, 10, 18, 42).getTime() / 1000, ref)).toMatch(/18/);
    expect(when(new Date(2026, 10, 9, 18, 42).getTime() / 1000, ref)).toMatch(/·/);
    expect(actionLabel("compile_tex")).toBe("Compilé");
    expect(actionLabel("outil_neuf")).toBe("Outil outil_neuf");
  });
});
