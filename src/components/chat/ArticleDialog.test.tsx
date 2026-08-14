import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage } from "../../lib/i18n";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => "/tmp/aoki-2011.pdf") }));
vi.mock("../../lib/wsBus", () => ({ wsSend: vi.fn(() => true) }));
vi.mock("../ui/toast", () => ({
  showError: vi.fn(),
  showInfo: vi.fn(),
  showSuccess: vi.fn(),
  showUndo: vi.fn(),
}));

import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { wsSend } from "../../lib/wsBus";
import { showUndo } from "../ui/toast";
import { openArticleDialog, resetArticleImportForTests } from "../../lib/articleImports";
import ArticleDialog, { duplicateReason, stripFrontMatter } from "./ArticleDialog";

const sent = wsSend as unknown as ReturnType<typeof vi.fn>;
const undo = showUndo as unknown as ReturnType<typeof vi.fn>;

const PREVIEW = `---
title: "Physically based snow albedo model"
year: 2011
---

## Abstract

A physically based snow albedo model has been developed.
`;

const META = {
  title: "Physically based snow albedo model",
  authors: "Aoki, T.; Kuchiki, K.",
  year: 2011,
  journal: "JGR",
  doi: "10.1029/2010JD015507",
};

function lastSent() {
  const calls = sent.mock.calls;
  return ((calls.length ? calls[calls.length - 1][0] : null) ?? {}) as Record<string, unknown>;
}

function lastRequestId() {
  const call = [...sent.mock.calls].reverse().find(([msg]) => typeof msg?.requestId === "string");
  return (call?.[0] as { requestId: string }).requestId;
}

