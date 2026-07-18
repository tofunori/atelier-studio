# Plan 050 : Panneau base de connaissances (surface atelier) + rangée unifiée + gbrain lecture/écriture

> **Instructions d'exécution** : suite directe du plan 049 (livré, validé).
> Design de référence : artefact « Atelier — Panneau base de connaissances »
> v3, validé par Thierry le 2026-07-17 (variante A trois étages + défauts
> proposés acceptés). Committer tôt et petit ; ne pas pusher sans demande.
> Toute nouvelle logique de store/extraction vit dans le CLI `atelier-kb`
> (une seule implémentation) ; les deux backends WS restent des relais minces
> (pattern kbAdd Rust du 049).

## Statut

- **Priority** : P1 — **Effort** : L (5 tranches) — **Risk** : MEDIUM
  (surface UI nouvelle ; écriture gbrain = garde-fous obligatoires)
- **Depends on** : plan 049 livré ; CLI gbrain 0.42 (`get/put/search/list`,
  résolution `~/.bun/bin` déjà en place côté Rust et Node)
- **Planned at** : 2026-07-17, worktree `atelier-knowledge-base`
- **Livré et validé (2026-07-17 soir)** : P1→P5 implémentés. Formats gbrain
  figés par sondes réelles : `search` = `[score] slug -- extrait` (« No
  results. » = vide), `get` slug absent = « Error [page_not_found] » **exit
  0** (détection d'existence), `put` sur stdin. Gates : sidecar 517, rust 62,
  front 66 fichiers (css-contract a refusé un 999px nu → token). **E2e vivant
  8/8 contre l'app relancée** : gbrainSearch réel, épinglage d'une page NAS
  (Aubry-Wake 2022, titre du front-matter plié), aperçu sans écriture,
  écriture confirmée `atelier/e2e-050-validation`, page relue dans le corpus
  (`from: atelier`), garde-fou exists=true au re-aperçu, soft-delete +
  dépinglage de nettoyage. Écart assumé : pas d'indicateur NAS dédié ni de
  squelettes — l'état voyage par les erreurs/états en place
  (gbrainResults.error, « Recherche dans le corpus… »). Restent aux yeux de
  Thierry : rendu visuel du panneau, du dialogue et des pilules unifiées.

## Décisions actées (design v3)

- **Rangée unifiée** : tout attachement du composer (citation, image, fichier,
  paste) = pilule fine unique ; la pilule KB agrégée garde sa teinte orange
  (persistant vs éphémère). Le zoom image reste (clic sur la pilule).
- **Panneau = surface atelier native** « connaissances » (union `Surface` +
  `SURFACES` + slot AtelierPane, icône livre+nœud distincte du `biblio`),
  variante **A trois étages** : Attachées à la conversation active /
  Bibliothèque / Pages gbrain. Zone d'ajout en tête (URL/YouTube/texte,
  Fichier, Dossier, Note) avec **destination « → base locale | → gbrain »**.
