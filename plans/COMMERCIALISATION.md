# Atelier — plan d'amélioration vers un produit commercialisable

Audit du 2026-08-15, commit `49c52384`. Quatre auditeurs parallèles
(portabilité, distribution, langue/échecs silencieux, sécurité), 43 findings,
chaque citation clé re-vérifiée contre le code. Constat d'ensemble : **le
produit est bon et le socle est sain** (zéro secret committé, argv partout,
clés API en 0600, sandbox de chemin bien construit, i18n complète côté app) —
ce qui manque n'est pas du polissage visuel mais quatre propriétés de produit :
*tourner ailleurs*, *échouer utilement*, *se distribuer proprement*, *parler
une langue*.

Vendre l'app suppose aussi UNE décision produit qui ne relève pas de l'audit :
**vendre Atelier entier** (chat multi-agents + atelier — large, coûteux à
supporter) **ou l'éditeur scientifique seul** (LaTeX + vue Lecture, créneau
vide vérifié par la recherche du 2026-08-15, pitch d'une ligne). Le plan
ci-dessous est valable dans les deux cas ; la phase 5 (langue) et l'ampleur du
support changent d'échelle selon la réponse.

---

## Phase 0 — Cette semaine (tout est S, la release publique ment)

| Finding | Quoi | Plan |
|---|---|---|
| DIST-03 | La release v1.4.0 publie les notes de la v1.3.6 (bloc littéral dans release.yml) | **064** |
| DIST-09 | Renommer `com.tofunori.tauri-app` → `com.tofunori.atelier` — MAINTENANT, avant toute signature (TCC/updater sont indexés dessus) | **064** |
| DIST-08 | README : badge 1.3.6, DMG introuvable, prérequis CLI absents | **064** |
| DIST-10 | Épingler `fix-path-env` (dépendance git sans rev sur le chemin de release) | **064** |

## Phase 1 — Sécurité et confiance (ce qu'un acheteur regarde en premier)

