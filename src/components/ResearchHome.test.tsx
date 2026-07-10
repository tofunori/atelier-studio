// ResearchHome (plan 017) — RTL : actions principales, clavier natif,
// ouverture artefact, absence de sections vides, budget d'une action
// primaire, sidecar offline, texte long tronqué par CSS (title accessible).
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { ResearchHome, focusComposer, type ResearchHomeActions } from "./ResearchHome";
import { deriveResearchHomeModel, type ResearchHomeInputs } from "../lib/researchHome";
import { setLanguage } from "../lib/i18n";
import type { Thread } from "../lib/ws";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));

const NOW = Date.parse("2026-07-09T18:00:00Z");
const PROJ = "/Users/tofunori/thesis";

function actions(overrides: Partial<ResearchHomeActions> = {}): ResearchHomeActions {
  return {
    onNewChat: vi.fn(),
    onOpenProject: vi.fn(),
    onResume: vi.fn(),
    onOpenArtefact: vi.fn(),
    onOpenGallery: vi.fn(),
    onOpenPalette: vi.fn(),
    onResumeSession: vi.fn(),
    ...overrides,
  };
}

function thread(partial: Partial<Thread> & { id: string }): Thread {
  return {
    projectRoot: PROJ, title: `T-${partial.id}`, provider: "claude", sessionId: null,
    status: "idle", updatedAt: "2026-07-09T17:30:00Z", ...partial,
  };
}

function model(partial: Partial<ResearchHomeInputs> = {}) {
  return deriveResearchHomeModel({
    activeProject: PROJ, projectName: "Thèse albédo", threads: [], events: {},
    workingSince: {}, usageByThread: {}, recentFiles: [],
    files: partial.files ?? partial.recentFiles ?? [],
    sidecar: "ready", atelierError: null, now: NOW, ...partial,
  });
}

