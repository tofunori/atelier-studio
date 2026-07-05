# Brief Sprint 1 — Codex

Contexte : app Tauri 2 (React front `src/`, sidecar Node `sidecar/`, Rust `src-tauri/`).
Lire `docs/ROADMAP_V1.md` pour la vision. Conventions : style sobre, pas d'emojis
colorés, icônes SVG trait fin, commits fréquents en français, `npx tsc --noEmit`
et `cd sidecar && npx vitest run` doivent passer avant chaque commit.

## Tâches (dans cet ordre)

### 1. Token de session (sécurité)
- `src-tauri/src/sidecar.rs` : générer un token aléatoire (uuid/hex 32) au spawn,
  le passer au sidecar via env `ATELIER_TOKEN`, le retourner au front avec le port
  (commande `sidecar_port` → `{ port, token }`).
- `sidecar/index.mjs` : rejeter toute connexion WS sans `?token=<...>` correct et
  toute requête HTTP sans header `x-atelier-token` correct (sauf si env absente = dev).
- Front (`src/App.tsx`, `src/main.tsx`) : propager le token (WS URL + fetch /uistate).

### 2. Erreurs visibles
- Nouveau composant `src/components/Banner.tsx` : bandeau discret en haut du chat
  (fond card, bord accent, texte + action optionnelle).
- Cas à couvrir : WS sidecar déconnecté (« reconnexion… ») ; erreur provider dans
  un done (kind:"done", ok:false → si le texte contient "login"/"auth"/"credentials",
  afficher « Lance `codex login` (ou `claude login`) dans le Terminal ») ;
  échec `start_atelier` (afficher l'erreur Rust + lien Réglages).

### 3. Écritures atomiques + nettoyage processus
- `sidecar/store.mjs` + écriture ui.json : write tmp puis rename.
- `sidecar/index.mjs` : PID-file `~/Library/Application Support/atelier-studio/sidecar.pid` ;
  au boot, si un ancien PID vit encore, le tuer ; au SIGTERM/exit, tuer tous les PTY.

### 4. Titres de threads intelligents
- `sidecar/router.mjs` : au premier `done` d'un thread dont le titre est encore le
  prompt brut tronqué, appeler le provider claude en one-shot (modèle haiku,
  `claude -p` via le SDK, maxTurns 1) : « Donne un titre de 3-6 mots pour cette
  conversation : <premier message> » → `store.upsert({title})` + broadcast threads.
- Sidebar : renommage au double-clic sur un thread (input inline, Enter valide).

### 5. Outils repliés en groupe
- `src/components/Chat.tsx` : quand ≥4 événements `kind:"tool"` consécutifs,
  les remplacer par une ligne « ▸ N outils utilisés » dépliable (état local).

## Interdits
- Ne pas toucher à `cmux-gallery` (autre repo), ni aux providers au-delà du besoin.
- Ne pas reformater des fichiers entiers ; diffs minimaux.
- Ne pas casser le mode dev (token absent = accepter, avec warning console).
