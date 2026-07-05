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
