import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderUi } from "../test/render";
import { setLanguage } from "../lib/i18n";
import { recentProjects, projectActivity } from "../lib/projectsHome";
import ProjectsHome from "./ProjectsHome";
import { activityText, dueText } from "../lib/projectsHomeText";

const sent: any[] = [];
vi.mock("../lib/wsBus", () => ({ wsSend: (msg: unknown) => { sent.push(msg); return true; } }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn(() => Promise.resolve()) }));

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

  it("montre tous les projets en cartes, du plus récent au plus ancien", () => {
    const props = setup({ onProjectSettings: vi.fn(), onRemoveProject: vi.fn() });
    const names = [...document.querySelectorAll(".ph-card .ph-card-name")].map((el) => el.textContent);
    expect(names).toEqual(["Chapitre1-Albedo", "Chapitre2-Feux", "GEO1063", "atelier-studio"]);
    // le plus récent porte « Dernier ouvert », son échéance et ses agents en cours
    const first = document.querySelector(".ph-card")!;
    expect(first.querySelector(".ph-card-line")?.textContent).toMatch(/^Dernier ouvert · Soumission /);
    expect(first.querySelector(".ph-dot")?.getAttribute("title")).toBe("2 agents en cours");
    expect(document.querySelectorAll(".ph-card .ph-dot")).toHaveLength(1);
    // ⌘1 à ⌘4, le premier toujours visible
    expect([...document.querySelectorAll(".ph-kbd")].map((el) => el.textContent)).toEqual(["⌘1", "⌘2", "⌘3", "⌘4"]);
    fireEvent.click(screen.getByRole("button", { name: /GEO1063/ }));
    expect(props.onOpen).toHaveBeenCalledWith("/p/GEO1063");
    // cartes demandées pour tous les projets
    expect(sent[0]).toMatchObject({ type: "projectCards", roots: props.projects });
  });

  it("dessine la première page : PDF, Word, premiers fichiers, ou dossier introuvable", () => {
    setup();
    act(() => {
      window.dispatchEvent(new CustomEvent("project-cards", { detail: { requestId: sent[0].requestId, cards: [
        { root: "/p/Chapitre1-Albedo", thumb: "data:image/png;base64,AAAA", journal: "The Cryosphere" },
        { root: "/p/Chapitre2-Feux", doc: "TP6/commentaires.docx", docx: {
          page: { width: 612, height: 792, top: 72, right: 72, bottom: 72, left: 72 },
          paragraphs: [
            { segments: [{ text: "TP6 — Commentaires", kind: "text", b: true }], look: { size: 16 } },
            { segments: [{ text: "Équipe 1", kind: "text" }], look: { color: "C0504D" } },
            { cell: [0, 0, 0], segments: [{ text: "Critère", kind: "text" }] },
            { cell: [0, 0, 1], segments: [{ text: "Note", kind: "text" }] },
          ] } },
        { root: "/p/GEO1063", missing: true },
        { root: "/p/atelier-studio", files: [{ name: "docs", dir: true }, { name: "README.md", dir: false }] },
      ] } }));
    });
    const cards = [...document.querySelectorAll(".ph-card")];
    expect(cards[0].querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    expect(cards[0].querySelector(".ph-card-line")?.textContent).toMatch(/^Dernier ouvert · Soumission/);
    const page = cards[1].querySelector<HTMLElement>(".ph-dx-page")!;
    expect(page.textContent).toContain("TP6 — Commentaires");
    expect(page.style.width).toBe("816px");
    expect(page.querySelectorAll(".ph-dx-table td")).toHaveLength(2);
    expect(cards[1].querySelector(".ph-card-line")?.textContent).toBe("Word");
    expect(cards[2].querySelector(".ph-card-line")?.textContent).toBe("Dossier introuvable");
    expect([...cards[3].querySelectorAll(".ph-file-name")].map((el) => el.textContent)).toEqual(["docs", "README.md"]);
  });

  it("« ⋯ » ouvre au clic les réglages, le Finder et le retrait du projet", async () => {
    const props = setup({ onProjectSettings: vi.fn(), onRemoveProject: vi.fn() });
    const more = screen.getAllByRole("button", { name: "Plus d’actions" });
    expect(more).toHaveLength(4);
    fireEvent.click(more[1]);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Réglages du projet" }));
    expect(props.onProjectSettings).toHaveBeenCalledWith("/p/Chapitre2-Feux");
    fireEvent.click(more[2]);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Retirer le projet" }));
    expect(props.onRemoveProject).toHaveBeenCalledWith("/p/GEO1063");
  });

  it("dit qu'il n'y a aucun projet", () => {
    setup({ projects: [] });
    expect(screen.getByText(/Aucun projet pour l’instant/)).toBeInTheDocument();
    expect(document.querySelector(".ph-grid")).toBeNull();
  });

  it("⌘1 à ⌘9 ouvrent les premières cartes, sans changer la disposition ; Échap ferme", () => {
    const props = setup();
    const layout = vi.fn();
    const bubble = (e: KeyboardEvent) => { if (e.metaKey) layout(e.code); };
    window.addEventListener("keydown", bubble);
    fireEvent.keyDown(window, { code: "Digit2", key: "2", metaKey: true });
    expect(props.onOpen).toHaveBeenCalledWith("/p/Chapitre2-Feux");
    fireEvent.keyDown(window, { code: "Digit4", key: "4", metaKey: true });
    expect(props.onOpen).toHaveBeenCalledWith("/p/atelier-studio");
    expect(layout).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
    window.removeEventListener("keydown", bubble);
  });

  it("le dossier choisi devient le projet, le nom tapé sert d'étiquette", async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    vi.mocked(open).mockResolvedValue("/Users/t/Documents/GEO1063/2026");
    const props = setup({ startWithNewProject: true });
    const name = await screen.findByLabelText("Nom");
    fireEvent.change(name, { target: { value: "GEO1113" } });
    fireEvent.click(screen.getByRole("button", { name: "Choisir le dossier…" }));
    await waitFor(() => expect(sent.some((m) => m.type === "createProject")).toBe(true));
    const request = sent.find((m) => m.type === "createProject");
    expect(request).toMatchObject({ folder: "/Users/t/Documents/GEO1063/2026", template: null });
    expect(request).not.toHaveProperty("name");
    act(() => {
      window.dispatchEvent(new CustomEvent("project-created", { detail: { requestId: request.requestId, root: "/Users/t/Documents/GEO1063/2026" } }));
    });
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith("/Users/t/Documents/GEO1063/2026", null, "GEO1113"));
  });

  it("sans nom, le projet porte celui du dossier", async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    vi.mocked(open).mockResolvedValue("/Users/t/Documents/Chapitre3");
    const props = setup({ startWithNewProject: true });
    const button = await screen.findByRole("button", { name: "Choisir le dossier…" });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    await waitFor(() => expect(sent.some((m) => m.type === "createProject")).toBe(true));
    const request = sent.find((m) => m.type === "createProject");
    act(() => {
      window.dispatchEvent(new CustomEvent("project-created", { detail: { requestId: request.requestId, root: "/Users/t/Documents/Chapitre3" } }));
    });
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith("/Users/t/Documents/Chapitre3", null, null));
  });
});
