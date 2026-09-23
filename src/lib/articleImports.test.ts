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
  stageLabel, startArticleImport, setAutoWrite, restoreArticleJobs,
  enqueueArticlePaths, runArticleQueue, pauseArticleQueue, approveArticleJob, rejectArticleJob,
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
    expect(stageLabel(jobs()[0])).toBe("Conversion du PDF — 42 s");
  });

  it("dit chaque étape en clair, et l'attente est nommée avant la première", () => {
    startArticleImport("/tmp/aoki.pdf");
    const job = jobs()[0];
    // avant toute étape reçue, « conversion en cours » serait un mensonge :
    // le travail n'a pas commencé (file, spawn) — fix 2026-08-16
    expect(stageLabel({ ...job, startedAt: Date.now() - 8000 })).toMatch(/En attente de la conversion — [78] s/);
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
    setAutoWrite(true);
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

  it("une fiche prête reste disponible après fermeture", () => {
    startArticleImport("/tmp/muff.pdf");
    const id = jobs()[0].requestId;
    emit("article-imported", { requestId: id, draftId: "d2", path: "/tmp/muff.pdf", duplicates: [] });
    expect(jobs()[0].phase).toBe("ready");
    closeArticleDialog();
    expect(jobs()).toHaveLength(1);
    expect(jobs()[0].phase).toBe("ready");
  });
});


describe("reprise Ragdoc", () => {
  it("attend une approbation par défaut même si l’ancien réglage GBrain était actif", () => {
    localStorage.setItem("atelier-studio.article-auto", "1");
    startArticleImport("/tmp/new.pdf");
    emit("article-imported", {requestId: jobs()[0].requestId, draftId:"abc", slug:"new.md"});
    expect(jobs()[0].phase).toBe("ready");
    expect(vi.mocked(wsSend).mock.calls.some(([m]) => (m as {type:string}).type === "articleWrite")).toBe(false);
  });
  it("ne transforme jamais une écriture interrompue en succès", () => {
    const restored = restoreArticleJobs(JSON.stringify([{requestId:"job",path:"a.pdf",startedAt:1,phase:"writing",imported:{draftId:"abc"},message:null}]));
    expect(restored[0].phase).toBe("ready");
    expect(restored[0].message).toContain("interrompu");
  });
});

describe("file intégrée Ragdoc", () => {
  it("attend le lancement, déduplique les chemins et convertit un PDF à la fois", async () => {
    enqueueArticlePaths(["/tmp/a.pdf","/tmp/a.pdf","/tmp/b.pdf"],"mineru");
    expect(jobs()).toHaveLength(2);
    expect(wsSend).not.toHaveBeenCalled();
    runArticleQueue();
    expect(wsSend).toHaveBeenCalledTimes(1);
    expect(wsSend).toHaveBeenCalledWith(expect.objectContaining({path:"/tmp/a.pdf",converter:"mineru"}));
    expect(articleImportSnapshot().open).toBe(false);
    const first=jobs().find(j=>j.phase==="converting")!;
    emit("article-imported",{requestId:first.requestId,draftId:"d1",slug:"a.md",path:first.path});
    await Promise.resolve();
    expect(wsSend).toHaveBeenCalledTimes(2);
    expect(jobs().find(j=>j.requestId===first.requestId)?.phase).toBe("ready");
  });
  it("pause sans abandonner la conversion ni le PDF suivant", async () => {
    enqueueArticlePaths(["/tmp/a.pdf","/tmp/b.pdf"],"mistral");runArticleQueue();pauseArticleQueue();
    const first=jobs().find(j=>j.phase==="converting")!;
    emit("article-error",{requestId:first.requestId,message:"Conversion échouée"});await Promise.resolve();
    expect(wsSend).toHaveBeenCalledTimes(1);
    expect(jobs().some(j=>j.phase==="queued")).toBe(true);
    runArticleQueue();expect(wsSend).toHaveBeenCalledTimes(2);
  });
  it("n'approuve que les brouillons prêts et conserve les éléments écartés", () => {
    enqueueArticlePaths(["/tmp/a.pdf"],"mistral");const id=jobs()[0].requestId;
    expect(approveArticleJob(id)).toBe(false);rejectArticleJob(id);
    expect(jobs()[0].phase).toBe("rejected");expect(wsSend).not.toHaveBeenCalled();
    expect(restoreArticleJobs(JSON.stringify(jobs()))[0].phase).toBe("rejected");
  });
});
