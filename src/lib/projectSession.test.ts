// Session par projet : revenir sur un projet doit le rouvrir là où on l'a
// laissé — dernier fil, onglets intacts. Avant ce module, `selectProject`
// remettait le fil actif à null sans exception et un effet fermait les onglets
// des autres projets ; un aller-retour entre deux projets effaçait donc la
// conversation en cours et les fichiers ouverts (vécu 2026-08-21).
import { describe, expect, it } from "vitest";
import {
  mergeReorderedTabs,
  pickActiveTabForProject,
  pickThreadOnProjectSelect,
  rememberForProject,
  visibleTabsForProject,
} from "./projectSession";

const A = "/Users/x/Documents/Albedo";
const B = "/Users/x/Documents/Memoire";

describe("pickThreadOnProjectSelect", () => {
  it("rouvre le dernier fil du projet qu'on rejoint", () => {
    // LE cas du bug : on quitte B, on y revient, la conversation est là
    expect(pickThreadOnProjectSelect({
      clicked: B,
      activeProject: A,
      lastThreadByProject: { [A]: "t-a", [B]: "t-b" },
      knownThreadIds: ["t-a", "t-b"],
    })).toEqual({ project: B, threadId: "t-b" });
  });

  it("bascule sur l'accueil quand on re-clique le projet déjà actif", () => {
    // le re-clic est la SEULE porte d'entrée de l'accueil, maintenant que le
    // clic ordinaire restaure un fil
    expect(pickThreadOnProjectSelect({
      clicked: A,
      activeProject: A,
      lastThreadByProject: { [A]: "t-a" },
      knownThreadIds: ["t-a"],
    })).toEqual({ project: A, threadId: null });
  });

  it("ouvre l'accueil d'un projet encore jamais visité", () => {
    expect(pickThreadOnProjectSelect({
      clicked: B,
      activeProject: A,
      lastThreadByProject: { [A]: "t-a" },
      knownThreadIds: ["t-a"],
    })).toEqual({ project: B, threadId: null });
  });

  it("retombe sur l'accueil quand le fil mémorisé a été supprimé", () => {
    // un fil supprimé depuis une autre fenêtre laisse une mémoire périmée :
    // restaurer son id afficherait une conversation fantôme
    expect(pickThreadOnProjectSelect({
      clicked: B,
      activeProject: A,
      lastThreadByProject: { [B]: "t-disparu" },
      knownThreadIds: ["t-a"],
    })).toEqual({ project: B, threadId: null });
  });

  it("restaure aussi quand aucun projet n'est actif", () => {
    // au boot, activeProject peut être null le temps que le miroir arrive
    expect(pickThreadOnProjectSelect({
      clicked: B,
      activeProject: null,
      lastThreadByProject: { [B]: "t-b" },
      knownThreadIds: ["t-b"],
    })).toEqual({ project: B, threadId: "t-b" });
  });

  it("survit à une mémoire absente ou malformée", () => {
    for (const bad of [undefined, null, "…", 42, [], { [B]: 7 }]) {
      expect(pickThreadOnProjectSelect({
        clicked: B,
        activeProject: A,
        lastThreadByProject: bad,
        knownThreadIds: ["t-b"],
      })).toEqual({ project: B, threadId: null });
    }
  });
});