| Finding | Quoi | Plan |
|---|---|---|
| SEC-01/02 | Gateway distant et listener mobile sur `0.0.0.0` (Host header ≠ frontière) → binder l'IP Tailscale | **062** |
| SEC-03 | Jeton admin en clair dans `gateway.log` (fichier non-0600, remonté dans l'UI) + rotation | **062** |
| SEC-08 | Jeton galerie : repli silencieux vers 32 octets de zéros + jeton en query string | **062** |
| SEC-05 | `bypassPermissions` par défaut d'usine (backend ajoute `--dangerously-skip-permissions` sur requête nue) → `acceptEdits` | **063** |
| SEC-06 | `/open-path` lance `.app`/`.command` du projet → allowlist d'extensions | **063** |
| SEC-07 | Nom de fichier `-…` = injection d'options latexmk → préfixe `./` | **063** |
| SEC-11 | 2 high npm desktop, 8 high mobile (correctifs dispo) + `cargo audit` absent du pipeline | à planifier (S) |
| SEC-04 | Token mobile en clair sur disque, doc-comments mensongers → **exécuter le plan 042 existant** + révoquer les tokens émis | plan 042 |
| SEC-09 | Permission Tauri `opener` en `path:"**"` → scopes réels | à planifier (M) |
| SEC-10 | `/regenerate` exécute la commande déclarée par le projet → confirmation UI + ADR frontière de confiance | à planifier (S) |

## Phase 2 — Tourner ailleurs que chez le développeur

| Finding | Quoi | Plan |
|---|---|---|
| PORTA-01/02 | Le backend Rust ignore le Node embarqué ; wrappers `atelier-kb`/`atelier-zotero-passages` nus → KB morte sur Mac vierge | **061** |
| PORTA-04 | Doc de distribution redevient vraie une fois 061 fait | **061** |
| PORTA-05/13/12 | Sonde d'environnement dans Réglages (TeX, pdftotext, Node, CLT, Zotero) + re-probe des providers sans redémarrage | **060** |
| PORTA-03 | `pdftotext` (poppler) : dépendance dure non documentée de 3 fonctionnalités → sonde + hint + README | **060** |
| PORTA-06 | « échec — voir la console » quand MacTeX manque → `reason: toolchain-missing` remonté en pastille | **060** |
| PORTA-07 | `~/Zotero` en dur ×3 + erreur `zotero-introuvable` non traduite → réglage dossier Zotero | à planifier (M) |
| PORTA-08 | Infra personnelle par défaut (`ssh nas`, `/volume1/...`, gbrain) → intégrations optionnelles, masquées si non configurées | à planifier (M) |
| PORTA-09 | Chemins `~/Documents/atelier-studio/rust/target/...` dans les résolveurs release → `cfg!(debug_assertions)` | à planifier (S) |
| PORTA-10 | Garde arm64/macOS 12.3 au démarrage + `minimumSystemVersion` | à planifier (S) |
| PORTA-11 | 17 Mo de binaires committés dans `rust-server-dist` + staging qui recycle sans contrôle de fraîcheur | à planifier (S, vérifier CI) |
| PORTA-14 | Serveur galerie Node/Python fossile empaqueté jamais exécuté → contrat de soak puis retrait | à planifier (M, décision) |

## Phase 3 — Échouer utilement (supportabilité)

| Finding | Quoi | Plan |
|---|---|---|
| SILENT-09 | AUCUN canal de diagnostic : stderr sidecar → tampon 12 Ko jamais écrit, stdout fermé après 1 ligne, pas de tracing → log fichier + bouton « Exporter le diagnostic » (rédaction incluse) | **059** |
| SILENT-01 | Annotations sauvées en fire-and-forget — l'UI confirme sans vérifier `response.ok` (perte de travail) | à planifier (S, groupe 3a) |
| SILENT-03 | Automatisations : fichier corrompu → `[]` puis écrasement définitif ; exécution échouée sans trace | groupe 3a |
| SILENT-02/04/05/06/07/08/10 | `/uistate` répond ok sur échec disque ; KB ignorée sans signal ; modèle/effort non persistés ; export surlignés muet ; bascules auto qui perdent l'état serveur ; jeton galerie null inexpliqué ; onglets épinglés perdus | groupe 3a (tous S) |

Le groupe 3a se planifie APRÈS 059 (sinon les erreurs remplies n'ont nulle part
où s'écrire). Deux contre-modèles internes à imiter, identifiés par l'audit :
`document_session.ts:72-90` (conflit remonté proprement) et
`gallery_template.html:1608-1613` (échec Add to chat visible).

## Phase 4 — Distribution signée

Ordre contractuel, chaque étape dépend de la précédente :

1. **064** (identifiant renommé — fait en phase 0) ;
2. DIST-01/02 — certificat Developer ID + entitlements (JIT pour Node embarqué,
   `disable-library-validation` pour node-pty — décision à documenter),
   signature récursive des 6 arbres de ressources, notarisation, `spctl` en CI
   → à planifier (M, HIGH risk, cycles CI lents) ;
3. DIST-04 — `tauri-plugin-updater` + cible updater + `latest.json` (clé privée
   = secret de long terme) → à planifier (M) ;
4. DIST-05/06 — LICENSE racine + EULA + `THIRD_PARTY_NOTICES.md` (KaTeX,
   CodeMirror, jsdiff redistribués sans bannière ; décider du statut du MIT de
   `gallery/`) → à planifier (S + avis juridique avant première vente) ;
5. DIST-07 — onboarding premier lancement : le backend `setupStatus` sait déjà
   tout (renforcé par 060), il manque la carte de vérification au boot et un
   `ChatEmptyState` qui dit « Terminer la configuration » quand aucun provider
   n'est prêt → à planifier (M — la roadmap interne le listait déjà en P1).

## Phase 5 — Une seule langue visible

| Finding | Quoi |
|---|---|
| LANG-05 | Le canal existe (postMessage `atelier-theme` + hash nonce) — ajouter `lang`, ~40 lignes. C'est la décision d'architecture qui débloque tout |
| LANG-02/03 | Les mélanges les plus visibles : widget d'état du studio (« compiling… » puis « compilation : serveur injoignable ») et pilule de sélection (« Add to chat » / « Envoyer vers ») |
| LANG-01/04 | Extraction : ~65 chaînes EN de la barre React, ~76 attributs du template legacy (dont un prompt FR injecté dans les messages agent — bug produit) |
| LANG-06/07 | Attributs `lang` des iframes faux ; 27 aria-labels en dur dans src/ |
| LANG-08 | Politique écrite (CLAUDE.md + garde CI) sinon la dérive se reconstitue |

À séquencer après la décision produit : si l'audience visée est anglophone,
extraire vers l'ANGLAIS et faire du français la locale — même travail, cible
inverse.

---

## Phase 6 — Retrait de Node (chantier 1.x, après la v1 signée)

Décision 2026-08-15 : cible Rust seul au runtime. Le terminal est déjà Rust
(portable-pty) ; il ne reste que la chaîne KB (~2 500 lignes de .mjs derrière
`kb_cli.mjs`/`kb_prompt.mjs`). Gains : −108 Mo de bundle, entitlements de
notarisation simplifiés (plus de JIT), surface CVE npm runtime à zéro, fin de
la taxe « porter en double ». Quatre phases livrables séparément — voir
**plan 065** : A) acter le soak 047 et retirer le sidecar chat ; B) contrat de
soak galerie puis retrait Node/Python (PORTA-14) ; C) port KB en crate Rust
derrière des fixtures de parité gelées AVANT le code ; D) retrait du
node-runtime du bundle et allègement des entitlements. Ne bloque PAS la
signature v1 — c'est le premier grand chantier d'après-vente.

## Ce que l'audit a vérifié comme SAIN (à dire à un acheteur)

- Aucun secret committé (balayage complet des fichiers suivis).
- Modèle d'exécution : argv strict partout, jamais de shell interpolé ;
  credentials retirés de l'env des sous-processus agents.
- Clés API providers : fichier 0600 hors dépôt, jamais renvoyées à l'UI
  (test verrouillé).
- Traversée de chemin : canonicalisation + comparaison par composants,
  garde d'origine en amont du routage.
- Stockage des jetons du gateway : SHA-256 au repos.
- Dégradation MinerU : le modèle de « dégradation annoncée » à généraliser.

## Suivi

Index et statuts : `plans/README.md`, section « Audit commercialisable
2026-08-15 ». Plans exécuteurs écrits : **059** (diagnostic), **060** (sonde
environnement), **061** (Node embarqué), **062** (surface réseau), **063**
(défauts de permission), **064** (pré-signature). Les items « à planifier »
ont leurs findings complets dans les rapports d'audit et se planifient à la
demande (`/improve plan <slug>`).
