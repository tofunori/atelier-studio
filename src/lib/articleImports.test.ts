// Suivi d'un import d'article : ce que l'utilisateur peut VOIR pendant et
// après. Deux comportements se sont révélés à l'usage — une conversion de
// plusieurs minutes qui ne disait rien, et une écriture qui effaçait sa propre
// trace. Les deux sont couverts ici.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./notify", () => ({ notifyArticleReady: vi.fn(async () => {}) }));
vi.mock("../components/ui/toast", () => ({ showUndo: vi.fn(async () => {}) }));
vi.mock("./wsBus", () => ({ wsSend: vi.fn(() => true) }));

import {
  articleImportSnapshot, closeArticleDialog, resetArticleImportForTests,
  stageLabel, startArticleImport,
} from "./articleImports";
import { wsSend } from "./wsBus";
import { setLanguage } from "./i18n";

function jobs() {
  return articleImportSnapshot().jobs;
}

function emit(type: string, detail: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

beforeEach(() => {
  resetArticleImportForTests();
  setLanguage("fr");
  localStorage.clear();
});
afterEach(() => vi.clearAllMocks());

describe("étapes de conversion", () => {
  it("porte l'étape reçue sur le job qui convertit", () => {
    startArticleImport("/tmp/aoki.pdf");
    const id = jobs()[0].requestId;
    emit("article-progress", { requestId: id, stage: "converting", seconds: 42 });
    expect(jobs()[0].stage).toBe("converting");
    expect(jobs()[0].stageSeconds).toBe(42);
    expect(stageLabel(jobs()[0])).toBe("Conversion chez MinerU — 42 s");
  });

  it("dit chaque étape en clair, et retombe sur le compteur avant la première", () => {
    startArticleImport("/tmp/aoki.pdf");
    const job = jobs()[0];
    expect(stageLabel({ ...job, startedAt: Date.now() - 8000 })).toMatch(/Conversion en cours — [78] s/);
    expect(stageLabel({ ...job, stage: "upload" })).toBe("Envoi du PDF…");
    expect(stageLabel({ ...job, stage: "meta" })).toBe("Métadonnées (Zotero, Crossref)…");
    expect(stageLabel({ ...job, stage: "duplicates" })).toBe("Recherche de doublons…");
    expect(stageLabel({ ...job, stage: "figures", stageCount: 16 })).toBe("16 figures extraites");
  });

  it("ignore une étape en retard sur une fiche déjà terminée", () => {
    startArticleImport("/tmp/aoki.pdf");
    const id = jobs()[0].requestId;
    emit("article-imported", { requestId: id, draftId: "d1", path: "/tmp/aoki.pdf", duplicates: [] });
    const phase = jobs()[0]?.phase;
    emit("article-progress", { requestId: id, stage: "upload" });
    expect(jobs()[0]?.phase).toBe(phase);
    expect(jobs()[0]?.stage ?? null).toBeNull();
  });
});

describe("trace après écriture automatique", () => {
  // PIÈGE (vécu) : la fiche disparaissait dès l'écriture. Le toast s'efface
  // seul et la notification système ne part que si l'app n'a PAS le focus —
  // donc, app à l'écran, l'import se terminait sans laisser aucune trace.
  function ecrireAutomatiquement() {
    startArticleImport("/tmp/aoki.pdf");
    const id = jobs()[0].requestId;
    emit("article-imported", {
      requestId: id, draftId: "d1", path: "/tmp/aoki.pdf", slug: "articles/aoki-2011",
      duplicates: [{ slug: "articles/aoki-2011", why: "doi" }],
    });
    // autoWrite a posté un articleWrite : son requestId est la clé du retour
    const envoyé = vi.mocked(wsSend).mock.calls
      .map(([msg]) => msg as { type?: string; requestId?: string })
      .find((msg) => msg?.type === "articleWrite");
    expect(envoyé).toBeTruthy();
    return { id, writeId: String(envoyé?.requestId ?? "") };
  }

  it("garde la fiche écrite, avec sa page et le moment", () => {
    const { id, writeId } = ecrireAutomatiquement();
    expect(jobs()[0].phase).toBe("writing");
    emit("article-written", { requestId: writeId, slug: "articles/aoki-2011", updated: false });
    const job = jobs().find((entry) => entry.requestId === id);
    expect(job?.phase).toBe("done");
    expect(job?.writtenSlug).toBe("articles/aoki-2011");
    expect(job?.doneAt).toBeGreaterThan(0);
  });

  it("distingue une page créée d'une page mise à jour", () => {
    const { writeId } = ecrireAutomatiquement();
    emit("article-written", { requestId: writeId, slug: "articles/aoki-2011", updated: true });
    expect(jobs()[0].writtenUpdated).toBe(true);
  });

  it("la trace survit à la fermeture du dialogue", () => {
    const { writeId } = ecrireAutomatiquement();
    emit("article-written", { requestId: writeId, slug: "articles/aoki-2011", updated: false });
    closeArticleDialog();
    expect(jobs()).toHaveLength(1);
    expect(jobs()[0].phase).toBe("done");
  });

  it("une fiche seulement prête, elle, se range à la fermeture", () => {
    startArticleImport("/tmp/muff.pdf");
    const id = jobs()[0].requestId;
    emit("article-imported", { requestId: id, draftId: "d2", path: "/tmp/muff.pdf", duplicates: [] });
    expect(jobs()[0].phase).toBe("ready");
    closeArticleDialog();
    expect(jobs()).toHaveLength(0);
  });
});
