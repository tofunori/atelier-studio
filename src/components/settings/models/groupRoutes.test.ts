// Regroupement des routes opencode par modèle (lot B2). Pure, donc testable
// sans montage. Fixtures : identifiants routés RÉELS (voir
// rust/crates/atelier-providers/src/opencode.rs, section tests de
// parse_routed_models) — pas de forme inventée qu'aucun backend ne produit.
import { describe, expect, it } from "vitest";
import { filterGroups, groupRoutes, type Route } from "./groupRoutes";

// opencode/glm-5.2 et openrouter/z-ai/glm-5.2 : deux routes vers UN modèle
// (GLM 5.2), l'exemple qui motive tout ce module.
const glmOpencode: Route = { id: "opencode/glm-5.2", gateway: "opencode", vendor: null, leaf: "glm-5.2", free: false };
const glmOpenrouter: Route = { id: "openrouter/z-ai/glm-5.2", gateway: "openrouter", vendor: "z-ai", leaf: "glm-5.2", free: false };
// Route à route unique (gateway à 2 segments, donc vendor: null).
const kimiForCoding: Route = { id: "kimi-for-coding/k3", gateway: "kimi-for-coding", vendor: null, leaf: "k3", free: false };
// Modèle gratuit chez un éditeur différent, leaf distinct de kimiForCoding.
const deepseekFree: Route = {
  id: "openrouter/deepseek/deepseek-v4:free", gateway: "openrouter", vendor: "deepseek", leaf: "deepseek-v4", free: true,
};
// Même famille "kimi" mais leaf différent (kimi-k3 ≠ k3) : ne fusionne PAS
// avec kimiForCoding — le regroupement compare des chaînes, pas des noms de
// famille.
const kimiK3Openrouter: Route = {
  id: "openrouter/moonshotai/kimi-k3", gateway: "openrouter", vendor: "moonshotai", leaf: "kimi-k3", free: false,
};

