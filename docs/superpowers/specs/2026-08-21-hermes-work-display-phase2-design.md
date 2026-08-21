# Affichage du travail façon Hermes — phase 2 (analyse approfondie + design)

Date : 2026-08-21. Auteur : Claude (Fable), validé par Thierry.
Sources analysées : `nousresearch/hermes-agent` (MIT), `apps/desktop/src/` —
copies locales des fichiers étudiés dans le scratchpad de session
(`hermes/*.ts[x]`, 16 fichiers, ~2 600 lignes lues).

## 1. Ce que la phase 1 a déjà livré (commits 2ae74679, a26f073c, 92c53f27, 774cbaee)

- Runs réglés déposés en lignes durables dans l'ordre (progression pendant le tour).
- Cibles nommées pour les singletons nominaux / catégories comptées (`{n}`),
  recherches jamais nommées (requêtes ≠ noms).
- Ticker une-ligne du run vivant (reel complet, translation 1lh, 140 ms).
- Durée (`fmtToolDur`) + badge `exit N` par ligne d'outil.
- Ligne « en attente · Ns » après 2 s sans progrès dans le slot d'activité
  (`turnProgressSignature`).
- Bilan cumulatif du tour actif sous le chrono, dépliable (liste des appels).
- Pensée vivante repliable (« réfléchit… › ») + « tout afficher » quand la
  fenêtre de 4 lignes déborde.

## 2. Anatomie Hermes — mécanismes restants, avec leurs sources

