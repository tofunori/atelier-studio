// Surface Connaissances refondue (plan 054) : une liste, une barre, un bouton.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage } from "../../lib/i18n";
import type { KbSource } from "../../lib/kbSources";
import { consumePendingPassageOpen, resetPendingPassageOpenForTests, setPendingPassageOpen } from "../../lib/pendingPassageOpen";
import { resetKbTrashForTests } from "../../lib/kbTrash";
// L'état des imports vit dans un store module : on le pilote depuis les tests
// plutôt que de simuler tout le cycle websocket.
const articleState: { jobs: unknown[]; focused: string | null; open: boolean } = {
  jobs: [], focused: null, open: false,
};
vi.mock("../../lib/articleImports", () => ({
  articleImportSnapshot: () => articleState,
  subscribeArticleImport: () => () => {},
  openArticleDialog: vi.fn(),
  startDoiImport: vi.fn(),
  fileName: (path: string) => String(path).split("/").pop() ?? path,
  // Le vrai libellé vit dans le module réel ; ici on veut seulement vérifier
  // que la rangée montre bien l'étape qu'on lui donne, pas un compteur nu.
  stageLabel: (job: { stage?: string | null; stageSeconds?: number | null; startedAt: number }) =>
    (job.stage === "converting"
      ? `conversion chez MinerU — ${job.stageSeconds} s`
      : job.stage
        ? `étape ${job.stage}`
        : `conversion — ${Math.round((Date.now() - job.startedAt) / 1000)} s`),
}));

import { openArticleDialog, startDoiImport } from "../../lib/articleImports";
import KbSurface, { buildCorpusRows, buildRows, filterOf, fmtAge } from "./KbSurface";

const NOW = Date.parse("2026-08-14T12:00:00Z");

const SOURCES: KbSource[] = [
  {
    id: "aaaa1111", kind: "pdf", title: "Cuffey & Paterson ch. 5", origin: "/tmp/cuffey.pdf",
    chars: 48000, addedAt: "2026-08-14T11:30:00Z", updatedAt: "2026-08-14T11:30:00Z",
  },
  {
    id: "bbbb2222", kind: "web", title: "Albedo feedbacks review", origin: "https://x.org/albedo",
    chars: 12000, addedAt: "2026-08-13T12:00:00Z", updatedAt: "2026-08-13T12:00:00Z",
  },
  {
    id: "cccc3333", kind: "note", title: "Notes terrain — Saskatchewan", origin: null,
    chars: 900, addedAt: "2026-08-01T12:00:00Z", updatedAt: "2026-08-01T12:00:00Z",
  },
] as unknown as KbSource[];

const ARTICLES = [
  { slug: "articles/aoki-2011-snow-albedo", title: "Physically based snow albedo model", date: "2026-08-12" },
];

function props(over: Partial<Parameters<typeof KbSurface>[0]> = {}) {
  return {
    sources: SOURCES,
    attached: [] as string[],
    fullContent: [] as string[],
    articles: ARTICLES,
    threadTitle: "Abstract AGU",
    error: null,
    onToggle: vi.fn(),
    onToggleFull: vi.fn(),
    onRemoveSources: vi.fn(),
    onPromote: vi.fn(),
    onAddFiles: vi.fn(),
    onAddFolder: vi.fn(),
    onAddNote: vi.fn(),
    onAddUrl: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  setLanguage("fr");
  resetPendingPassageOpenForTests();
});
afterEach(() => {
  articleState.jobs = [];
  resetKbTrashForTests();
  cleanup();
  resetTestState?.();
  resetPendingPassageOpenForTests();
  vi.clearAllMocks();
});

