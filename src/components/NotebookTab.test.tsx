// Tests unitaires de la surface Jupyter (<NotebookTab />) et de ses utilitaires.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotebookTab, { NOTEBOOK_DOC_LIVE_CONTEXT_EVENT } from "./NotebookTab";
import { relFromTabUrl } from "./AtelierPane";
import { setLanguage } from "../lib/i18n";
import {
  applyNotebookEvent,
  formatBytes,
  kernelExitDetail,
  notebookPathFromTabUrl,
  sanitizeNotebookHtml,
  sanitizeNotebookSvg,
  type NotebookSnapshot,
} from "../lib/notebook";
import { resetUnsavedDocumentsForTests } from "../lib/unsavedDocuments";

const wsSendMock = vi.fn<(payload: Record<string, unknown>) => boolean>();

vi.mock("../lib/wsBus", () => ({
  wsSend: (payload: Record<string, unknown>) => wsSendMock(payload),
}));

const SAMPLE_SNAPSHOT: NotebookSnapshot = {
  path: "/tmp/projet/analyse_albedo.ipynb",
  revision: "rev-1",
  unsaved: false,
  language: "python",
  preferredKernelspec: "python3",
  status: {
    state: "idle",
    kernelId: "zmq:python3",
    displayName: "Python 3.12 (albedo-env)",
    language: "python",
    backend: "zmq_kernelspec",
    pid: 4242,
    rssBytes: 412 * 1024 * 1024,
    busyCellId: null,
    message: null,
  },
  variables: [
    {
      name: "df_m80",
      type: "DataFrame",
      shape: "(1240, 12)",
      sizeBytes: 18 * 1024 * 1024,
      preview: "region_band, year, albedo_jja",
    },
  ],
  cells: [
    {
      index: 1,
      id: "cell-md-1",
      cellType: "markdown",
      source: "# Décomposition Mundlak de l'albédo glaciaire",
      outputs: [],
    },
    {
      index: 2,
      id: "cell-code-2",
      cellType: "code",
      executionCount: 1,
      title: "Imports et chargement du panel M80",
      source: "import numpy as np\nimport pymc as pm\ndf_m80 = load_panel()",
      outputs: [
        {
          kind: "data",
          executionCount: 1,
          textHtml:
            "<style>.dataframe { border: 2px solid red; }</style><table class=\"dataframe\"><thead><tr><th>param</th><th>mean</th></tr></thead><tbody><tr><td>beta_intra</td><td onclick=\"alert(1)\">-0,031</td></tr></tbody></table><script>window.__xss = true;</script>",
          textPlain: "beta_intra -0.031",
        },
      ],
    },
    {
      index: 3,
      id: "cell-code-3",
      cellType: "code",
      executionCount: 2,
      title: "Ajustement bayésien hiérarchique",
      source: "with pm.Model() as model:\n    sigma = pm.HalfNormal('sigma', 0.1)",
      outputs: [],
    },
  ],
  proposals: [
    {
      id: "prop-1",
      kind: "edit",
      targetCellId: "cell-code-3",
      cellType: "code",
      originalSource: "with pm.Model() as model:\n    sigma = pm.HalfNormal('sigma', 0.1)",
      proposedSource:
        "with pm.Model() as model:\n    sigma = pm.HalfNormal('sigma', 0.05)\n    idata = pm.sample(1000)",
      purpose: "Resserrement du prior HalfNormal(0.05) sans ré-importer pymc",
      author: "Claude",
      createdAt: "2026-11-18T12:00:00Z",
      addedLines: 2,
      removedLines: 1,
      diffLines: [
        { kind: "same", text: "with pm.Model() as model:" },
        { kind: "del", text: "    sigma = pm.HalfNormal('sigma', 0.1)" },
        { kind: "add", text: "    sigma = pm.HalfNormal('sigma', 0.05)" },
        { kind: "add", text: "    idata = pm.sample(1000)" },
      ],
      diagnostics: {
        redundantImports: [],
        brokenDownstreamSymbols: [],
      },
      upstreamSummary: "Imports déjà actifs en amont : numpy (np), pymc (pm)",
      downstreamSummary: "Aucune variable aval cassée",
    },
  ],
};

function replyWs(requestId: unknown, data: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent("notebook-command", {
      detail: { type: "notebookCommand", requestId, data },
    }),
  );
}

