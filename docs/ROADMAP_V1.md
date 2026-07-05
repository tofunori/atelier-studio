# Roadmap — de la beta v0.1.0 à une v1 solide

> État au 2026-07-05. Beta buildée et fonctionnelle (chat Claude/Codex, galerie,
> browser natif, terminal, thèmes, goals, reprise de sessions). Ce document liste
> ce qui reste, par priorité.

## P0 — Fiabilité (avant d'inviter quiconque)

- [ ] **Erreurs visibles** : bannière UI par point de défaillance, avec action —
  sidecar mort (« redémarrage… »), CLI claude/codex absent ou non connecté
  (« lance `codex login` »), galerie introuvable (lien vers Réglages),
  `start_atelier`/python3 en échec. Fin des pannes silencieuses.
- [ ] **Token de session WS/HTTP** : le sidecar accepte aujourd'hui toute connexion
  locale (CORS *). N'importe quelle page web du navigateur peut piloter les agents.
  Rust génère un token, le passe au front et au sidecar, exigé à la connexion.
- [ ] **Écritures atomiques** : `threads.json` / `ui.json` via tmp+rename ;
  gérer deux instances simultanées (dev + buildée) — idéalement un sidecar unique
  partagé (lockfile + port publié).
- [ ] **Cycle de vie des enfants** : PID-file et nettoyage des serveurs galerie
  Python et PTY orphelins au boot/quit (des processus survivent aux ⌘Q).
- [ ] **Logs persistants** : sidecar + Rust vers `~/Library/Logs/atelier-studio/`
  avec rotation, et un bouton « Ouvrir les logs » dans Réglages.

## P1 — Qualité / itération

- [ ] **Tests** : router (send/steer/queue/revert/fork/import), parser de rollouts
  Codex (format externe fragile), smoke E2E sidecar (WS + message mock).
- [ ] **CI sur push** : vitest + tsc + cargo test à chaque push (pas juste au tag).
- [ ] **Auto-update** : tauri-plugin-updater branché sur les releases GitHub
  (la CI signe déjà `Atelier.app.tar.gz.sig`).
- [ ] **Code-splitting** du bundle JS (869 kB) : lazy-load Settings, Terminal,
  éditeurs.
- [ ] **Onboarding premier lancement** : écran de vérification (claude ✓/✗,
  codex ✓/✗, node ✓, galerie ✓/chemin), au lieu d'un chat muet.

## P2 — Fonctions reportées

- [ ] Confirmations restantes : position webview Browser, frappe terminal (fixes
  déployés, jamais confirmés).