describe("groupRoutes", () => {
  it("fusionne deux routes du même modèle en un groupe de deux routes", () => {
    const groups = groupRoutes([glmOpencode, glmOpenrouter], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].routes).toHaveLength(2);
    expect(groups[0].routes.map((r) => r.id)).toEqual(["opencode/glm-5.2", "openrouter/z-ai/glm-5.2"]);
  });

  it("un modèle à route unique reste un groupe d'une route", () => {
    const groups = groupRoutes([kimiForCoding], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].routes).toHaveLength(1);
    expect(groups[0].routes[0].id).toBe("kimi-for-coding/k3");
  });

  it("des leaf différents restent des groupes séparés (pas de fusion par famille de nom)", () => {
    const groups = groupRoutes([kimiForCoding, kimiK3Openrouter], []);
    expect(groups).toHaveLength(2);
  });

  it("vendor différents avec le même leaf : décision documentée — fusion quand même", () => {
    // openrouter/a/mixtral et openrouter/b/mixtral : même passerelle, même
    // leaf, vendor différents. Cohérent avec glmOpencode/glmOpenrouter
    // ci-dessus (vendor null vs "z-ai" et pourtant même modèle) : le
    // regroupement ignore `vendor`, groupe par `leaf` seul. Sur OpenRouter,
    // le second segment d'une route à trois segments désigne en réalité un
    // fournisseur d'INFRASTRUCTURE hébergeant le même modèle, pas un
    // éditeur différent — raison d'être du routage, confirmée en revue.
    const a: Route = { id: "openrouter/a/mixtral", gateway: "openrouter", vendor: "a", leaf: "mixtral", free: false };
    const b: Route = { id: "openrouter/b/mixtral", gateway: "openrouter", vendor: "b", leaf: "mixtral", free: false };
    const groups = groupRoutes([a, b], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].routes).toHaveLength(2);
    // Vendor du groupe : null, puisque les routes membres ne s'accordent pas.
    expect(groups[0].vendor).toBeNull();
  });

  it("fusionne deux routes dont le leaf ne diffère que par la casse ou les espaces", () => {
    // Décision documentée dans normalizeLeaf : GLM-5.2 et glm-5.2 sont le
    // même nom de modèle pour l'utilisateur ; une incohérence de casse du
    // backend ne doit pas les séparer en deux groupes.
    const upper: Route = { id: "opencode/GLM-5.2", gateway: "opencode", vendor: null, leaf: "GLM-5.2", free: false };
    const padded: Route = { id: "openrouter/z-ai/ glm-5.2 ", gateway: "openrouter", vendor: "z-ai", leaf: " glm-5.2 ", free: false };
    const groups = groupRoutes([upper, padded], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].routes).toHaveLength(2);
  });

  it("deux routes au leaf vide ne fusionnent pas", () => {
    // Logique locale pure, bon marché à vérifier même si l'inatteignabilité
    // du leaf vide est par ailleurs garantie côté Rust (voir le commentaire
    // sur `split_routed_model`) : si cette garantie amont changeait un jour,
    // ce test le remarquerait sans dépendre d'elle.
    const a: Route = { id: "opencode/a", gateway: "opencode", vendor: null, leaf: "", free: false };
    const b: Route = { id: "opencode/b", gateway: "opencode", vendor: null, leaf: "", free: false };
    const groups = groupRoutes([a, b], []);
    expect(groups).toHaveLength(2);
  });

  it("le libellé du groupe est stable quel que soit l'ordre d'arrivée des routes", () => {
    // Règle retenue : le plus petit leaf par ordre alphabétique, jamais « le
    // premier rencontré » — rien ne garantit que le catalogue renvoie ses
    // routes dans le même ordre d'un appel à l'autre.
    const upper: Route = { id: "opencode/GLM-5.2", gateway: "opencode", vendor: null, leaf: "GLM-5.2", free: false };
    const lower: Route = { id: "openrouter/z-ai/glm-5.2", gateway: "openrouter", vendor: "z-ai", leaf: "glm-5.2", free: false };
    const forward = groupRoutes([upper, lower], []);
    const backward = groupRoutes([lower, upper], []);
    expect(forward[0].label).toBe(backward[0].label);
    // "GLM-5.2" < "glm-5.2" par point de code (majuscules avant minuscules
    // en ASCII) : c'est le libellé attendu dans les deux ordres.
    expect(forward[0].label).toBe("GLM-5.2");
    expect(backward[0].label).toBe("GLM-5.2");
  });

  it("le vendor du groupe est reporté quand toutes les routes s'accordent", () => {
    const groups = groupRoutes([glmOpenrouter], []);
    expect(groups[0].vendor).toBe("z-ai");
  });

  it("le compte d'épinglées est juste", () => {
    const groups = groupRoutes(
      [glmOpencode, glmOpenrouter, kimiForCoding],
      ["opencode/glm-5.2", "kimi-for-coding/k3"],
    );
    const glm = groups.find((g) => g.label === "glm-5.2")!;
    const kimi = groups.find((g) => g.label === "k3")!;
    expect(glm.pinnedCount).toBe(1); // une seule des deux routes du groupe est épinglée
    expect(kimi.pinnedCount).toBe(1);
  });

  it("une route ni épinglée ni son groupe ne compte 0", () => {
    const groups = groupRoutes([deepseekFree], []);
    expect(groups[0].pinnedCount).toBe(0);
  });

  it("les clés de groupe sont uniques et stables entre deux appels", () => {
    const routes = [glmOpencode, glmOpenrouter, kimiForCoding, deepseekFree, kimiK3Openrouter];
    const first = groupRoutes(routes, []);
    const second = groupRoutes(routes, []);
    expect(new Set(first.map((g) => g.key)).size).toBe(first.length);
    expect(first.map((g) => g.key)).toEqual(second.map((g) => g.key));
  });

  it("ne mute ni le tableau de routes ni les objets route reçus", () => {
    const routes = [glmOpencode, glmOpenrouter];
    const snapshot = JSON.parse(JSON.stringify(routes));
    groupRoutes(routes, ["opencode/glm-5.2"]);
    expect(routes).toEqual(snapshot);
  });

  it("ne mute pas le tableau `pinned` reçu", () => {
    const pinned = ["opencode/glm-5.2"];
    const snapshot = [...pinned];
    groupRoutes([glmOpencode, glmOpenrouter], pinned);
    expect(pinned).toEqual(snapshot);
  });

  it("5000 routes se regroupent en moins d'une seconde", () => {
    const many: Route[] = [];
    for (let i = 0; i < 5000; i++) {
      const gateway = i % 2 === 0 ? "opencode" : "openrouter";
      const vendor = i % 2 === 0 ? null : `vendor-${i % 37}`;
      many.push({ id: `${gateway}/route-${i}`, gateway, vendor, leaf: `model-${i % 500}`, free: i % 5 === 0 });
    }
    const start = performance.now();
    const groups = groupRoutes(many, []);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(groups.length).toBe(500); // 500 leaf distincts, 10 routes chacun
  });
});