describe("visibleTabsForProject", () => {
  const galleryA = { id: "1", url: "http://127.0.0.1:8410/edit?f=x.tex", title: "x.tex" };
  const galleryB = { id: "2", url: "http://127.0.0.1:8733/edit?f=y.tex", title: "y.tex" };
  const termA = { id: "3", url: "", title: "zsh", kind: "term" as const, cwd: A };
  const owned = { id: "4", url: "https://example.org", title: "doc", projectRoot: B };
  const originA = "http://127.0.0.1:8410";
  const tabs = [galleryA, galleryB, termA, owned];

  it("ne montre que les onglets du projet actif", () => {
    expect(visibleTabsForProject(tabs, A, originA)).toEqual([galleryA, termA]);
  });

  it("ne détruit rien : les onglets cachés restent dans la liste source", () => {
    // c'est TOUT le correctif — l'ancien effet appelait setAtelierTabs(next) et
    // perdait les autres projets (dont des ptys jamais fermés côté serveur)
    const before = [...tabs];
    visibleTabsForProject(tabs, A, originA);
    expect(tabs).toEqual(before);
  });

  it("fait confiance à projectRoot avant l'origine de l'URL", () => {
    expect(visibleTabsForProject(tabs, B, "http://127.0.0.1:8733"))
      .toEqual([galleryB, owned]);
  });

  it("garde un terminal sans cwd, qui n'appartient à aucun projet", () => {
    const flottant = { id: "5", url: "", title: "zsh", kind: "term" as const };
    expect(visibleTabsForProject([flottant], B, originA)).toEqual([flottant]);
  });

  it("ne cache rien tant que le projet ou son serveur manquent", () => {
    // au boot, l'URL de l'atelier arrive après le projet : cacher ici ferait
    // clignoter la bande d'onglets
    expect(visibleTabsForProject(tabs, null, originA)).toEqual(tabs);
    expect(visibleTabsForProject(tabs, A, null)).toEqual(tabs);
  });

  it("cache un onglet dont l'URL est inexploitable", () => {
    const casse = { id: "6", url: "pas une url", title: "?" };
    expect(visibleTabsForProject([casse], A, originA)).toEqual([]);
  });
});

describe("pickActiveTabForProject", () => {
  it("restaure l'onglet où on avait laissé le projet", () => {
    expect(pickActiveTabForProject("tab-3", ["tab-1", "tab-3"])).toBe("tab-3");
  });

  it("retombe sur la galerie quand l'onglet mémorisé n'est plus visible", () => {
    // onglet fermé entre-temps : sans ce repli, l'atelier afficherait du vide
    expect(pickActiveTabForProject("tab-3", ["tab-1"])).toBe("gallery");
  });

  it("retombe sur la galerie quand le projet n'a rien mémorisé", () => {
    expect(pickActiveTabForProject(null, ["tab-1"])).toBe("gallery");
  });

  it("accepte les surfaces permanentes, qui ne sont pas dans la liste", () => {
    // galerie et IDE existent pour tout projet sans être des onglets ouverts
    expect(pickActiveTabForProject("ide", [])).toBe("ide");
    expect(pickActiveTabForProject("gallery", [])).toBe("gallery");
  });
});

describe("rememberForProject", () => {
  it("mémorise une valeur sans toucher les autres projets", () => {
    expect(rememberForProject({ [A]: "t-a" }, B, "t-b")).toEqual({ [A]: "t-a", [B]: "t-b" });
  });

  it("oublie le projet quand la valeur est nulle", () => {
    // l'accueil du projet n'est pas un fil : rien à retenir
    expect(rememberForProject({ [A]: "t-a", [B]: "t-b" }, B, null)).toEqual({ [A]: "t-a" });
  });

  it("rend l'objet d'origine quand rien ne change", () => {
    // React compare par identité : retourner un nouvel objet à chaque rendu
    // relancerait l'écriture disque en boucle
    const memoire = { [A]: "t-a" };
    expect(rememberForProject(memoire, A, "t-a")).toBe(memoire);
    expect(rememberForProject(memoire, B, null)).toBe(memoire);
  });

  it("ignore un projet vide", () => {
    const memoire = { [A]: "t-a" };
    expect(rememberForProject(memoire, "", "t-x")).toBe(memoire);
  });
});

describe("mergeReorderedTabs", () => {
  const t = (id: string) => ({ id, url: "", title: id });
  const [a, b, c, cache] = [t("a"), t("b"), t("c"), t("cache")];

  it("réordonne les onglets visibles à leurs propres places", () => {
    // la bande d'onglets ne connaît QUE le projet actif : elle renvoie
    // ["c","a"], et les onglets masqués doivent rester où ils sont
    expect(mergeReorderedTabs([a, cache, c], ["c", "a"])).toEqual([c, cache, a]);
  });

  it("ne perd jamais un onglet masqué", () => {
    const next = mergeReorderedTabs([a, cache, b, c], ["c", "b", "a"]);
    expect(next).toHaveLength(4);
    expect(next).toContain(cache);
  });

  it("ignore un id inconnu plutôt que de trouer la liste", () => {
    expect(mergeReorderedTabs([a, b], ["b", "fantome", "a"])).toEqual([b, a]);
  });

  it("rend la liste inchangée quand l'ordre ne bouge pas", () => {
    expect(mergeReorderedTabs([a, cache, b], ["a", "b"])).toEqual([a, cache, b]);
  });
});
