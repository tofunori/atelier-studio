// Dérivation pure du regroupement des routes opencode par modèle (lot B2).
// Le catalogue opencode peut publier plusieurs milliers d'identifiants
// routés (Rust : atelier-providers/src/opencode.rs, split_routed_model), et
// le MÊME modèle y arrive souvent par PLUSIEURS chemins : `opencode/glm-5.2`
// et `openrouter/z-ai/glm-5.2` sont deux routes vers GLM 5.2, à des latences
// et des prix différents. Ce module fusionne ces routes en groupes par nom
// de modèle (`leaf`) — c'est ce regroupement, plus que n'importe quel
// filtre, qui rend le catalogue lisible. Hors de React et sans effet de
// bord, donc testable exhaustivement sans montage.
//
// Correction de brief : l'interface fournie déclarait `vendor?: string |
// null` sur `Route` (optionnel). Le champ `routes` réel de
// `ProviderCatalogRow` (src/components/settings/shared.ts) déclare
// `vendor: string | null` — JAMAIS omis (vérifié côté Rust par le test
// `vendor_absent_se_serialise_en_null_jamais_omis`, qui sérialise `None` en
// `null` plutôt que d'omettre la clé). `Route` reprend donc ce typage
// obligatoire, pas optionnel, pour rester le sous-ensemble exact du champ
// `routes` déjà utilisé ailleurs.
export type Route = {
  id: string;
  gateway: string;
  vendor: string | null;
  leaf: string;
  free: boolean;
};

export type ModelGroup = {
  key: string; // clé stable du groupe (leaf normalisé, ou id de route en repli)
  label: string; // nom humain du modèle (leaf brut de la première route rencontrée — voir décision ci-dessous)
  vendor: string | null; // éditeur commun à toutes les routes du groupe, sinon null
  routes: Route[];
  pinnedCount: number;
};

// Normalise un `leaf` pour la clé de regroupement : `trim` + minuscules.
//
// **Décision de conception documentée (revue post-implémentation) :** ceci
// est une SECONDE décision de fusion, de même nature que celle sur les
// `vendor` différents ci-dessous, mais sur la casse/les espaces plutôt que
// sur l'éditeur. `GLM-5.2` et `glm-5.2` fusionnent délibérément dans le même
// groupe : ce sont, pour l'utilisateur, le même nom de modèle, et un
// catalogue qui les séparerait à cause d'une incohérence de casse du
// backend serait moins lisible, pas plus exact. Testé explicitement (voir
// "fusionne deux routes dont le leaf ne diffère que par la casse/espaces").
//
// Conséquence assumée sur `label` : quand deux routes fusionnées ne
// diffèrent QUE par la casse, le libellé affiché est celui de la PREMIÈRE
// route rencontrée dans le tableau d'entrée — dépendant de l'ordre
// d'arrivée, pas d'une règle de tri. Le risque est jugé faible (un backend
// qui varie la casse du même modèle route par route serait déjà un bug
// côté catalogue) et le comportement reste déterministe pour un tableau
// d'entrée donné (voir le test de clés stables entre deux appels) ; aucune
// règle de préférence (alphabétique, la plus fréquente…) n'a été ajoutée
// faute de signal qu'elle serait utile.
function normalizeLeaf(leaf: string): string {
  return leaf.trim().toLowerCase();
}

/** Compte, parmi `routes`, celles dont l'`id` figure dans `pinned`. */
function countPinned(routes: Route[], pinned: ReadonlySet<string>): number {
  let n = 0;
  for (const r of routes) if (pinned.has(r.id)) n++;
  return n;
}

/**
 * Regroupe des routes opencode par modèle.
 *
 * **Décision de conception (arbitrage laissé par le brief) :** deux routes
 * au même `leaf` mais des `vendor` différents (ex. `openrouter/a/mixtral`
 * et `openrouter/b/mixtral`) fusionnent dans LE MÊME groupe. Ce choix suit
 * directement l'exemple qui motive ce module : `opencode/glm-5.2` (vendor
 * `null`) et `openrouter/z-ai/glm-5.2` (vendor `"z-ai"`) sont explicitement
 * décrites comme DEUX ROUTES VERS UN SEUL MODÈLE, alors que leurs `vendor`
 * diffèrent déjà (`null` vs `"z-ai"`) — le regroupement ne peut donc pas
 * dépendre de l'égalité de `vendor` sans se contredire sur son propre cas
 * d'usage principal. Grouper par `leaf` seul est aussi ce qui sert le mieux
 * l'utilisateur qui cherche un modèle par son nom : un catalogue de
 * plusieurs milliers d'identifiants routés reste illisible tant qu'on
 * n'unifie pas au moins par nom. Le risque inverse — deux éditeurs
 * publiant, par pure coïncidence de nommage, deux modèles réellement
 * différents sous le même `leaf` — existe mais reste rare et son coût (un
 * groupe contenant deux routes qui ne devraient pas être confondues) est
 * moindre que celui de laisser le catalogue éclaté. Champ `vendor` du
 * groupe : `null` dès que les routes membres ne partagent pas le même
 * éditeur, pour ne jamais laisser croire à un éditeur unique inexistant.
 */