### 2.1 `tool.generating` → verbe de rédaction (`store/tool-drafting.ts`, `status.tsx`)
Leur core émet un événement **avant** l'exécution, pendant que le modèle
streame le JSON des arguments : `{ name }` sans id ni args. Desktop le range
dans un store par-session et la ligne de statut affiche `toolPresentVerb(name)`
(« Editing », « Exploring ») **révélé après 200 ms** (`DRAFTING_REVEAL_MS`)
pour ne pas stroboscoper les appels rapides. Le timestamp d'origine est
conservé si le même nom est ré-annoncé (attente continue, pas de reset).
**Côté Atelier** : aucun provider n'émet cet événement aujourd'hui.
- Claude CLI stream-json : les `tool_use` arrivent en blocs complets ;
  le flag `--include-partial-messages` exposerait `content_block_start`
  (nom du tool dès le début du stream d'arguments) — à sonder.
- Codex : `item/started` arrive au début d'exécution (déjà mappé) — le trou
  de rédaction existe mais est plus court.
- OpenCode/Grok/Kimi ACP : `tool_call` arrive à l'exécution ; pas de signal amont.

### 2.2 « Every second belongs to something » (`status.tsx` TurnActivityIndicator)
Un SEUL indicateur de queue, actif quand : le tour travaille (`busy` du
composer, pas le `running` du message — il tombe faux dans les interstices)
ET pas d'attente utilisateur (question/approbation) ET aucun outil en vol ne
narre déjà l'attente ET (un hint nommé existe OU silence ≥ 2 s). Le chrono
compte depuis le **dernier progrès visible** (`activitySignature` : nb de
parts, longueur du texte, nb d'outils réglés — les résultats MUTENT les parts,
d'où le compteur dédié), pas depuis le montage du composant.
**Côté Atelier** : notre ligne d'attente ne vit que dans la branche ticker
(état `activity`). Les états `thinking` muets (Claude headless caviarde le
raisonnement) et les interstices sans état restent non chronométrés.

### 2.3 Horodatage des lignes (`timeline-timestamp.tsx`)
Chaque run/ligne porte `début → fin` en 0.625rem tabular-nums, **gaté par un
réglage d'affichage** (`display.timestamps`, défaut off — « display-only, so
toggling never touches model context »), tooltip à la milliseconde.
**Côté Atelier** : nos events portent `ts` ; les groupes ont premier/dernier ts.
Aucun affichage aujourd'hui (sauf heure des bulles user/texte).

### 2.4 Carte « N files changed » (`changed-files-card.tsx`)
À la fin du tour : un panneau (classe partagée `WIDGET_SHELL_CLASS`) — une
ligne par fichier modifié avec `+N/−M`, clic ligne → diff du fichier, action
« Review » → volet diff global. Hauteur bornée à ~5 lignes avec fade-scroll
(« one card, not a wall »).
**Côté Atelier** : `done.filesChanged: string[]` (chemins seuls) +
`checkpoint.snapshotSha` ; les events `edit` portent `files[{path, add, del}]`.
`DoneDiffToggle` ouvre déjà le diff global (AtelierDiffView) — il manque le
détail par fichier et le clic ciblé. En production `add`/`del` sont souvent
`null` (les providers envoient des chemins nus) : les compteurs `+N/−M` ne
s'affichent que quand le provider les fournit réellement ; un numstat côté
backend est un suivi recommandé pour les rendre systématiques.

### 2.5 Préférence « pensée repliée par défaut » (`store/reasoning-disclosure.ts`)
Booléen localStorage (`hermes.desktop.reasoning.collapsedByDefault`), réglage
purement desktop (jamais dans la config backend). Le live reste visible par
défaut ; l'utilisateur qui préfère le calme replie tout d'un coup.

### 2.6 provider-wait (`store/provider-wait.ts`)
Les trames « ⏳ waiting on… / ↻ reconnect » du core remontent telles quelles
dans la ligne de statut (filtre regex strict, le reste = bruit). Équivalent
Atelier : nos events `note`. Non retenu pour la phase 2 (YAGNI — nos notes
sont déjà affichées).

## 3. Décisions de design (Atelier, système sobre)

| # | Adoption | Décision |
|---|----------|----------|
| A | Préférence pensée repliée | Réglage `Settings.thinkingCollapsed` (localStorage via `loadSettings`), toggle dans Réglages → Chat. `LiveThinking` et `ThinkingBlock` l'utilisent comme état initial ; le clic manuel garde la main (comportement actuel). |
| B | Attente universelle | Déplacer la logique quiet du ticker vers le TAIL entier : un composant `QuietWait` monté dans `ActiveTurnTail`, visible quand `workingSince` actif, pas d'outil running, pas de permission en attente, et signature stable ≥ 2 s. Libellé existant `chat.quiet-wait`. Le ticker garde sa ligne quand l'état est `activity` (pas de double narration : `QuietWait` s'efface alors). |
| C | Horodatage | Réglage `Settings.displayTimestamps` (défaut **false**). Quand actif : `HH:MM → HH:MM` (tabular-nums, `--fs-xs`, `--muted2`) à droite des lignes durables de groupes (`ActivityGroup`) ; tooltip précis à la seconde. Jamais sur le ticker (vivant). Le fold (« A travaillé pendant… ») ne reçoit PAS d'horodatage — il porte déjà la durée ; les stamps ne vont qu'aux groupes. |
| D | Carte fichiers modifiés | `ChangedFilesCard` rendue par la ligne `done` du DERNIER tour : agrège les `edit.files` du tour (cumul add/del par path, `done.filesChanged` en secours pour les chemins sans event edit). Ligne = icône type + nom + `+N −M` ; clic → `DoneDiffToggle`-équivalent ciblé (ouvre le diff global existant — le diff par fichier viendra si le besoin se confirme). Max ~5 lignes, scroll interne. |
| E | Drafting | SPIKE d'abord (probe `--include-partial-messages` sur claude CLI + mesure du trou réel item/started sur Codex). Implémentation seulement si le probe montre un signal exploitable ; sinon on documente le renoncement. |

Contraintes générales : tokens du système (gris 4 niveaux, fs 10-15, rayons
6/10, motion 120-150 ms), `RowButton` pour tout élément cliquable,
`css-contract.test.ts` doit rester vert, i18n fr+en pour toute chaîne.

## 4. Hors périmètre (assumé)

- Barre de statut Hermes (jauge contexte, éléments configurables) — Atelier a
  sa propre approche usage/contexte.
- Cartes de délégation riches (flux sous-agents relayé) — l'équivalent Codex
  `agentActivity` existe ; à revisiter quand Thierry utilisera des sous-agents.
- provider-wait passthrough (§2.6).
