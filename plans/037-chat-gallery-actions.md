# Plan 037 — Permettre au chat de piloter la Galerie

> **Mandat produit** : permettre à Thierry de demander au chat de retrouver,
> montrer, sélectionner et organiser des figures dans la Galerie avec des
> actions explicites, vérifiables et réversibles. Le texte du modèle ne doit
> jamais être interprété comme une mutation implicite de l'état scientifique.

## 0. Positionnement

- **Statut** : IN PROGRESS — lot 0 en TDD.
- **Date de référence** : 2026-07-13.
- **Priorité** : P1.
- **Effort estimé** : L, sept lots incrémentaux.
- **Dépendances** : plans 019 (Galerie scientifique) et 025 (harnais agentique).
- **Risque principal** : faire diverger l'état visible de la Galerie et
  `.fig_state.json`, ou laisser une réponse textuelle déclencher une mutation.
- **Relance obligatoire** : protocole `AGENTS.md` après chaque lot qui modifie
  le code.

## 1. Expérience cible

### Montrer des figures

```text
Thierry : Montre-moi fig1_hero_heatmap_v2, fig2_driver_context et
          fig4_melt_upper_bound.

Chat    : 3 figures trouvées et affichées dans la Galerie.
Galerie : bascule au premier plan, filtre temporaire sur les trois figures,
          sélection visible des trois cartes.
```

Une figure absente ne fait pas échouer les autres. Le résultat doit nommer les
éléments trouvés et absents. Un filtre créé par le chat est temporaire et peut
être retiré avec les contrôles habituels de la Galerie.

### Créer ou enrichir une collection

```text
Thierry : Ajoute-les à la collection « Présentation directeur ».
Chat    : 3 figures ajoutées à « Présentation directeur ».
```

L'opération est idempotente : répéter la commande ne duplique pas les chemins.
La collection est durable dans `.fig_state.json` et visible immédiatement dans
le menu Collections.

### Reprendre la sélection visible

```text
Thierry : Compare celles que j'ai sélectionnées.
```

Le chat obtient une photographie bornée de la sélection active, jamais un accès
générique au DOM de l'iframe.

## 2. Principes non négociables

1. **Outils explicites** : Claude/Codex/Grok appellent un outil structuré. Une
   phrase ou un bloc Markdown de l'assistant ne déclenche aucune action.
2. **Lecture avant mutation** : les opérations de collection partent de la
   révision courante et appliquent une mutation atomique; elles ne réécrivent
   pas aveuglément tout `/state` depuis une copie potentiellement périmée.
3. **Projet actif obligatoire** : chaque commande porte l'identité canonique du
   projet et est refusée si elle cible une autre Galerie.
4. **Chemins du catalogue seulement** : les chemins sont normalisés, dédupliqués
   et recoupés avec `figures_data.json`. Aucun chemin arbitraire n'est accepté.
5. **Séparation durable/temporaire** : afficher ou sélectionner est une action
   de vue; collections, favoris, tags et workflow sont des mutations durables.
6. **Accusé de réception** : chaque commande a un `requestId` et retourne les
   chemins appliqués, absents et ignorés.
7. **Sécurité du bridge** : origine loopback attendue, nonce Atelier et schéma
   strict; charges et tailles sont bornées.
8. **Pas de dépendance à un seul provider** : le contrat métier est partagé;
   les adaptateurs Claude/Codex/Grok restent minces.

## 3. Architecture cible

```text
Chat Claude / Codex / Grok
  -> outil MCP gallery_search | gallery_show | gallery_collection_add
  -> sidecar Atelier : validation projet + audit de la commande
  -> serveur Galerie : catalogue ou mutation atomique
  -> App React : bascule vers la surface Atelier
  -> iframe Galerie : atelier-gallery-command + nonce
  -> résultat structuré : atelier-gallery-result
  -> carte d'outil dans le chat
```

Le MCP est le chemin de référence parce que Claude et Codex savent déjà
représenter ses appels dans la timeline. Le client Codex d'Atelier refuse
actuellement les outils dynamiques uniquement côté interface; le produit ne
doit donc pas dépendre de ce mécanisme.

## 4. Contrat de commandes V1

### `gallery_show`

Entrée :

```json
{
  "projectRoot": "/projet/canonique",
  "requestId": "uuid",
  "rels": ["figures/a.png", "figures/b.svg"],
  "mode": "focus"
}
```

Sortie :

```json
{
  "ok": true,
  "action": "show",
  "requestId": "uuid",
  "matched": ["figures/a.png"],
  "missing": ["figures/b.svg"]
}
```

Bornes V1 : 1 à 100 chemins, chaîne de 1 à 2048 caractères, `requestId` de 1
à 128 caractères, clés inconnues refusées à la frontière IPC.

### `gallery_search`

- Recherche accent-insensible sur `rel`, `name`, `folder`, tags, workflow et
  collection.
- Retour borné et stable, avec score et raison du match.
- Une recherche ambiguë ne choisit pas silencieusement entre deux homonymes.

### `gallery_collection_add`

- Nom normalisé de 1 à 80 caractères.
- Maximum actuel conservé : 1 000 chemins par collection.
- Fusion en ensemble, tri stable et écriture atomique.
- Résultat : `added`, `alreadyPresent`, `missing`, nouvelle révision.