describe("ResearchHome", () => {
  it("zéro projet : titre factuel + action Ouvrir un projet, aucune section", () => {
    const a = actions();
    render(<ResearchHome model={model({ activeProject: null })} actions={a} />);
    expect(screen.getByText("Aucun projet ouvert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir un projet" }));
    expect(a.onOpenProject).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Continuer")).toBeNull();
    expect(screen.queryByText("Démarrer")).toBeNull();
  });

  it("projet sans thread : Démarrer visible, hint neutre, pas de section À traiter ni Artefacts", () => {
    render(<ResearchHome model={model()} actions={actions()} />);
    expect(screen.getByText("Thèse albédo")).toBeInTheDocument();
    expect(screen.getByText("~/thesis")).toBeInTheDocument();
    expect(screen.getByText("Aucune conversation dans ce projet pour l'instant.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Démarrer" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "À traiter" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Artefacts récents" })).toBeNull();
  });

  it("une seule action primaire : Nouveau chat dans l'en-tête", () => {
    const { container } = render(
      <ResearchHome
        model={model({ threads: [thread({ id: "a", status: "done" })] })}
        actions={actions()}
      />,
    );
    expect(container.querySelectorAll(".ui-btn--primary")).toHaveLength(1);
    expect(container.querySelector(".ui-btn--primary")).toHaveTextContent("Nouveau chat");
  });

  it("Continuer : Reprendre appelle onResume avec thread + projet ; date relative jamais seule (ISO en title)", () => {
    const a = actions();
    render(
      <ResearchHome
        model={model({
          threads: [thread({ id: "a", status: "done", updatedAt: "2026-07-09T17:30:00Z" })],
          events: { a: [{ kind: "done", ok: true, result: "Figure 3 rewrappée" }] },
        })}
        actions={a}
      />,
    );
    expect(screen.getByText("Figure 3 rewrappée")).toBeInTheDocument();
    expect(screen.getByText("terminé")).toBeInTheDocument();
    expect(screen.getByTitle("2026-07-09T17:30:00Z")).toHaveTextContent("il y a 30 min");
    fireEvent.click(screen.getByRole("button", { name: "Reprendre" }));
    expect(a.onResume).toHaveBeenCalledWith("a", PROJ);
  });

  it("tour en cours : badge running, durée, « Revenir au thread »", () => {
    render(
      <ResearchHome
        model={model({
          threads: [thread({ id: "r", status: "running" })],
          workingSince: { r: NOW - 154_000 },
        })}
        actions={actions()}
      />,
    );
    expect(screen.getByText("en cours")).toBeInTheDocument();
    expect(screen.getByText("depuis 2 min")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revenir au thread" })).toBeInTheDocument();
  });

  it("sidecar hors ligne : badge dégradé + notice erreur (role=alert)", () => {
    render(<ResearchHome model={model({ sidecar: "disconnected" })} actions={actions()} />);
    expect(screen.getByText("connexion dégradée")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Sidecar déconnecté");
  });

  it("démarrage à froid : squelette sobre, ni alerte, ni faux « aucune conversation »", () => {
    const { container } = render(<ResearchHome model={model({ sidecar: "connecting" })} actions={actions()} />);
    expect(container.querySelector(".rh-skeleton")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("connexion dégradée")).toBeNull();
    expect(screen.queryByText("Aucune conversation dans ce projet pour l'instant.")).toBeNull();
    // la géométrie générale reste : Démarrer visible
    expect(screen.getByRole("region", { name: "Démarrer" })).toBeInTheDocument();
  });

  it("focusComposer : rend le focus au textarea du composer (convention après Reprendre)", async () => {
    const host = document.createElement("div");
    host.className = "composer";
    const ta = document.createElement("textarea");
    host.appendChild(ta);
    document.body.appendChild(host);
    try {
      focusComposer();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      expect(document.activeElement).toBe(ta);
    } finally {
      host.remove();
    }
  });

  it("thread interrompu dans À traiter : message du record + Reprendre ciblé, sans doublon avec Continuer", () => {
    const a = actions();
    render(
      <ResearchHome
        model={model({
          threads: [
            // le plus récent occupe Continuer ; l'interrompu plus ancien va
            // dans À traiter (le même thread n'apparaît jamais aux deux endroits)
            thread({ id: "ok", title: "Relecture ch. 3", status: "done", updatedAt: "2026-07-09T17:45:00Z" }),
            thread({ id: "err", title: "Extraction MOD10A1", updatedAt: "2026-07-09T16:00:00Z" }),
          ],
          events: { err: [{ kind: "error", message: "CLI manquant" }] },
        })}
        actions={a}
      />,
    );
    const region = screen.getByRole("region", { name: "À traiter" });
    expect(region).toHaveTextContent("Extraction MOD10A1 — interrompu");
    expect(region).toHaveTextContent("CLI manquant");
    expect(within(region).queryByText("Relecture ch. 3")).toBeNull();
    fireEvent.click(within(region).getByRole("button", { name: "Reprendre" }));
    expect(a.onResume).toHaveBeenCalledWith("err", PROJ);
  });

  it("artefacts : lignes-boutons à clé stable, ouverture Atelier, source visible", () => {
    const a = actions();
    render(
      <ResearchHome
        model={model({ recentFiles: ["figs/albedo_saisonnier_2024_final_v3.pdf", "scripts/extract.py"] })}
        actions={a}
      />,
    );
    const row = screen.getByRole("button", { name: /albedo_saisonnier_2024_final_v3\.pdf/ });
    expect(row).toHaveTextContent("figs");
    expect(row).toHaveTextContent("figure");
    fireEvent.click(row);
    expect(a.onOpenArtefact).toHaveBeenCalledWith("figs/albedo_saisonnier_2024_final_v3.pdf");
    expect(row.title).toContain("figs/albedo_saisonnier_2024_final_v3.pdf");
  });

  it("Démarrer : les quatre vrais workflows sont câblés", () => {
    const a = actions();
    render(<ResearchHome model={model()} actions={a} />);
    const start = within(screen.getByRole("region", { name: "Démarrer" }));
    fireEvent.click(start.getByRole("button", { name: "Nouveau chat" }));
    expect(a.onNewChat).toHaveBeenCalledTimes(1);
    fireEvent.click(start.getByRole("button", { name: "Rechercher un fichier…" }));
    expect(a.onOpenPalette).toHaveBeenCalledTimes(1);
    fireEvent.click(start.getByRole("button", { name: "Ouvrir la galerie" }));
    expect(a.onOpenGallery).toHaveBeenCalledTimes(1);
    fireEvent.click(start.getByRole("button", { name: "Reprendre une session" }));
    expect(a.onResumeSession).toHaveBeenCalledTimes(1);
  });

  it("ordre Tab suit la hiérarchie : primaire d'en-tête avant Reprendre avant les artefacts", () => {
    render(
      <ResearchHome
        model={model({
          threads: [thread({ id: "a", status: "done" })],
          recentFiles: ["notes.md"],
        })}
        actions={actions()}
      />,
    );
    const buttons = screen.getAllByRole("button");
    const labels = buttons.map((b) => b.textContent);
    const iPrimary = labels.findIndex((l) => l === "Nouveau chat");
    const iResume = labels.findIndex((l) => l === "Reprendre");
    const iArtefact = labels.findIndex((l) => l?.includes("notes.md"));
    expect(iPrimary).toBeGreaterThanOrEqual(0);
    expect(iPrimary).toBeLessThan(iResume);
    expect(iResume).toBeLessThan(iArtefact);
  });
});