- [ ] Surface Diff/Git (état du repo projet, diff des modifs d'agents, commit).
- [ ] Thème propagé aux viewers latex/pdf (galerie principale déjà faite).
- [ ] Graver les annotations PDF dans le fichier (pypdf) en plus du JSON.
- [ ] Steer Codex quand le SDK l'exposera ; goals Codex (SQLite `thread_goals`).
- [ ] « Importer une session CLI » → déjà fait (⤓) ; ajouter recherche/filtre.
- [ ] Icône d'app custom + capture dans le README.

## UI — améliorations recommandées

**Sidebar**
- Titres de threads : tronqués bruts (« /Users/tofunori/Docume… », « /recherche
  peux tu cherc… ») → titre intelligent (généré par le modèle après le 1er tour,
  comme Claude Code) ; renommage manuel au double-clic.
- Doublons visuels (« allo » ×4) : horodatage relatif discret (« il y a 2 h »)
  sous le titre pour les distinguer.
- Actions au survol (⭐ favori, ✕ supprimer) au lieu du seul clic droit.

**Chat**
- Blocs de code : bouton copier + nom de langage, coloration syntaxique.
- Lignes d'outils (« ▸ Read… ») repliables en groupe quand il y en a >5 d'affilée
  (façon Claude Code « 12 outils utilisés »).
- Indicateur de frappe/streaming plus vivant que le spinner seul.
- État vide : « Salut ! Comment je peux t'aider ? » → carte d'accueil avec
  3 actions (nouveau chat, reprendre ⤓, ouvrir un projet) + raccourcis clavier.

**Composer**
- « ✳ Modèle par défaut auto » : trop verbeux — afficher juste le nom court du
  modèle (« Fable 5 · low »).
- Pilule permission : « Full access » orange criard → ton plus discret sauf en
  mode plan (là l'accent se justifie).

**Atelier**
- Skeleton/spinner pendant le boot de la galerie (2-4 s de vide aujourd'hui).
- Débordement des onglets : scroll horizontal ou menu « +N » quand trop d'onglets.
- ⌘K : palette de commandes globale (ouvrir fichier du projet, changer de thread,
  actions) — gros gain d'usage.

**Général**
- Raccourcis affichés dans les tooltips (⌘0/1/2, ⌘K…).
- Densité : le mode compact existe dans Réglages — l'exposer aussi via le menu View.

## Axe produit — « recherche reproductible » (revue GPT-5.5 Pro, tri 2026-07-05)

Colonne vertébrale retenue, dans l'ordre (après le lot UI) :

1. **Run Ledger** — chaque tour d'agent = entrée d'expérience : prompt, provider/modèle,
   coût, fichiers modifiés (file_change), commandes, figures générées, résultat.
   Version automatisée du guardrail « Source Map manuscrit ».
2. **Surface Git** (déjà P1) — état, diff review, snapshot avant chaque tour ; nourrit №4.
3. **Figure Lab** — comparaison avant/après des figures régénérées (slider, overlay),
   « demander pourquoi la courbe a changé », « garder cette version ».
4. **Reproduce this result** — depuis une figure/réponse : retrouver script, données,
   commit, prompt, commandes ; verdict reproduction OK/différente/impossible.

Deuxième vague : Context Cart (poids tokens + packs par projet), Review par l'autre
agent (bouton sur le handoff existant), Lab Notebook (dérivé du ledger),
Secret/PII Guard (scan local dans submit()), badge trusted/untrusted sur contenu web.

Écartés volontairement (trop plateforme vs thèse) : MCP Hub visuel, Playbook Builder,
Permission Simulator (couvert par canUseTool + permissions par projet).

## Intégration galerie (décision 2026-07-05 : détachement complet de cmux-gallery)

- [ ] **P1 — Phase 1 : vendoriser** : copier la galerie DANS ce repo (`gallery/`),
  bundlée au build ; tailler le code pour Studio (retirer mode cmux/muxy/orca,
  statusline, push externes). Le repo cmux-gallery vit sa vie séparément —
  divergence assumée, les améliorations ne circulent plus.
- [ ] **P2 — Phase 2 : porter le serveur Python → sidecar Node, route par route**
  (scan/index, /thumb via sips/rsvg, /pdfannot, /embed, /zotero, compile latexmk).
  Les viewers (latex_studio, pdf_viewer, md_studio, annot_kit) restent du HTML/JS
  statique servi tel quel. Quand la dernière route tombe, Python disparaît des
  prérequis.
- [ ] **P1 — Doctor** (déjà listé) : détecte aussi python3 (plus garanti sans CLT)
  et propose le chemin galerie.
- **Écarté DÉFINITIVEMENT — réécriture React de l'existant** : thème/IPC/Add to chat
  déjà intégrés ; viewers = acquis éprouvés. Règle : le NEUF (ex. Figure Lab) peut
  naître en React ; le vieux ne se réécrit pas.
- **Écarté — migration Rust du backend galerie** : sur-ingénierie mono-utilisateur.
  Si la dépendance Python bloque un jour la distribution : binaire PyInstaller
  bien avant une réécriture.

## Bascule quotidienne (objectif 2026-07-05)

Atelier devient l'environnement quotidien de Thierry. Protocole :
- Point d'entrée unique dès maintenant ; cmux = filet de secours seulement.
- Chaque friction rencontrée = item de backlog (petits travaux, pipeline Codex+revue).
- [x] **Pont « ma sélection »** : DÉJÀ FONCTIONNEL en Studio (vérifié 2026-07-05) —
  tous les viewers poussent /selinfo → `~/.claude/fig-selection.json` ; l'isolation
  Studio ne coupe que les push de sessions et la statusline. Les sessions CLI dans
  le terminal d'Atelier ont donc déjà le réflexe « ma sélection ».
- Déclencheur de la vendorisation (phase 1 galerie) : une semaine sans ouvrir cmux.

## Distribution & providers (2026-07-05)

- [ ] **P1 — Node embarqué** : binaire node en sidecar Tauri (~40 Mo) — dernière
  dépendance runtime après la vendorisation galerie. Auth claude/codex = irréductible.
- [ ] **P2 — Providers via endpoints compatibles Anthropic** : profils DeepSeek /
  GLM (z.ai) via ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN par thread → même harnais
  agentique (outils, fichiers, terminal). Clés API dans Réglages. Équivalent Codex :
  model_providers en config.
- [ ] P2 — binaires SDK ré-embarqués (option "lourde" +460 Mo) si distribution large.

## PLAN D'EXÉCUTION CONSOLIDÉ (2026-07-05) — ordre de travail

Pipeline standard : brief → Codex implémente → revue Claude → push → test Thierry.

| # | Chantier | Contenu | Taille |
|---|----------|---------|--------|
| 0 | **Git + Run Ledger** (EN COURS chez Codex) | module git, snapshot avant chaque tour, undo, surface Git, ledger JSONL, vue Journal | L |
| 1 | **Bibliothèque Zotero (option B complète)** | routes router (zotero déjà prêt), surface split réfs/lecteur, favoris ⭐, panneau Notes, Citer dans le chat | L |
| 2 | **Langue FR/EN** | extraction t() ~150 chaînes, réglage Langue, events sidecar en codes | M |
| 3 | **Split drag façon cmux** | drag pilule → zones surbrillance → 2 panes max, presets par écran (Simple/Duo/Lecture) | M-L |
| 4 | **Vendorisation galerie (phase 1)** | déclencheur : 1 semaine sans cmux ; copie dans le repo + taille Studio-only | M |
| 5 | **Distribution v0.2** | node embarqué, Doctor, auto-update, release | M |
| 6 | **Run Ledger suite** : Figure Lab (avant/après) puis Reproduce | React neuf autorisé ici | L |
| 7 | **Providers DeepSeek/GLM** (endpoints Anthropic-compat) | profils + clés en Réglages | M |
| 8 | **Portage serveur galerie → Node (phase 2)** | route par route, Python disparaît | L étalé |

En continu : frictions de la bascule quotidienne = petits items intercalés en tête de file.
Friction #1 (2026-07-05) — **passe typographique du chat** : rythme vertical délibéré
(paragraphes/listes/titres), titres échelle chat (## ≈ 15px semibold), texte courant
~680px (~70 car.), tableaux (bordures fines, tabular-nums, scroll-x), code inline pilule,
liens accent désaturé, blockquote filet fin, réponses agent sans fond (texte nu).
À faire dès que le repo est libre (touche Chat.tsx — conflit avec chantier #0 en cours).
Refactor App.tsx en hooks : à glisser dans le chantier qui le touche le plus (probablement #3).

## Auto-review (inspiré du Reviewer de Claude Science, ajouté 2026-07-05)

Automatisation du guardrail « vérificateur indépendant » de Thierry. Le Run Ledger
est le record d'exécution ; le reviewer vérifie les claims de la réponse contre lui.
- Réglages → Agents : toggle Auto-review (global + par projet), agent du reviewer
  = provider+modèle+effort au choix — **défaut : GPT-5.5 · high (Codex)**, choix de
  Thierry : le reviewer doit être un agent FORT et d'une autre famille que l'exécutant
  (vraie indépendance cross-provider) ; déclencheur (chaque réponse / runs modifiant
  des fichiers / manuel).
- Après un done éligible : run one-shot INDÉPENDANT (session séparée ; voit la
  réponse, l'entrée ledger, les diffs) → verdict structuré.
- Chat : badge discret ✓ vérifié / ⚠ n incohérences (cliquable → détails +
  « demander la correction ») ; bouton Vérifier au survol de toute réponse.
- Plus tard : critères custom par projet (règles MIXED_MODELS pour la thèse).
Chantier suivant après ⌘K — Codex : plomberie sidecar/settings ; Claude : prompt
du reviewer + badge.
