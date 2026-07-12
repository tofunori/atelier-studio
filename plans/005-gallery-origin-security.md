# Plan 005: Fermer l'accès navigateur inter-origines à la galerie locale

> **Executor instructions**: charger `/efficient-fable`. Lire `AGENTS.md`,
> `CLAUDE.md`, `gallery/AGENTS.md`. Ne pas modifier les assets éditeur ni le
> bundle généré. L'objectif est une frontière HTTP vérifiable.
>
> **Drift check**: `git diff --stat 8a5d0ca..HEAD -- gallery/server/main.mjs gallery/server/shared.mjs gallery/server/routes/core.mjs gallery/server/tests/parity.mjs`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 004
- **Category**: security
- **Planned at**: commit `8a5d0ca`, 2026-07-09

## Why this matters

La galerie écoute sur loopback mais répond avec `Access-Control-Allow-Origin: *`
sur JSON, fichiers et `/raw`. Une page web peut donc demander au serveur local
de lire des fichiers du projet et recevoir la réponse. `/pdfannot` est en plus
exempté du contrôle d'origine POST. Le fix doit fermer ce scénario sans casser
viewers ni probes Rust sans `Origin`.

## Current state

- `gallery/server/shared.mjs:154-161`: `sendJson` ajoute CORS `*`.
- `gallery/server/shared.mjs:201-215`: `serveFile` ajoute CORS `*`.
- `gallery/server/main.mjs:102-108`, `148-155`: vidéo/HEAD ajoutent CORS `*`.
- `gallery/server/routes/core.mjs:148-157`: `/raw` lit un fichier confiné et
  ajoute CORS `*`; `/data` fait de même vers 118-125.
- `gallery/server/main.mjs:165-182`: GET ouverts; POST contrôlés sauf pdfannot.
- `gallery/server/shared.mjs:252-260`: `localOnly` accepte tout localhost/port.

## Security invariant

1. Aucun `Access-Control-Allow-Origin: *`.
2. Sans `Origin`, requête permise pour probes/navigation directe.
3. Avec `Origin`: protocole HTTP, host loopback et port égal à
   `req.socket.localPort`.
4. Garde avant routage pour GET, HEAD, POST et OPTIONS, y compris pdfannot.
5. Origine externe/autre port → 403 sans données ni mutation.

## Scope

**In scope**: `gallery/server/shared.mjs`, `gallery/server/main.mjs`,
`gallery/server/routes/core.mjs`, `gallery/server/tests/parity.mjs`.

**Out of scope**: serveur Python, token URL, assets, bundle généré, format métier.

## Steps

### 1. Rendre `localOnly` strict et testable

Le helper doit parser sans exception, exiger `http:`, limiter le hostname à
loopback, comparer au port local réel et refuser `null`, URL invalide, domaine
externe ou autre port. Ne pas faire confiance au seul header Host.

### 2. Poser le garde au début de `route`

Avant OPTIONS: si origine refusée, 403 `{error:"cross-origin blocked"}`. OPTIONS
autorisé répond sans CORS permissif. Supprimer exception pdfannot et garde POST
redondant.

### 3. Supprimer les wildcards

Retirer les headers de sendJson, serveFile, serveVideo, HEAD, raw, data et tout
match trouvé:

```bash
rg -n 'Access-Control-Allow-Origin|access-control-allow-origin' gallery/server
```

Expected: aucune occurrence wildcard; ne pas ajouter Credentials.

### 4. Ajouter tests de sécurité au harness

Faire accepter des headers à `requestOnce`. Tester:

- GET raw + Origin externe → 403, corps sans contenu fichier;
- GET raw + origine même port → 200;
- GET state + autre port → 403;
- POST pdfannot externe → 403, annotations inchangées;
- POST state externe → 403, état inchangé;
- GET normal sans Origin → 200, aucun ACAO wildcard;
- health sans Origin → 200.

### 5. Gates et smoke

```bash
(cd gallery && node server/tests/parity.mjs)
node gallery/server/tests/diff_suite.mjs
python3 -m unittest discover -s gallery/tests -v
npx tsc --noEmit
npx vite build
(cd sidecar && npx vitest run)
```

Puis protocole Tauri. Dans l'app buildée, ouvrir galerie/PDF/markdown/LaTeX/Board,
sauver annotation; depuis une page externe, fetch raw/pdfannot doit échouer/403.
Ne jamais publier le contenu d'un fichier sensible dans le rapport.

## Done criteria

- [ ] Aucun CORS wildcard serveur Node.
- [ ] Toutes méthodes bloquées pour origine non identique.
- [ ] pdfannot non exempté.
- [ ] Probes sans Origin compatibles.
- [ ] Tests prouvent 403 et absence de mutation.
- [ ] Viewers fonctionnent dans l'app buildée.

## STOP conditions

- Un viewer exige réellement une origine différente.
- Fix nécessite bundles minifiés assets.
- Validation repose sur Host seul.
- Une route GET a un effet de bord: STOP et plan séparé.

## Maintenance notes

Si galerie sort de loopback, exiger auth + TLS. Un token par instance reste une
défense ultérieure après abstraction URL commune.