function emit(name: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Ouvre le dialogue puis lance une conversion, par le vrai chemin. */
async function toConverting() {
  renderUi(<ArticleDialog />);
  openArticleDialog();
  fireEvent.click(await screen.findByText("Choisir un PDF…"));
  await screen.findByText(/Conversion en cours/);
}

async function toReview(over: Record<string, unknown> = {}) {
  await toConverting();
  expect(lastSent().type).toBe("articleImport");
  emit("article-imported", {
    requestId: lastRequestId(),
    draftId: "a8023bcc8c7f",
    path: "/tmp/aoki-2011.pdf",
    meta: META,
    slug: "articles/aoki-2011-snow-albedo-model",
    exists: false,
    chars: 61240,
    preview: PREVIEW,
    converter: "mineru",
    duplicates: [],
    warning: null,
    ...over,
  });
  await screen.findByText("Article converti");
  sent.mockClear();
}

beforeEach(() => {
  setLanguage("fr");
  resetArticleImportForTests();
});

afterEach(() => {
  cleanup();
  resetTestState?.();
  resetArticleImportForTests();
  vi.clearAllMocks();
});

describe("stripFrontMatter", () => {
  it("ne garde que le corps converti", () => {
    expect(stripFrontMatter(PREVIEW).startsWith("## Abstract")).toBe(true);
  });

  it("laisse intact un texte sans front-matter", () => {
    expect(stripFrontMatter("juste du texte")).toBe("juste du texte");
    expect(stripFrontMatter("---\nsans fin")).toBe("---\nsans fin");
  });
});

describe("ArticleDialog", () => {
  it("reste fermé tant qu'on ne l'ouvre pas, et n'envoie rien à l'ouverture", async () => {
    renderUi(<ArticleDialog />);
    expect(screen.queryByText("Choisir un PDF…")).toBeNull();
    openArticleDialog();
    expect(await screen.findByText("Choisir un PDF…")).toBeTruthy();
    expect(sent).not.toHaveBeenCalled();
  });

  it("ignore une réponse qui n'est pas la sienne", async () => {
    await toConverting();
    emit("article-imported", { requestId: "autre-dialogue", meta: META, slug: "articles/x" });
    expect(screen.getByText(/Conversion en cours/)).toBeTruthy();
  });

  it("remplit la fiche depuis l'import et n'écrit qu'au clic", async () => {
    await toReview();
    expect(screen.getByDisplayValue("Physically based snow albedo model")).toBeTruthy();
    expect(screen.getByDisplayValue("2011")).toBeTruthy();
    expect(screen.getByDisplayValue("10.1029/2010JD015507")).toBeTruthy();
    expect(screen.getByDisplayValue("articles/aoki-2011-snow-albedo-model")).toBeTruthy();
    expect(screen.getByText(/A physically based snow albedo model/)).toBeTruthy();
    expect(sent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Écrire la page"));
    const msg = lastSent();
    expect(msg.type).toBe("articleWrite");
    expect(msg.draftId).toBe("a8023bcc8c7f");
    expect(msg.slug).toBe("articles/aoki-2011-snow-albedo-model");
    expect(msg.ragdoc).toBe(false);
    expect((msg.meta as { year: number }).year).toBe(2011);
  });

  it("continue la conversion en arrière-plan et ramène la fiche par le toast", async () => {
    await toConverting();
    const requestId = lastRequestId();
    fireEvent.click(screen.getByText("Continuer en arrière-plan"));
    expect(screen.queryByText(/Conversion en cours/)).toBeNull();

    emit("article-imported", {
      requestId, draftId: "a8023bcc8c7f", path: "/tmp/aoki-2011.pdf", meta: META,
      slug: "articles/aoki-2011-snow-albedo-model", preview: PREVIEW, chars: 10, duplicates: [],
    });
    // rien ne s'ouvre de force : un toast cliquable, et la fiche au clic
    expect(screen.queryByText("Article converti")).toBeNull();
    expect(undo).toHaveBeenCalledTimes(1);
    const [message, onClick] = undo.mock.calls[0] as [string, () => void];
    expect(message).toContain("aoki-2011.pdf");
    onClick();
    expect(await screen.findByText("Article converti")).toBeTruthy();
  });

  it("liste les doublons du corpus et adopte le slug existant au clic", async () => {
    await toReview({
      duplicates: [
        { slug: "papers/aoki-2011", snippet: "Physically based snow albedo", why: "doi" },
        { slug: "articles/aoki-snow-albedo", snippet: "snow albedo model", why: "titre" },
      ],
    });
    expect(screen.getByText(/Déjà dans le corpus/)).toBeTruthy();
    expect(screen.getByText("papers/aoki-2011")).toBeTruthy();
    expect(screen.getByText("DOI identique")).toBeTruthy();
    expect(screen.getByText("titre très proche")).toBeTruthy();

    fireEvent.click(screen.getAllByText("Utiliser ce slug")[0]);
    expect(screen.getByDisplayValue("papers/aoki-2011")).toBeTruthy();
    fireEvent.click(screen.getByText("Écrire la page"));
    expect(lastSent().slug).toBe("papers/aoki-2011");
  });

  it("annonce un remplacement quand le slug existe, jusqu'à ce qu'on le change", async () => {
    await toReview({ exists: true });
    expect(screen.getByText(/existe déjà/)).toBeTruthy();
    expect(screen.getByText("Remplacer la page")).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue("articles/aoki-2011-snow-albedo-model"), {
      target: { value: "articles/autre-slug" },
    });
    expect(screen.queryByText(/existe déjà/)).toBeNull();
    expect(screen.getByText("Écrire la page")).toBeTruthy();
  });

  it("transmet les métadonnées corrigées et l'option ragdoc", async () => {
    await toReview();
    fireEvent.change(screen.getByDisplayValue("Physically based snow albedo model"), {
      target: { value: "Titre corrigé" },
    });
    fireEvent.click(screen.getByText("Copier aussi vers ragdoc"));
    fireEvent.click(screen.getByText("Écrire la page"));
    const msg = lastSent();
    expect((msg.meta as { title: string }).title).toBe("Titre corrigé");
    expect(msg.ragdoc).toBe(true);
  });

  it("« Épingler seulement » épingle le PDF sans toucher au corpus", async () => {
    await toReview();
    fireEvent.click(screen.getByText("Épingler seulement"));
    const msg = lastSent();
    expect(msg.type).toBe("kbAdd");
    expect(msg.kind).toBe("pdf");
    expect(msg.origin).toBe("/tmp/aoki-2011.pdf");
    expect(screen.queryByText("Article converti")).toBeNull();
  });

  it("signale MinerU indisponible, et un échec d'écriture ne perd pas la fiche", async () => {
    await toReview({ converter: "local" });
    expect(screen.getByText(/MinerU indisponible/)).toBeTruthy();
    fireEvent.click(screen.getByText("Écrire la page"));
    emit("article-error", { requestId: lastRequestId(), message: "gbrain: disque plein" });
    await screen.findByText("gbrain: disque plein");
    expect(screen.getByDisplayValue("articles/aoki-2011-snow-albedo-model")).toBeTruthy();
    expect(screen.getByText("Écrire la page")).toBeTruthy();
  });

  it("ferme la fiche après écriture", async () => {
    await toReview();
    fireEvent.click(screen.getByText("Écrire la page"));
    emit("article-written", {
      requestId: lastRequestId(), slug: "articles/x", updated: true, ragdoc: { ok: true },
    });
    // la fiche est retirée (le conteneur de dialogue peut survivre le temps de
    // son animation de fermeture — c'est son contenu qui fait foi)
    await waitFor(() => {
      expect(screen.queryByDisplayValue("articles/aoki-2011-snow-albedo-model")).toBeNull();
    });
    expect(screen.queryByText("Écrire la page")).toBeNull();
  });

  it("un import abandonné ne réveille plus le dialogue", async () => {
    await toConverting();
    const stale = lastRequestId();
    fireEvent.click(screen.getByText("Abandonner"));
    expect(screen.queryByText(/Conversion en cours/)).toBeNull();
    emit("article-imported", { requestId: stale, meta: META, slug: "articles/x", preview: PREVIEW });
    expect(screen.queryByText("Article converti")).toBeNull();
    expect(undo).not.toHaveBeenCalled();
  });
});

describe("plusieurs imports à la fois", () => {
  it("accepte un second PDF pendant la conversion du premier", async () => {
    await toConverting();
    const first = lastRequestId();
    (openDialog as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce("/tmp/box-2001.pdf");
    fireEvent.click(screen.getByText("Ajouter un autre PDF"));
    // l'onglet du second ET son en-tête portent son nom
    expect((await screen.findAllByText("box-2001.pdf")).length).toBeGreaterThan(1);
    const second = lastRequestId();
    expect(second).not.toBe(first);
    // le premier reste atteignable dans la barre d'onglets
    expect(screen.getByText("aoki-2011.pdf")).toBeTruthy();
    expect(lastSent().path).toBe("/tmp/box-2001.pdf");
  });

  it("un échec ne bloque rien : on écarte, on réessaie, ou on en dépose un autre", async () => {
    await toConverting();
    const requestId = lastRequestId();
    emit("article-error", { requestId, message: "MinerU a échoué (quota)" });
    await screen.findByText("MinerU a échoué (quota)");
    expect(screen.getByText("Ajouter un autre PDF")).toBeTruthy();

    fireEvent.click(screen.getByText("Réessayer"));
    await screen.findByText(/Conversion en cours/);
    expect(lastSent().path).toBe("/tmp/aoki-2011.pdf");
    expect(lastRequestId()).not.toBe(requestId);
  });

  it("ne remplace pas la fiche affichée quand un autre import se termine", async () => {
    await toReview();
    (openDialog as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce("/tmp/box-2001.pdf");
    fireEvent.click(screen.getByText("Ajouter un autre PDF"));
    await screen.findByText(/Conversion en cours/);
    const second = lastRequestId();
    // on revient sur la première fiche, puis le second arrive
    fireEvent.click(screen.getByText("aoki-2011.pdf"));
    await screen.findByText("Article converti");
    emit("article-imported", {
      requestId: second, draftId: "bbbbbbbbbbbb", path: "/tmp/box-2001.pdf",
      meta: { title: "Sublimation" }, slug: "articles/box-2001", preview: PREVIEW, duplicates: [],
    });
    // la fiche sous les doigts ne bouge pas ; un toast propose l'autre
    expect(screen.getByDisplayValue("articles/aoki-2011-snow-albedo-model")).toBeTruthy();
    expect(undo).toHaveBeenCalledTimes(1);
  });
});

describe("duplicateReason", () => {
  it("nomme la raison du doublon", () => {
    expect(duplicateReason("doi")).toBe("DOI identique");
    expect(duplicateReason("titre")).toBe("titre très proche");
    expect(duplicateReason(undefined)).toBe("titre très proche");
  });
});