export function groupRoutes(routes: Route[], pinned: string[]): ModelGroup[] {
  const pinnedSet = new Set(pinned);
  const order: string[] = [];
  const byKey = new Map<string, { label: string; vendor: string | null; vendorHomogene: boolean; routes: Route[] }>();

  for (const route of routes) {
    const normalized = normalizeLeaf(route.leaf);
    // Repli défensif : un `leaf` vide n'est normalement pas atteignable
    // depuis le Rust (voir le commentaire d'exhaustivité sur
    // `split_routed_model`), mais si jamais il l'était, fusionner toutes
    // ces routes sous une seule clé "" masquerait des modèles distincts.
    // Chaque route au leaf vide reste donc son propre groupe, sur son id.
    // Assumé SANS TEST : la branche est sourcée sur l'inatteignabilité
    // documentée côté Rust (le seul bras qui produirait un leaf vide dans
    // `split_routed_model` est un `match` marqué « inatteignable » par son
    // propre commentaire), donc jugée non prioritaire à simuler ici.
    const key = normalized.length > 0 ? normalized : `__empty-leaf__:${route.id}`;

    let entry = byKey.get(key);
    if (!entry) {
      entry = { label: route.leaf, vendor: route.vendor, vendorHomogene: true, routes: [] };
      byKey.set(key, entry);
      order.push(key);
    } else if (entry.vendorHomogene && entry.vendor !== route.vendor) {
      entry.vendorHomogene = false;
      entry.vendor = null;
    }
    entry.routes.push(route);
  }

  return order.map((key) => {
    const entry = byKey.get(key)!;
    return {
      key,
      label: entry.label,
      vendor: entry.vendor,
      routes: entry.routes,
      pinnedCount: countPinned(entry.routes, pinnedSet),
    };
  });
}

/**
 * Filtre des groupes déjà construits, par passerelle puis par recherche.
 *
 * - `gateway` (non nul) : ne garde, DANS CHAQUE GROUPE, que les routes de
 *   cette passerelle ; un groupe qui n'en a plus aucune disparaît
 *   entièrement du résultat plutôt que d'apparaître vide.
 * - `query` (non vide après `trim`) : garde un groupe si son nom humain
 *   (`label`) OU l'identifiant complet (`id`) d'au moins une de ses routes
 *   restantes contient la requête (comparaison insensible à la casse).
 *   Ne retire pas de routes individuelles à l'intérieur d'un groupe gardé —
 *   seul le filtre de passerelle réduit les routes.
 * - `pinned` : mêmes identifiants de route que ceux passés à `groupRoutes`.
 *
 * Correction post-revue : la première version de cette fonction ne prenait
 * pas `pinned` et laissait `pinnedCount` hérité tel quel du groupe complet
 * après un filtre de passerelle — un groupe à deux routes épinglées, réduit
 * à une seule route visible, continuait donc d'afficher `pinnedCount: 2`.
 * Signature corrigée : `pinnedCount` est désormais TOUJOURS recalculé ici à
 * partir des routes du résultat (post-filtre passerelle) et de `pinned`,
 * jamais hérité du groupe d'entrée — un compte faux dans le cas d'usage
 * principal (afficher combien de routes VISIBLES sont épinglées) est pire
 * qu'un paramètre de plus.
 */
export function filterGroups(groups: ModelGroup[], gateway: string | null, query: string, pinned: string[]): ModelGroup[] {
  const pinnedSet = new Set(pinned);
  // Toujours recalculé, même quand `gateway` est nul (routes inchangées) :
  // ainsi `pinnedCount` reste correct même si `pinned` a bougé (pin/unpin)
  // depuis la dernière construction des groupes par `groupRoutes`, plutôt
  // que de dépendre d'une hypothèse de cohérence entre les deux appels.
  const withCount = (g: ModelGroup, routes: Route[]): ModelGroup => ({
    ...g,
    routes,
    pinnedCount: countPinned(routes, pinnedSet),
  });

  const byGateway = gateway === null
    ? groups.map((g) => withCount(g, g.routes))
    : groups
        .map((g) => withCount(g, g.routes.filter((r) => r.gateway === gateway)))
        .filter((g) => g.routes.length > 0);

  const q = query.trim().toLowerCase();
  if (q.length === 0) return byGateway;

  return byGateway.filter((g) => {
    if (g.label.toLowerCase().includes(q)) return true;
    return g.routes.some((r) => r.id.toLowerCase().includes(q));
  });
}
