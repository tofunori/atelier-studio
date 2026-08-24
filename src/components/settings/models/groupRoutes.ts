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
  label: string; // nom humain du modèle (leaf de la première route rencontrée)
  vendor: string | null; // éditeur commun à toutes les routes du groupe, sinon null
  routes: Route[];
  pinnedCount: number;
};

// Normalise un `leaf` pour la clé de regroupement : `trim` + minuscules.
// Deux routes dont le nom de modèle ne diffère que par la casse ou des
// espaces superflus (bruit de catalogue) fusionnent quand même.
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
 */
export function filterGroups(groups: ModelGroup[], gateway: string | null, query: string): ModelGroup[] {
  // `pinnedCount` n'est PAS recalculé ici : cette fonction ne reçoit pas la
  // liste `pinned` (signature du brief, confirmée dans l'interface fournie
  // — seuls `groups`, `gateway` et `query` lui parviennent), donc elle ne
  // peut pas savoir lesquelles des routes survivantes sont épinglées. Le
  // recalculer à l'aveugle produirait silencieusement un compte erroné
  // (souvent 0) plutôt que le compte honnête déjà posé par `groupRoutes`.
  // Ce compte reste donc celui du groupe complet, avant filtrage.
  const byGateway = gateway === null
    ? groups
    : groups
        .map((g) => {
          const routes = g.routes.filter((r) => r.gateway === gateway);
          return routes.length === g.routes.length ? g : { ...g, routes };
        })
        .filter((g) => g.routes.length > 0);

  const q = query.trim().toLowerCase();
  if (q.length === 0) return byGateway;

  return byGateway.filter((g) => {
    if (g.label.toLowerCase().includes(q)) return true;
    return g.routes.some((r) => r.id.toLowerCase().includes(q));
  });
}