describe("classement", () => {
  it("regroupe les kinds voisins sous un seul filtre", () => {
    expect(filterOf("pdf")).toBe("pdf");
    expect(filterOf("zotero")).toBe("pdf");
    expect(filterOf("youtube")).toBe("web");
    expect(filterOf("gbrain")).toBe("corpus");
    expect(filterOf("folder")).toBe("file");
  });

  it("donne un âge lisible plutôt qu'un poids", () => {
    expect(fmtAge("2026-08-14T11:58:00Z", NOW)).toBe("2 min");
    expect(fmtAge("2026-08-14T09:00:00Z", NOW)).toBe("3 h");
    expect(fmtAge("2026-08-13T12:00:00Z", NOW)).toBe("hier");
    expect(fmtAge("2026-08-04T12:00:00Z", NOW)).toBe("10 j");
    expect(fmtAge(null, NOW)).toBe("");
  });

  // La base ne contient QUE ce que l'utilisateur y a mis : le dépôt gbrain ne
  // s'y déverse plus, sinon la liste qu'il cure grossit à chaque ingestion.
  it("ne liste que les sources de la base, les récentes d'abord", () => {
    const rows = buildRows(SOURCES, { now: NOW });
    expect(rows.map((row) => row.title)).toEqual([
      "Cuffey & Paterson ch. 5",      // il y a 30 min
      "Albedo feedbacks review",      // hier
      "Notes terrain — Saskatchewan", // il y a deux semaines
    ]);
    expect(rows.some((row) => row.title.includes("snow albedo"))).toBe(false);
  });

  it("le dépôt montre tous ses articles, et signale ceux déjà dans la base", () => {
    const pinned = {
      id: "dddd4444", kind: "gbrain", title: "Physically based snow albedo model",
      origin: "articles/aoki-2011-snow-albedo", chars: 3000,
      addedAt: "2026-08-12T12:00:00Z", updatedAt: "2026-08-12T12:00:00Z",
      meta: { slug: "articles/aoki-2011-snow-albedo" },
    } as unknown as KbSource;
    // épinglée : elle reste visible dans le dépôt, marquée — on lit le dépôt
    // pour ce qu'il contient, pas pour ce qui lui manque
    const rows = buildCorpusRows([...SOURCES, pinned], ARTICLES, { now: NOW });
    expect(rows).toHaveLength(ARTICLES.length);
    expect(rows.find((row) => row.title.includes("snow albedo"))?.pinned).toBe(true);
    // non épinglée : elle attend un geste
    expect(buildCorpusRows(SOURCES, ARTICLES, { now: NOW })[0].pinned).toBe(false);
  });
});