describe("NotebookTab et utilitaires Jupyter", () => {
  beforeEach(() => {
    setLanguage("fr");
    wsSendMock.mockReset();
    resetUnsavedDocumentsForTests();
  });

  afterEach(() => {
    cleanup();
    resetUnsavedDocumentsForTests();
  });

  it("extrait le chemin .ipynb de l'URL d'onglet et conserve relFromTabUrl", () => {
    const url =
      "http://127.0.0.1:19992/.fig_thumbs/ipynb_studio.html?path=%2Ftmp%2Fprojet%2Fnotebooks%2Fanalyse.ipynb#atelier_nonce=abc";
    expect(notebookPathFromTabUrl(url)).toBe("/tmp/projet/notebooks/analyse.ipynb");
    expect(relFromTabUrl(url, "/tmp/projet")).toBe("notebooks/analyse.ipynb");
    expect(notebookPathFromTabUrl("http://127.0.0.1:19992/.fig_thumbs/md_studio.html?path=/a.md")).toBeNull();
  });

  it("assainit le HTML et le SVG des sorties (zéro script, style global ou gestionnaire inline)", () => {
    const dirtyHtml =
      '<style>body{background:red}</style><table style="color:red"><tr onmouseover="evil()"><td>ok</td><td><a href="javascript:evil()">lien</a></td></tr></table><script>evil()</script><iframe src="https://evil"></iframe>';
    const clean = sanitizeNotebookHtml(dirtyHtml);
    expect(clean).toContain("<table>");
    expect(clean).toContain("<td>ok</td>");
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("<style");
    expect(clean).not.toContain("<iframe");
    expect(clean).not.toContain("onmouseover");
    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("style=");

    const dirtySvg =
      '<svg viewBox="0 0 10 10"><script>evil()</script><foreignObject><div>x</div></foreignObject><circle cx="5" cy="5" r="4" onclick="evil()"/></svg>';
    const cleanSvg = sanitizeNotebookSvg(dirtySvg);
    expect(cleanSvg).toContain("<circle");
    expect(cleanSvg).not.toContain("<script");
    expect(cleanSvg).not.toContain("foreignObject");
    expect(cleanSvg).not.toContain("onclick");
  });

  it("affiche le cahier, publie le contexte vivant par cellule et accepte une proposition inline", async () => {
    const liveEvents: Array<{ tabId: string; context: Record<string, unknown> }> = [];
    const onLive = (e: Event) => liveEvents.push((e as CustomEvent).detail);
    window.addEventListener(NOTEBOOK_DOC_LIVE_CONTEXT_EVENT, onLive);

    wsSendMock.mockImplementation((payload) => {
      queueMicrotask(() => {
        if (payload.op === "open") {
          replyWs(payload.requestId, {
            snapshot: SAMPLE_SNAPSHOT,
            kernels: [
              {
                id: "zmq:python3",
                name: "python3",
                displayName: "Python 3.12 (albedo-env)",
                language: "python",
                source: "Pixi",
                backend: "zmq_kernelspec",
              },
            ],
          });
        } else if (payload.op === "acceptProposal") {
          replyWs(payload.requestId, {
            snapshot: {
              ...SAMPLE_SNAPSHOT,
              revision: "rev-2",
              proposals: [],
              cells: SAMPLE_SNAPSHOT.cells.map((c) =>
                c.id === "cell-code-3"
                  ? {
                      ...c,
                      executionCount: 3,
                      source:
                        "with pm.Model() as model:\n    sigma = pm.HalfNormal('sigma', 0.05)\n    idata = pm.sample(1000)",
                    }
                  : c,
              ),
            },
          });
        } else if (payload.op === "gitDiff") {
          replyWs(payload.requestId, {
            untracked: false,
            entries: [
              {
                cellId: "cell-code-3",
                index: 3,
                baseIndex: 3,
                cellType: "code",
                title: "Ajustement bayésien hiérarchique",
                status: "modified",
                addedLines: 2,
                removedLines: 1,
                outputsChanged: false,
                lines: [
                  { kind: "del", text: "    sigma = pm.HalfNormal('sigma', 0.1)" },
                  { kind: "add", text: "    sigma = pm.HalfNormal('sigma', 0.05)" },
                ],
              },
            ],
          });
        }
      });
      return true;
    });

    try {
      render(
        <NotebookTab
          tabId="doc-nb1"
          url="http://127.0.0.1:19992/.fig_thumbs/ipynb_studio.html?path=%2Ftmp%2Fprojet%2Fanalyse_albedo.ipynb"
          title="analyse_albedo.ipynb"
          path="/tmp/projet/analyse_albedo.ipynb"
          projectRoot="/tmp/projet"
          visible={true}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/Décomposition Mundlak/)).toBeTruthy();
      });

      // La table HTML est rendue sans script ni attribut onclick.
      expect(screen.getByText("beta_intra")).toBeTruthy();
      expect(screen.getByText("-0,031").getAttribute("onclick")).toBeNull();

      // Le contexte vivant initial pointe sur la cellule [1] sur 3.
      expect(liveEvents[liveEvents.length - 1]).toEqual({
        tabId: "doc-nb1",
        context: {
          kind: "notebook",
          path: "/tmp/projet/analyse_albedo.ipynb",
          name: "analyse_albedo.ipynb",
          cell: 1,
          cellCount: 3,
        },
      });

      // Clic sur la cellule 3 → le contexte vivant bascule sur cell: 3.
      fireEvent.click(screen.getByText("Ajustement bayésien hiérarchique"));
      await waitFor(() => {
        expect(liveEvents[liveEvents.length - 1]?.context.cell).toBe(3);
      });

      // Le mini-diff de proposition Claude est visible avec son résumé amont.
      expect(screen.getByText(/Resserrement du prior HalfNormal/)).toBeTruthy();
      expect(screen.getByText(/Imports déjà actifs en amont/)).toBeTruthy();

      // Clic sur « Accepter et exécuter » → envoie acceptProposal avec runAfter: true.
      fireEvent.click(screen.getByText("Accepter et exécuter"));
      await waitFor(() => {
        expect(wsSendMock).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "notebookCommand",
            op: "acceptProposal",
            proposalId: "prop-1",
            runAfter: true,
          }),
        );
      });
      await waitFor(() => {
        expect(screen.queryByText(/Resserrement du prior HalfNormal/)).toBeNull();
      });

      // Ouverture du tiroir Variables : affiche df_m80.
      fireEvent.click(screen.getByText("Variables"));
      expect(screen.getByText("df_m80")).toBeTruthy();

      // Bascule en mode Lecture seule.
      fireEvent.click(screen.getByText("Lecture"));
      expect(screen.getByText("Lecture seule")).toBeTruthy();

      // Bascule en mode Diff Git cellule par cellule.
      await act(async () => {
        fireEvent.click(screen.getByText("Diff Git"));
      });
      await waitFor(() => {
        expect(screen.getByText("Comparaison Git cellule par cellule")).toBeTruthy();
      });
    } finally {
      window.removeEventListener(NOTEBOOK_DOC_LIVE_CONTEXT_EVENT, onLive);
    }
  });

  it("applique les événements du moteur et lit l'arrêt du noyau", () => {
    const base = { ...SAMPLE_SNAPSHOT, proposals: [] };
    const asked = applyNotebookEvent(base, {
      event: "inputRequested",
      path: base.path,
      cellId: "cell-code-3",
      prompt: "Nom ? ",
      password: false,
    });
    expect(asked.pendingInput).toEqual({ cellId: "cell-code-3", prompt: "Nom ? ", password: false });
    expect(applyNotebookEvent(asked, { event: "inputCleared", path: base.path }).pendingInput).toBeNull();
    expect(applyNotebookEvent(base, { event: "diskChanged", path: base.path, changed: true }).diskChanged).toBe(true);
    const fresh = { ...base, revision: "disque" };
    expect(applyNotebookEvent(base, { event: "snapshotReplaced", path: base.path, snapshot: fresh })).toBe(fresh);
    // Un échec n'altère pas l'état (il s'affiche en message).
    expect(applyNotebookEvent(base, { event: "runFailed", path: base.path, message: "x" })).toBe(base);

    expect(kernelExitDetail({ exitSignal: 9 })).toEqual({ code: "signal 9", likelyOom: true });
    expect(kernelExitDetail({ exitCode: 3 })).toEqual({ code: "code 3", likelyOom: false });
    expect(kernelExitDetail({})).toEqual({ code: null, likelyOom: false });
    expect(formatBytes(3 * 1024 * 1024, "en")).toBe("3.0 MB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3,0 Mo");
  });

  it("bandeaux de solidité, case input() et sorties raccourcies", async () => {
    const snapshot: NotebookSnapshot = {
      ...SAMPLE_SNAPSHOT,
      proposals: [],
      unsaved: true,
      diskChanged: true,
      recovery: { savedAtMs: Date.UTC(2026, 10, 18, 14, 5) },
      status: { state: "dead", exitSignal: 9, displayName: "Python 3.12 (albedo-env)" },
      cells: SAMPLE_SNAPSHOT.cells.map((c) =>
        c.id === "cell-code-3"
          ? {
              ...c,
              outputs: [
                { kind: "stream", name: "stdout", text: "2999\n", omittedLines: 1200 },
                {
                  kind: "data",
                  textPlain: "<Figure>",
                  omitted: [{ mime: "image/png", bytes: 20 * 1024 * 1024 }],
                },
              ],
            }
          : c,
      ),
    };
    wsSendMock.mockImplementation((payload) => {
      queueMicrotask(() => {
        if (payload.op === "open") replyWs(payload.requestId, { snapshot, kernels: [] });
        else if (payload.op === "runCell" || payload.op === "restart") replyWs(payload.requestId, { started: true });
        else if (payload.op === "sendInput") replyWs(payload.requestId, { ok: true });
        else if (payload.op === "save") replyWs(payload.requestId, { snapshot: { ...snapshot, diskChanged: false, unsaved: false } });
        else if (payload.op === "discardRecovery") replyWs(payload.requestId, { snapshot: { ...snapshot, recovery: null } });
      });
      return true;
    });

    render(
      <NotebookTab
        tabId="doc-nb2"
        url="http://127.0.0.1:19992/.fig_thumbs/ipynb_studio.html?path=%2Ftmp%2Fprojet%2Fanalyse_albedo.ipynb"
        title="analyse_albedo.ipynb"
        path="/tmp/projet/analyse_albedo.ipynb"
        projectRoot="/tmp/projet"
        visible={true}
      />,
    );
    await waitFor(() => expect(screen.getByText(/modifié hors d'Atelier/)).toBeTruthy());
    expect(screen.getByText(/changements non enregistrés du/)).toBeTruthy();
    expect(screen.getByText(/Le noyau s'est arrêté \(signal 9\)\. Mémoire probablement épuisée\./)).toBeTruthy();
    expect(screen.getByText(/lignes précédentes masquées/)).toBeTruthy();
    expect(screen.getByText(/image\/png \(20,0 Mo\) trop lourde/)).toBeTruthy();

    // « Garder ma version » force l'enregistrement.
    fireEvent.click(screen.getByText("Garder ma version"));
    await waitFor(() =>
      expect(wsSendMock).toHaveBeenCalledWith(expect.objectContaining({ op: "save", force: true })),
    );
    await waitFor(() => expect(screen.queryByText(/modifié hors d'Atelier/)).toBeNull());

    fireEvent.click(screen.getByText("Ignorer"));
    await waitFor(() => expect(screen.queryByText(/changements non enregistrés du/)).toBeNull());

    // Exécuter : la réponse { started } ne remplace pas l'état ; les sorties
    // arrivent par événements, puis input() ouvre une case sous la cellule.
    act(() => {
      window.dispatchEvent(
        new CustomEvent("notebook-event", {
          detail: { data: { event: "kernelStatus", path: snapshot.path, status: { state: "busy", busyCellId: "cell-code-3" } } },
        }),
      );
      window.dispatchEvent(
        new CustomEvent("notebook-event", {
          detail: {
            data: { event: "inputRequested", path: snapshot.path, cellId: "cell-code-3", prompt: "Seuil ? ", password: false },
          },
        }),
      );
    });
    expect(screen.queryByText(/Le noyau s'est arrêté/)).toBeNull();
    const field = await screen.findByLabelText("Seuil ?");
    fireEvent.change(field, { target: { value: "0.4" } });
    fireEvent.submit(field.closest("form")!);
    await waitFor(() =>
      expect(wsSendMock).toHaveBeenCalledWith(expect.objectContaining({ op: "sendInput", value: "0.4" })),
    );
    act(() => {
      window.dispatchEvent(
        new CustomEvent("notebook-event", { detail: { data: { event: "inputCleared", path: snapshot.path } } }),
      );
    });
    expect(screen.queryByLabelText("Seuil ?")).toBeNull();
  });
});