describe("filterGroups", () => {
  const groups = groupRoutes([glmOpencode, glmOpenrouter, kimiForCoding, deepseekFree, kimiK3Openrouter], []);

  it("sans filtre (gateway null, query vide) renvoie tous les groupes", () => {
    expect(filterGroups(groups, null, "", [])).toHaveLength(groups.length);
  });

  it("le filtre par passerelle ne garde que les routes de cette passerelle", () => {
    const filtered = filterGroups(groups, "openrouter", "", []);
    const glm = filtered.find((g) => g.label === "glm-5.2")!;
    // Le groupe glm-5.2 avait 2 routes (opencode + openrouter) ; seule celle
    // d'openrouter doit survivre.
    expect(glm.routes).toHaveLength(1);
    expect(glm.routes[0].gateway).toBe("openrouter");
  });

  it("le filtre par passerelle retire les groupes devenus vides", () => {
    // kimiForCoding est le SEUL membre de son groupe et sa gateway est
    // "kimi-for-coding" : filtrer sur "openrouter" doit faire disparaître ce
    // groupe entièrement, pas le laisser vide dans le résultat.
    const filtered = filterGroups(groups, "openrouter", "", []);
    expect(filtered.some((g) => g.label === "k3")).toBe(false);
    expect(filtered.every((g) => g.routes.length > 0)).toBe(true);
  });

  it("une passerelle sans aucune correspondance renvoie un tableau vide", () => {
    expect(filterGroups(groups, "inexistante", "", [])).toEqual([]);
  });

  it("la recherche porte sur le nom du modèle", () => {
    const filtered = filterGroups(groups, null, "glm", []);
    expect(filtered.map((g) => g.label)).toEqual(["glm-5.2"]);
  });

  it("la recherche porte aussi sur l'identifiant complet de route", () => {
    // "z-ai" n'apparaît pas dans le label ("glm-5.2") mais dans l'id complet
    // de la route openrouter.
    const filtered = filterGroups(groups, null, "z-ai", []);
    expect(filtered.map((g) => g.label)).toEqual(["glm-5.2"]);
  });

  it("la recherche est insensible à la casse", () => {
    const filtered = filterGroups(groups, null, "DEEPSEEK", []);
    expect(filtered.map((g) => g.label)).toEqual(["deepseek-v4"]);
  });

  it("une recherche sans correspondance renvoie un tableau vide", () => {
    expect(filterGroups(groups, null, "modèle-inexistant-xyz", [])).toEqual([]);
  });

  it("combine passerelle et recherche", () => {
    const filtered = filterGroups(groups, "openrouter", "glm", []);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].routes.map((r) => r.gateway)).toEqual(["openrouter"]);
  });

  it("ne mute pas le tableau de groupes reçu", () => {
    const before = JSON.parse(JSON.stringify(groups));
    filterGroups(groups, "openrouter", "glm", []);
    expect(groups).toEqual(before);
  });

  // --- Test croisé (correction de revue) : épinglées + filtre passerelle ---

  it("pinnedCount reflète les routes VISIBLES après filtre passerelle, pas le groupe complet", () => {
    // Les deux routes de glm-5.2 sont épinglées, mais le filtre openrouter
    // n'en laisse qu'une visible : le compte doit tomber à 1, pas rester à 2.
    const pinned = ["opencode/glm-5.2", "openrouter/z-ai/glm-5.2"];
    const withPins = groupRoutes([glmOpencode, glmOpenrouter], pinned);
    expect(withPins[0].pinnedCount).toBe(2); // avant filtre : les deux routes comptent

    const filtered = filterGroups(withPins, "openrouter", "", pinned);
    const glm = filtered.find((g) => g.label === "glm-5.2")!;
    expect(glm.routes).toHaveLength(1);
    expect(glm.pinnedCount).toBe(1); // après filtre : une seule route visible, une seule épinglée
  });

  it("pinnedCount tombe à 0 si le filtre passerelle exclut la seule route épinglée", () => {
    const pinned = ["opencode/glm-5.2"];
    const withPins = groupRoutes([glmOpencode, glmOpenrouter], pinned);
    const filtered = filterGroups(withPins, "openrouter", "", pinned);
    const glm = filtered.find((g) => g.label === "glm-5.2")!;
    expect(glm.routes).toHaveLength(1);
    expect(glm.routes[0].id).toBe("openrouter/z-ai/glm-5.2");
    expect(glm.pinnedCount).toBe(0);
  });

  it("sans filtre passerelle (gateway null), pinnedCount reflète le `pinned` de CET appel, pas celui de groupRoutes", () => {
    // Couvre la branche gateway === null, absente des deux tests croisés
    // ci-dessus (tous deux sur gateway: "openrouter") : le commentaire de
    // filterGroups promet que pinnedCount reste correct même si `pinned` a
    // bougé entre la construction des groupes et l'appel à filterGroups,
    // y compris quand aucun filtre de passerelle n'est appliqué.
    const built = groupRoutes([glmOpencode, glmOpenrouter], []); // aucune épinglée à la construction
    expect(built[0].pinnedCount).toBe(0);

    // `pinned` a bougé depuis (l'utilisateur a épinglé une route) sans
    // reconstruire les groupes : filterGroups(gateway: null) doit refléter
    // ce nouvel état, pas le pinnedCount figé à la construction.
    const filtered = filterGroups(built, null, "", ["opencode/glm-5.2"]);
    const glm = filtered.find((g) => g.label === "glm-5.2")!;
    expect(glm.routes).toHaveLength(2); // gateway null : aucune route retirée
    expect(glm.pinnedCount).toBe(1);
  });
});