describe("KbSurface", () => {
  it("affiche une seule liste, avec le rail de rangement à gauche", () => {
    renderUi(<KbSurface {...props()} />);
    expect(screen.getByText("Cuffey & Paterson ch. 5")).toBeTruthy();
    expect(screen.getByText("Albedo feedbacks review")).toBeTruthy();
    // la page du dépôt n'est PAS dans la base : elle vit dans l'onglet gbrain
    expect(screen.queryByText("Physically based snow albedo model")).toBeNull();
    // les sections d'avant ont disparu
    expect(screen.queryByText(/Attachées à/)).toBeNull();
    expect(screen.queryByText("Bibliothèque")).toBeNull();
    expect(screen.queryByText("→ gbrain")).toBeNull();
    // le rail : les vues et les dossiers, visibles sans ouvrir de menu
    expect(screen.getByText("Toutes les sources")).toBeTruthy();
    expect(screen.getByText("Jointes au fil")).toBeTruthy();
    expect(screen.getByText("Dossiers")).toBeTruthy();
  });

  it("sépare la base du dépôt gbrain, et n'y laisse entrer que par un geste", () => {
    const onPin = vi.fn();
    renderUi(<KbSurface {...props({
      gbrain: { query: "", results: [], error: null, searching: false, searched: false,
        onQueryChange: vi.fn(), onSearch: vi.fn(), onPin },
    })} />);
    // onglet Base par défaut : que les sources choisies
    expect(screen.queryByText("Physically based snow albedo model")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /gbrain/ }));
    // onglet gbrain : le dépôt, et rien de la base
    expect(screen.getByText("Physically based snow albedo model")).toBeTruthy();
    expect(screen.queryByText("Cuffey & Paterson ch. 5")).toBeNull();
    // cliquer OUVRE la page ; entrer dans la base reste un geste distinct
    fireEvent.click(screen.getByText("Physically based snow albedo model"));
    expect(screen.getByText("Dépôt")).toBeTruthy();
    expect(onPin).not.toHaveBeenCalled();
  });

  // Le rail porte ce que l'utilisateur range ; le type, que le système déduit,
  // tient dans un menu — la rangée de puces mangeait une ligne en permanence
  // pour un filtre occasionnel.
  it("les types filtrent depuis un menu, pas depuis une rangée de puces", async () => {
    renderUi(<KbSurface {...props()} />);
    expect(screen.queryByText("Tout · 3")).toBeNull();
    fireEvent.click(screen.getByText("Type"));
    fireEvent.click(await screen.findByText("PDF · 1"));
    expect(screen.getByText("Cuffey & Paterson ch. 5")).toBeTruthy();
    expect(screen.queryByText("Albedo feedbacks review")).toBeNull();
    // le déclencheur porte le filtre actif, et « tous les types » y revient
    fireEvent.click(screen.getByText("PDF"));
    fireEvent.click(await screen.findByText(/Tous les types/));
    expect(screen.getByText("Albedo feedbacks review")).toBeTruthy();
  });

  it("la barre filtre la liste", () => {
    renderUi(<KbSurface {...props()} />);
    fireEvent.change(screen.getByPlaceholderText(/Chercher, ou coller une URL/), {
      target: { value: "saskatchewan" },
    });
    expect(screen.getByText("Notes terrain — Saskatchewan")).toBeTruthy();
    expect(screen.queryByText("Cuffey & Paterson ch. 5")).toBeNull();
  });

  it("une URL collée s'épingle depuis la barre, sans champ dédié", () => {
    const onAddUrl = vi.fn();
    renderUi(<KbSurface {...props({ onAddUrl })} />);
    const bar = screen.getByPlaceholderText(/Chercher, ou coller une URL/);
    fireEvent.change(bar, { target: { value: "https://eos.org/agu-abstract" } });
    expect(screen.getByText(/Entrée pour épingler/)).toBeTruthy();
    fireEvent.keyDown(bar, { key: "Enter" });
    expect(onAddUrl).toHaveBeenCalledWith("https://eos.org/agu-abstract");
  });

  it("propose la recherche gbrain depuis la même barre", () => {
    const onSearch = vi.fn();
    const onQueryChange = vi.fn();
    renderUi(<KbSurface {...props({
      gbrain: {
        query: "", results: [], error: null, searching: false, searched: false,
        onQueryChange, onSearch, onPin: vi.fn(),
      },
    })} />);
    fireEvent.change(screen.getByPlaceholderText(/Chercher, ou coller une URL/), {
      target: { value: "albédo" },
    });
    fireEvent.click(screen.getByText(/Chercher « albédo » dans gbrain/));
    expect(onQueryChange).toHaveBeenCalledWith("albédo");
    expect(onSearch).toHaveBeenCalled();
  });

  it("épingle un résultat du corpus, et une page listée au clic", () => {
    const onPin = vi.fn();
    renderUi(<KbSurface {...props({
      gbrain: {
        query: "albédo", results: [{ slug: "papers/aubry-wake-2022", snippet: "Fire and Ice" }],
        error: null, searching: false, searched: true,
        onQueryChange: vi.fn(), onSearch: vi.fn(), onPin,
      },
    })} />);
    // depuis le lecteur, « Épingler » fait entrer la page dans la base
    fireEvent.click(screen.getByRole("tab", { name: /gbrain/ }));
    fireEvent.click(screen.getByText("Physically based snow albedo model"));
    fireEvent.click(screen.getByText("Épingler"));
    expect(onPin).toHaveBeenCalledWith("articles/aoki-2011-snow-albedo");
    fireEvent.click(screen.getByText("Dépôt"));

    fireEvent.click(screen.getByRole("tab", { name: /Base/ }));
    fireEvent.change(screen.getByPlaceholderText(/Chercher, ou coller une URL/), {
      target: { value: "albédo" },
    });
    fireEvent.click(screen.getByText("papers/aubry-wake-2022"));
    expect(onPin).toHaveBeenCalledWith("papers/aubry-wake-2022");
  });

  // Un contrôle, un sens : le trombone joint la conversation, la case
  // sélectionne, la rangée ouvre. Le cercle d'avant portait les deux premiers
  // selon un mode invisible — personne ne trouvait ni l'un ni l'autre.
  it("joint par le trombone, ouvre par la rangée, et filtre par la vue « jointes »", () => {
    const onToggle = vi.fn();
    const { container } = renderUi(<KbSurface {...props({ attached: ["bbbb2222"], onToggle })} />);

    fireEvent.click(container.querySelectorAll(".kb-clip")[0]);
    expect(onToggle).toHaveBeenCalledWith("aaaa1111");

    // la rangée ouvre le lecteur, sans rien attacher de plus
    onToggle.mockClear();
    fireEvent.click(screen.getByText("Cuffey & Paterson ch. 5"));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByText("Base")).toBeTruthy();
    fireEvent.click(screen.getByText("Base"));

    fireEvent.click(screen.getByText("Jointes au fil"));
    expect(screen.getByText("Albedo feedbacks review")).toBeTruthy();
    expect(screen.queryByText("Cuffey & Paterson ch. 5")).toBeNull();
  });

  it("les actions de rangée vivent dans un menu, pas en permanence", async () => {
    const onToggleFull = vi.fn();
    renderUi(<KbSurface {...props({ onToggleFull })} />);
    // aucune icône d'action visible en dehors du menu
    expect(screen.queryByLabelText("Créer une page gbrain (directe)")).toBeNull();
    fireEvent.click(screen.getAllByLabelText("Actions")[0]);
    fireEvent.click(await screen.findByText("Joindre le texte intégral"));
    expect(onToggleFull).toHaveBeenCalledWith("aaaa1111");
  });

  it("un seul bouton d'ajout, qui ouvre les quatre entrées", async () => {
    const onAddArticle = vi.fn();
    renderUi(<KbSurface {...props({ onAddArticle })} />);
    expect(screen.queryByText("Fichier / PDF…")).toBeNull();
    fireEvent.click(screen.getByText("Ajouter"));
    expect(await screen.findByText("Article (PDF)…")).toBeTruthy();
    fireEvent.click(screen.getByText("Article (PDF)…"));
    expect(onAddArticle).toHaveBeenCalled();
  });

  it("un DOI collé importe sa fiche de référence", () => {
    renderUi(<KbSurface {...props()} />);
    const bar = screen.getByPlaceholderText(/Chercher, ou coller une URL/);
    fireEvent.change(bar, { target: { value: "https://doi.org/10.1029/2010JD015507" } });
    expect(screen.getByText(/Entrée pour importer cette référence/)).toBeTruthy();
    fireEvent.keyDown(bar, { key: "Enter" });
    expect(startDoiImport).toHaveBeenCalledWith("10.1029/2010JD015507");
    // un DOI n'est ni un filtre ni une URL à épingler
    expect(props().onAddUrl).not.toHaveBeenCalled();
  });

  it("montre les imports en cours comme des rangées, pas comme une modale", () => {
    articleState.jobs = [
      {
        requestId: "r1", path: "/tmp/rounce-2023.pdf", startedAt: Date.now() - 72_000,
        phase: "converting", imported: null, message: null,
        stage: "converting", stageSeconds: 42,
      },
      {
        requestId: "r2", path: "/tmp/muff-2016.pdf", startedAt: Date.now() - 200_000, phase: "ready",
        imported: { metaSource: "texte", meta: { title: "Marginal or conditional regression models" } },
        message: null,
      },
    ];
    renderUi(<KbSurface {...props()} />);
    // une conversion ne concerne pas la base : elle vit dans l'onglet gbrain
    expect(screen.queryByText("conversion chez MinerU — 42 s")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /gbrain/ }));
    // l'étape réelle remplace le compteur muet
    expect(screen.getByText("conversion chez MinerU — 42 s")).toBeTruthy();
    expect(screen.getByText("rounce-2023.pdf")).toBeTruthy();
    // la fiche devinée se signale sur sa rangée, et le clic la rouvre
    expect(screen.getByText("à relire")).toBeTruthy();
    fireEvent.click(screen.getByText("Marginal or conditional regression models"));
    expect(openArticleDialog).toHaveBeenCalledWith("r2");
  });

  // La sélection n'a plus de mode : la case est là au survol, et le premier
  // clic dessus ouvre la barre de lot.
  it("sélection en lot sans mode : la case suffit, la barre d'actions suit", () => {
    const onBatchAttach = vi.fn();
    const onToggle = vi.fn();
    const { container } = renderUi(<KbSurface {...props({ onBatchAttach, onToggle })} />);
    // aucun mode à activer dans un menu
    expect(screen.queryByText("Sélectionner")).toBeNull();
    const picks = container.querySelectorAll(".kb-pick");
    fireEvent.click(picks[0]);
    fireEvent.click(picks[2]);
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByText("2 sélectionnée(s)")).toBeTruthy();
    fireEvent.click(screen.getByText("Attacher"));
    expect(onBatchAttach).toHaveBeenCalledWith(["aaaa1111", "cccc3333"]);
    // la barre se referme après l'action
    expect(screen.queryByText(/sélectionnée/)).toBeNull();
  });

  it("⇧-clic prend la plage entre l'ancre et la rangée cliquée", () => {
    const { container } = renderUi(<KbSurface {...props()} />);
    const picks = container.querySelectorAll(".kb-pick");
    fireEvent.click(picks[0]);
    fireEvent.click(picks[2], { shiftKey: true });
    expect(screen.getByText("3 sélectionnée(s)")).toBeTruthy();
  });

  it("tout sélectionner porte sur ce qui est affiché, pas sur toute la base", () => {
    renderUi(<KbSurface {...props()} />);
    fireEvent.change(screen.getByPlaceholderText(/Chercher, ou coller une URL/), {
      target: { value: "albedo" },
    });
    fireEvent.click(screen.getByText("Tout sélectionner"));
    expect(screen.getByText("1 sélectionnée(s)")).toBeTruthy();
  });

  // Supprimer existait déjà (menu de rangée), mais sans retour ni retour en
  // arrière : la suppression a lieu à l'écran tout de suite, part au backend
  // seulement à l'expiration du filet — annuler = ne jamais envoyer.
  it("supprimer une source la retire aussitôt de la liste, et le filet la ramène", async () => {
    const onRemoveSources = vi.fn();
    renderUi(<KbSurface {...props({ onRemoveSources })} />);
    fireEvent.click(screen.getAllByLabelText("Actions")[0]);
    fireEvent.click(await screen.findByText("Supprimer de la base"));

    expect(screen.queryByText("Cuffey & Paterson ch. 5")).toBeNull();
    expect(screen.getByText(/supprimée/)).toBeTruthy();
    // rien n'est encore parti : le geste reste réversible
    expect(onRemoveSources).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Annuler"));
    expect(screen.getByText("Cuffey & Paterson ch. 5")).toBeTruthy();
    expect(onRemoveSources).not.toHaveBeenCalled();
  });

  it("passé le délai, la suppression part au backend en UN message", async () => {
    vi.useFakeTimers();
    try {
      const onRemoveSources = vi.fn();
      const { container } = renderUi(<KbSurface {...props({ onRemoveSources })} />);
      const picks = container.querySelectorAll(".kb-pick");
      fireEvent.click(picks[0]);
      fireEvent.click(picks[1]);
      fireEvent.click(screen.getByText("Supprimer"));
      expect(screen.getByText("2 sources supprimées")).toBeTruthy();
      expect(onRemoveSources).not.toHaveBeenCalled();

      await act(async () => { vi.advanceTimersByTime(8000); });
      expect(onRemoveSources).toHaveBeenCalledTimes(1);
      expect(onRemoveSources).toHaveBeenCalledWith(["aaaa1111", "bbbb2222"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("⌫ supprime la sélection sans passer par un menu", () => {
    const { container } = renderUi(<KbSurface {...props()} />);
    fireEvent.click(container.querySelectorAll(".kb-pick")[0]);
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(screen.queryByText("Cuffey & Paterson ch. 5")).toBeNull();
    expect(screen.getByText(/supprimée/)).toBeTruthy();
  });

  // Les dossiers vivaient dans le registre depuis le plan 051 sans jamais
  // arriver à l'écran : le rail les montre, et le lot les remplit.
  it("les dossiers filtrent depuis le rail et se remplissent par lot", async () => {
    const onTag = vi.fn();
    const collections = [{ slug: "ch1", title: "Chapitre 1" }];
    const sources = [
      { ...SOURCES[0], collections: ["ch1"] },
      SOURCES[1],
      SOURCES[2],
    ] as unknown as KbSource[];
    const { container } = renderUi(<KbSurface {...props({ sources, collections, onTag })} />);

    // le dossier est dans le rail, avec son compte, et la rangée porte sa puce
    expect(screen.getByText("Chapitre 1", { selector: ".kbs-chip-coll" })).toBeTruthy();
    fireEvent.click(screen.getByText("Chapitre 1", { selector: ".kbs-rail-name" }));
    expect(screen.getByText("Cuffey & Paterson ch. 5")).toBeTruthy();
    expect(screen.queryByText("Albedo feedbacks review")).toBeNull();

    fireEvent.click(screen.getByText("Toutes les sources", { selector: ".kbs-rail-name" }));
    fireEvent.click(container.querySelectorAll(".kb-pick")[1]);
    fireEvent.click(screen.getByText("Classer"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Chapitre 1" }));
    expect(onTag).toHaveBeenCalledWith(["bbbb2222"], "ch1", false);
  });

  // Glisser une rangée sur un dossier du rail : le geste que le rail rend
  // possible, et la raison pour laquelle les dossiers valent une colonne.
  it("glisser une sélection sur un dossier la classe", () => {
    const onTag = vi.fn();
    const collections = [{ slug: "ch1", title: "Chapitre 1" }];
    const { container } = renderUi(<KbSurface {...props({ collections, onTag })} />);
    const picks = container.querySelectorAll(".kb-pick");
    fireEvent.click(picks[0]);
    fireEvent.click(picks[1]);

    const row = container.querySelectorAll(".kb-row")[0];
    const folder = screen.getByText("Chapitre 1", { selector: ".kbs-rail-name" }).closest("button");
    const dataTransfer = { effectAllowed: "", setData: vi.fn(), getData: () => "aaaa1111" };
    fireEvent.dragStart(row, { dataTransfer });
    fireEvent.dragOver(folder as Element, { dataTransfer });
    fireEvent.drop(folder as Element, { dataTransfer });
    expect(onTag).toHaveBeenCalledWith(["aaaa1111", "bbbb2222"], "ch1", false);
  });

  it("créer un dossier depuis le rail, sans quitter la liste", () => {
    const onCreateCollection = vi.fn();
    renderUi(<KbSurface {...props({ onCreateCollection })} />);
    fireEvent.click(screen.getByText("Nouveau dossier"));
    const input = screen.getByPlaceholderText(/Nom du dossier/);
    fireEvent.change(input, { target: { value: "Chapitre 2" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCreateCollection).toHaveBeenCalledWith("Chapitre 2");
  });

  it("dit quand la recherche ne donne rien", () => {
    renderUi(<KbSurface {...props()} />);
    fireEvent.change(screen.getByPlaceholderText(/Chercher, ou coller une URL/), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText("Aucune source ne correspond.")).toBeTruthy();
  });

  // Carte passage gbrain du chat (tâche 6) : kb-open-gbrain-passage ouvre le
  // lecteur sur le bon slug, prêt à surligner la citation dès la réponse WS.
  it("un passage gbrain cité dans le chat ouvre le lecteur sur son slug", () => {
    renderUi(<KbSurface {...props()} />);
    act(() => {
      window.dispatchEvent(new CustomEvent("kb-open-gbrain-passage", {
        detail: { slug: "articles/aoki-2011-snow-albedo", quote: "physically based snow albedo" },
      }));
    });
    // la liste a laissé place au lecteur, ouvert sur ce slug précis
    expect(screen.queryByText("Cuffey & Paterson ch. 5")).toBeNull();
    expect(screen.getByTitle("articles/aoki-2011-snow-albedo")).toBeTruthy();
    expect(screen.getByText("Connexion indisponible. Réessaie après la reconnexion.")).toBeTruthy();
  });

  // Revue finale de branche, finding 1 : kb-open-gbrain-passage part de façon
  // SYNCHRONE (md.tsx) au moment même où App.tsx bascule la surface — mais
  // KbSurface ne monte qu'au rendu SUIVANT, donc son listener n'existe pas
  // encore quand l'event part (premier clic perdu). L'émetteur pose une
  // entrée dans pendingPassageOpen AVANT le dispatch ; au montage, KbSurface
  // doit la consommer et ouvrir le lecteur comme s'il avait reçu l'événement
  // — highlightQuote inclus (surlignage vérifié via le mark posé une fois le
  // contenu chargé, même mécanique que SourceReader.test.tsx).
  it("un passage gbrain pending (event perdu avant montage) rouvre le lecteur au montage, avec le highlight", async () => {
    setPendingPassageOpen({
      kind: "gbrain",
      detail: { slug: "articles/aoki-2011-snow-albedo", quote: "physically based snow albedo" },
      ts: Date.now(),
    });
    renderUi(<KbSurface {...props()} />);
    // la liste a laissé place au lecteur, sans qu'aucun événement n'ait été
    // dispatché après le montage
    expect(screen.queryByText("Cuffey & Paterson ch. 5")).toBeNull();
    expect(screen.getByTitle("articles/aoki-2011-snow-albedo")).toBeTruthy();
    act(() => {
      window.dispatchEvent(new CustomEvent("gbrain-page", {
        detail: {
          slug: "articles/aoki-2011-snow-albedo",
          markdown: "Ceci décrit un modèle physically based snow albedo utile au terrain.",
          chars: 60,
        },
      }));
    });
    await waitFor(() => expect(document.querySelector(".reader-quote")).toBeTruthy());
  });

  // Revue finale de branche, finding 1 (test c) : un événement reçu par un
  // listener DÉJÀ monté doit effacer l'entrée pending — sinon un remontage
  // ultérieur sans rapport (ex. bascule de surface, retour) la rejouerait à
  // tort et rouvrirait un passage déjà traité.
  it("un événement live reçu par un listener déjà monté efface l'entrée pending (pas de rejeu au remontage)", () => {
    renderUi(<KbSurface {...props()} />);
    act(() => {
      // même séquence que openGbrainPassage (md.tsx) : pending posé AVANT le
      // dispatch, ici simulée directement puisque le listener est déjà là.
      setPendingPassageOpen({
        kind: "gbrain",
        detail: { slug: "articles/aoki-2011-snow-albedo", quote: "physically based snow albedo" },
        ts: Date.now(),
      });
      window.dispatchEvent(new CustomEvent("kb-open-gbrain-passage", {
        detail: { slug: "articles/aoki-2011-snow-albedo", quote: "physically based snow albedo" },
      }));
    });
    expect(screen.getByTitle("articles/aoki-2011-snow-albedo")).toBeTruthy();
    expect(consumePendingPassageOpen()).toBeNull();
  });
});