- **gbrain lecture** : recherche du corpus depuis le panneau, épinglage à la
  carte → kind `gbrain` (contenu via `gbrain get <slug>`, cache local,
  citable `[kb:id]`, re-sync manuel + à l'attache ; NAS coupé = cache sert).
- **gbrain écriture** : menu « → gbrain » à deux niveaux — Inbox (`capture`,
  défaut) / **Page directe** (`put`, slug proposé `atelier/<titre-kebab>`
  éditable, aperçu markdown avec front-matter `origin/date/from: atelier`,
  `get` préalable : slug existant → « mettre à jour ? », jamais d'écrasement
  silencieux).
- Le popover du composer est conservé tel quel + bouton « Ouvrir le panneau ».

## Architecture

### CLI (une seule implémentation, les backends relaient)

```
atelier-kb add --kind gbrain --origin <slug>       épingle une page (gbrain get)
atelier-kb gbrain-search --query <q> [--limit 12]  → { ok, results:[{slug, snippet?}] }
atelier-kb promote-page --id <id> [--slug s]       → { ok, slug, exists, preview }   (aperçu)
atelier-kb promote-page --id <id> --slug s --write → { ok, written, slug, updated }  (écriture)
```

- `gbrain` résolu comme dans kbPromote (PATH puis `~/.bun/bin` etc.) ;
  sortie non parseable ou binaire absent → erreur JSON claire, jamais de
  dégradation silencieuse. Timeout 20 s par appel NAS.
- kind `gbrain` : `meta { slug, syncedAt }` ; `ensureFresh` ne retouche PAS le
  NAS (re-sync = ré-épinglage explicite, déclenché aussi par l'attache depuis
  le panneau — id déterministe → mise à jour en place).
- `promote-page` compose le markdown depuis le cache (front-matter + texte
  complet), fait `get` d'abord (existence), n'écrit qu'avec `--write`.

### Routes WS (mjs + rs, relais du CLI)

```
gbrainSearch { query }                → gbrainResults { results } | kbError
kbPromotePage { id, slug?, write? }   → kbPagePreview { slug, exists, preview }
                                      | kbPageWritten { slug, updated } | kbError
```

`kbAdd` existant accepte déjà tout kind → `gbrain` passe sans nouvelle route.

### Front

- `surfaces.tsx` : + `"connaissances"` (icône livre+nœud) ; `AtelierPane` :
  slot lazy `KnowledgeSurface` ; App passe le binding thread actif
  (kbSourceIds/kbFullContent/onKbChange/threadTitle) à l'AtelierPane.
- `KnowledgeSurface.tsx` : réutilise `lib/kbSources` (store module partagé
  avec le picker — les deux surfaces restent synchrones par construction) ;
  trois étages repliables, recherche locale, section gbrain avec son champ de
  recherche NAS ; actions par rangée (100 %, → gbrain ▾, retirer/supprimer).
- `ContextShelf` : refonte pilules fines uniformes (`.context-pill`), zoom
  image conservé via Dialog, paste ouvre l'aperçu existant.
- Dialogue « Page directe » : Dialog shadcn (slug Input, aperçu `<pre>`,
  Annuler / Écrire ou Mettre à jour) — aucune écriture sans clic explicite.

## Tranches

- **P1 — Surface + étages 1-2** : union/SURFACES/slot/i18n, KnowledgeSurface
  (attachées + bibliothèque + zone d'ajout locale complète), binding App.
  *Accept.* : panneau ouvert du rail, attache/détache synchrone avec le
  picker, tsc + vite + css-contract verts.
- **P2 — Rangée unifiée** : ContextShelf en pilules fines, zoom conservé.
  *Accept.* : mélange citation+image+fichier+KB tient sur des pilules d'une
  hauteur ; tests front verts.
- **P3 — gbrain lecture** : CLI (`gbrain-search`, kind `gbrain`) + routes WS
  double backend + section Pages gbrain (recherche, épingler, badge sync,
  re-sync). *Accept.* : page réelle du NAS épinglée depuis le panneau, citée
  `[kb:id]` dans un send réel ; NAS coupé → cache sert, erreur propre à la
  recherche.
- **P4 — gbrain écriture** : CLI `promote-page` + routes + menu deux niveaux
  + dialogue. *Accept.* : page test écrite dans le corpus (slug `atelier/…`),
  re-write sur slug existant demande confirmation « mettre à jour ».
- **P5 — États & validation** : indicateur NAS (dernier résultat), squelettes,
  vitest sidecar + front + cargo, e2e vivant (panneau via WS), relance
  protocolaire, statut plan.

## STOP conditions

- Sortie `gbrain search`/`get`/`put` incompatible avec un parsing fiable →
  figer le format constaté dans ce plan avant de continuer.
- Toute écriture gbrain sans confirmation explicite de l'UI = interdit.
- `css-contract.test.ts` rouge = pas de contournement, corriger le design.

## Hors périmètre

Watcher NAS, diff riche avant « mettre à jour », multi-sélection de pages
gbrain en rafale, drag-drop OS (inchangé du 049), réorganisation des groupes.
