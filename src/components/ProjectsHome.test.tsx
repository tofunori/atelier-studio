import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderUi } from "../test/render";
import { setLanguage } from "../lib/i18n";
import { recentProjects, projectActivity } from "../lib/projectsHome";
import ProjectsHome, { activityText, dueText } from "./ProjectsHome";

const sent: any[] = [];
vi.mock("../lib/wsBus", () => ({ wsSend: (msg: unknown) => { sent.push(msg); return true; } }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

beforeEach(() => { setLanguage("fr"); sent.length = 0; });
afterEach(cleanup);

const now = new Date(2026, 10, 8, 12, 0, 0);

describe("ordre récent des projets", () => {
  it("prend la plus récente entre l'ouverture dans Atelier et la dernière conversation", () => {
    const threads = [
      { projectRoot: "/b", updatedAt: "2026-11-08T10:00:00Z" },
      { projectRoot: "/c", updatedAt: "2026-11-01T10:00:00Z" },
    ];
    const meta = { "/c": { openedAt: Date.parse("2026-11-08T11:00:00Z") } };
    expect(recentProjects(["/a", "/b", "/c"], meta, threads)).toEqual(["/c", "/b", "/a"]);
    expect(projectActivity("/a", undefined, threads)).toBe(0);
    // à égalité (rien de connu), l'ordre du rail tient
    expect(recentProjects(["/x", "/y"], {}, [])).toEqual(["/x", "/y"]);
  });
});

describe("lignes grises des cartes", () => {
  it("dit l'échéance en jours, le jour même, le lendemain, ou la date", () => {
    expect(dueText({ date: "2026-12-01", label: "Soumission" }, now)).toBe("Soumission dans 23 jours");
    expect(dueText({ date: "2026-11-08" }, now)).toBe("Échéance aujourd’hui");
    expect(dueText({ date: "2026-11-09", label: "Cours" }, now)).toBe("Cours demain");
    expect(dueText({ date: "2027-03-01", label: "Cours" }, now)).toMatch(/^Cours le 1 mars 2027$/);
    expect(dueText({ date: "2026-11-01" }, now)).toMatch(/^Échéance passée \(1 nov\.\)$/);
    expect(dueText(undefined, now)).toBeNull();
    expect(dueText({ date: "pas une date" }, now)).toBeNull();
  });
  it("dit l'activité relative", () => {
    expect(activityText(now.getTime() - 2 * 3_600_000, now)).toBe("il y a 2 h");
    expect(activityText(now.getTime() - 30 * 3_600_000, now)).toBe("hier");
    expect(activityText(0, now)).toBeNull();
  });
});

describe("écran d'ouverture", () => {
  function setup(overrides: Partial<Parameters<typeof ProjectsHome>[0]> = {}) {
    const props = {
      projects: ["/p/Chapitre1-Albedo", "/p/Chapitre2-Feux", "/p/GEO1063", "/p/atelier-studio"],
      meta: { "/p/Chapitre1-Albedo": { due: { date: "2026-12-01", label: "Soumission" } } },
      threads: [{ projectRoot: "/p/Chapitre1-Albedo", status: "running", updatedAt: null },
        { projectRoot: "/p/Chapitre1-Albedo", status: "running", updatedAt: null }],
      connected: true,
      onOpen: vi.fn(),
      onOpenFolder: vi.fn(),
      onCreated: vi.fn(),
      onClose: vi.fn(),
      ...overrides,
    };
    renderUi(<ProjectsHome {...props} />);
    return props;
  }

  it("montre les trois derniers projets, demande leurs vignettes et affiche la réponse", async () => {
    setup();
    const cards = document.querySelectorAll(".ph-card");
    expect([...cards].map((c) => c.querySelector(".ph-name")?.textContent)).toEqual(["Chapitre1-Albedo", "Chapitre2-Feux", "GEO1063"]);
    expect(screen.getByText("2 agents en cours")).toBeInTheDocument();
    expect(sent[0]).toMatchObject({ type: "projectCards", roots: ["/p/Chapitre1-Albedo", "/p/Chapitre2-Feux", "/p/GEO1063"] });
    act(() => {
      window.dispatchEvent(new CustomEvent("project-cards", { detail: { requestId: sent[0].requestId, cards: [
        { root: "/p/Chapitre1-Albedo", thumb: "data:image/png;base64,AAAA", journal: "The Cryosphere" },
        { root: "/p/GEO1063", missing: true },
      ] } }));
    });
    expect(document.querySelector(".ph-card img")?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    expect(screen.getByText(/^The Cryosphere/)).toBeInTheDocument();
    expect(screen.getByText("Dossier introuvable")).toBeInTheDocument();
    // le reste est derrière « Tous les projets »
    expect(screen.queryByText("atelier-studio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Tous les projets/ }));
    expect(screen.getByText("atelier-studio")).toBeInTheDocument();
  });

  it("⌘1 à ⌘3 ouvrent une carte sans changer la disposition ; Échap ferme", () => {
    const props = setup();
    const layout = vi.fn();
    const bubble = (e: KeyboardEvent) => { if (e.metaKey) layout(e.code); };
    window.addEventListener("keydown", bubble);
    fireEvent.keyDown(window, { code: "Digit2", key: "2", metaKey: true });
    expect(props.onOpen).toHaveBeenCalledWith("/p/Chapitre2-Feux");
    expect(layout).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
    window.removeEventListener("keydown", bubble);
  });

  it("crée un nouveau projet à l'emplacement choisi", async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    vi.mocked(open).mockResolvedValue("/Users/t/Documents");
    const props = setup({ startWithNewProject: true });
    const name = await screen.findByLabelText("Nom");
    fireEvent.change(name, { target: { value: "Chapitre3" } });
    fireEvent.click(screen.getByRole("button", { name: "Choisir l’emplacement…" }));
    await waitFor(() => expect(sent.some((m) => m.type === "createProject")).toBe(true));
    const request = sent.find((m) => m.type === "createProject");
    expect(request).toMatchObject({ parent: "/Users/t/Documents", name: "Chapitre3", template: null });
    act(() => {
      window.dispatchEvent(new CustomEvent("project-created", { detail: { requestId: request.requestId, root: "/Users/t/Documents/Chapitre3" } }));
    });
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith("/Users/t/Documents/Chapitre3", null));
  });
});