### `gallery_get_selection`

- Lecture seule.
- Retour limité aux chemins connus et à 100 éléments.
- Inclut la révision du catalogue qui a servi à la sélection.

## 5. Lots d'exécution

### Lot 0 — Contrat pur et premier test `show`

1. Ajouter un module sans DOM qui valide et normalise
   `atelier-gallery-command`.
2. Écrire le test avant l'implémentation : déduplication, chemins absents,
   refus des commandes invalides et appel unique de l'adaptateur `show`.
3. Charger ce contrat dans la page générée de la Galerie.
4. Ajouter un listener de message borné par nonce et `window.top`.
5. En V0, appliquer un focus temporaire et remplacer la sélection par les
   figures trouvées; publier un résultat structuré vers l'app.

**Sortie** : test ciblé vert, aucune mutation de `.fig_state.json`.

### Lot 1 — Bridge App React et visibilité

1. Étendre les types IPC avec commande et résultat.
2. Ajouter une API `sendGalleryCommand` qui cible uniquement l'iframe de la
   Galerie active avec son origine exacte et le nonce courant.
3. Conserver les requêtes en attente par `requestId` avec timeout et nettoyage
   au changement de projet.
4. À `show`, basculer vers la surface Atelier seulement après validation.
5. Afficher un retour non bloquant si aucune figure n'est trouvée.

**Tests** : origine/nonce, iframe absente, timeout, changement de projet,
résultat partiel et absence de double envoi sous StrictMode.

### Lot 2 — Recherche de catalogue

1. Extraire une recherche pure depuis `figures_data.json`.
2. Exposer un endpoint loopback en lecture seule.
3. Ajouter score, motifs de correspondance et résolution d'homonymes.
4. Retourner des aperçus exploitables par les outils sans envoyer le catalogue
   complet au modèle.

**Tests** : accents, espaces/tirets, basename, dossier, tag, statut, bornes et
ordre déterministe.

### Lot 3 — Mutations atomiques de collections

1. Introduire des endpoints sémantiques `collection/add`, `collection/remove`
   et `collection/delete`.
2. Relire l'état durable juste avant la mutation.
3. Valider les chemins contre le catalogue et écrire avec remplacement
   atomique.
4. Incrémenter une révision d'état distincte de la révision du catalogue.
5. Réhydrater la Galerie sans perdre sélection, scroll ou focus temporaire.

**Tests** : idempotence, requêtes concurrentes, collection inexistante, limite
1 000, état malformé, crash avant rename et conservation des autres champs.

### Lot 4 — Outils MCP partagés

1. Exposer `gallery_search`, `gallery_show`, `gallery_get_selection` et
   `gallery_collection_add`.
2. Détecter le projet actif sans demander au modèle d'inventer un port.
3. Enregistrer les outils dans les configurations réellement chargées par
   Claude et Codex; ajouter l'adaptateur Grok si son harnais l'autorise.
4. Garder les descriptions courtes, orientées action, avec schémas stricts.
5. Marquer lecture versus écriture afin que les permissions restent honnêtes.

**Tests** : mêmes entrées/sorties pour chaque provider, erreur serveur lisible,
annulation et résultat partiel.

### Lot 5 — UX conversationnelle

1. Afficher des cartes d'outil compactes : recherche, affichage, collection.
2. Nommer précisément le nombre de figures appliquées et absentes.
3. Offrir « Afficher dans la Galerie » après une recherche en lecture seule.
4. Demander confirmation uniquement pour les suppressions; l'ajout idempotent
   à une collection reste direct et annulable par une action inverse.
5. Rendre le focus chat visible comme une chip supprimable dans la Galerie.

### Lot 6 — E2E, robustesse et livraison

Scénarios obligatoires :

1. trois figures existantes sont affichées et sélectionnées;
2. deux existantes + une absente produisent un succès partiel honnête;
3. l'ajout répété à une collection reste sans doublon;
4. deux mutations rapprochées ne s'écrasent pas;
5. changer de projet pendant une commande annule le résultat périmé;
6. relancer l'app conserve la collection, mais pas le focus temporaire;
7. un message web externe, un mauvais nonce ou un chemin hors catalogue est
   refusé;
8. un vrai tour Claude et un vrai tour Codex pilotent la Galerie buildée.

## 6. Validation de chaque lot

Minimum obligatoire :

```bash
npx tsc --noEmit
npx vite build
(cd sidecar && npx vitest run)
(cd gallery && node server/tests/parity.mjs)
(cd gallery && node server/tests/diff_suite.mjs)
```

Puis protocole de kill, build Tauri, relance et contrôle de `tauri-app` décrit
dans `AGENTS.md`. Les lots touchant la commande visible ajoutent aussi un E2E
Playwright ciblé et une vérification dans l'app buildée.

## 7. Définition de DONE

- Les quatre outils fonctionnent dans un vrai tour Claude et Codex.
- Les commandes visibles sont accusées et n'agissent jamais sur un autre
  projet ou une iframe périmée.
- Les collections sont atomiques, idempotentes et durables.
- Le focus créé par le chat est visible, temporaire et supprimable.
- Les succès partiels et ambiguïtés sont rapportés honnêtement.
- Toutes les validations et le protocole de relance sont verts.
- Aucun état de Galerie n'est muté par simple interprétation du texte généré.

