# ADR-002 — Runtime UI iOS : Tauri 2 + React, frontières Swift

- **Statut** : Proposé (jalon A plan 034) — en attente de GO Codex
- **Date** : 2026-07-12
- **Commit baseline** : `0fbfc7a`

## Contexte

Le desktop Atelier est une app **Tauri 2 + React** (macOS). Le chat, les tokens
visuels Precision Native, le reducer harnais et une partie des composants
`src/components/chat/` sont déjà en TypeScript.

L’état iOS réel au commit `0fbfc7a` :

| Élément | Réalité |
|---------|---------|
| `#[cfg_attr(mobile, tauri::mobile_entry_point)]` | Présent dans `src-tauri/src/lib.rs` — **stub**, pas de cible Xcode active |
| `Info.plist` | macOS (LSUIElement, CFBundleIconName) — pas de configuration iOS app |
| Capabilities | `default.json` fenêtre `main` desktop (drag, badge, dialog, opener) |
| CSP `tauri.conf.json` | `connect-src` / `frame-src` **loopback seulement** |
| Icônes | `src-tauri/icons/ios/*` déjà générées (assets, pas d’app) |
| Workspace mobile | **Absent** (`mobile/` n’existe pas) |
| Virtualisation chat | **Absente** — `ChatTimeline` mappe les messages ; stick ≤ 80 px, jump > 200 px |
| App shell | `App.tsx` ~110 KB monolithique, fortement couplé desktop (invoke Tauri, galerie iframe, terminal, browser, git) |

## Décision

### 1. Commencer en Tauri 2 iOS + React

- Workspace isolé préféré : `mobile/` (ne pas polluer le build desktop macOS).
- Réutiliser **contrats** et **tokens** Atelier, pas coller `App.tsx` entier.
- Shell mobile dédié : navigation Chats / Gallery / Fichiers / Réglages.
- Budgets de fluidité mesurés **dès le premier slice vertical** (jalon D/E), pas
  en finition.

### 2. Swift / SwiftUI seulement aux frontières natives

| Domaine | Implémentation |
|---------|----------------|
| Chat, transcript, gallery grille, settings UI | React dans WKWebView Tauri |
| Keychain / secure storage | plugin / pont Swift |
| Notifications, haptique, share sheet, document picker | natif |
| Network / lifecycle (background, verrouillage) | natif + événements vers JS |
| Clavier, safe areas, ajustements WKWebView | natif si le CSS seul échoue |

### 3. Interdiction de réécriture SwiftUI globale prématurée

SwiftUI chat ne devient une option **que si** un profil appareil prouve une
limite structurelle de WKWebView **après** correction des rerenders, du
Markdown lourd et de la virtualisation (gate E plan 034).

### 4. Ce qu’on réutilise vs ce qu’on réécrit

#### Réutiliser tel quel (ou via package partagé)

- `HarnessEventMeta`, `AgentEvent`, `InteractionResponse` (`ws.ts`)
- `reduceHarnessEvent`, `materializeHarnessHistory`, `mergeHarnessHistory`,
  `eventIdentity` (`harnessEvents.ts`)
- Tokens `src/styles/tokens.css` + valeurs `App.css` Precision Native
- Présentation d’outils / interactions (concepts de `HarnessInteraction`,
  `toolPresentation`, `statusPresentation`) — éventuellement extraits

#### Adapter fortement

| Module desktop | Problème mobile | Direction |
|----------------|-----------------|-----------|
| `useSidecarConnection` / `connectSidecar` | loopback + invoke `sidecar_port` | transport HTTPS/WSS gateway + auth appareil |
| `App.tsx` orchestration | monolithe + surfaces desktop | shell mobile mince + stores chat |
| `ChatTimeline` | pas de virtualisation ; rerender large | virtualisation par turn + buffer frame |
| `Composer*` | clavier desktop Enter | IME, safe area, auto-grow borné |
| `md.tsx` / KaTeX idle | déjà idle-load (022) | étendre : texte léger pendant stream, promote idle |
| Gallery iframe `127.0.0.1` | origin loopback + nonce IPC | API gateway + viewers iOS |

#### Interdire sur mobile (MVP)

- Terminal PTY interactif
- Browser Tauri natif / Vivaldi import
- Git mutatif avancé, Zotero éditable
- `invoke` desktop (`start_atelier`, `browser_*`, badge Dock…)
- Accès filesystem projet via chemins bruts
- Réutilisation du token sidecar de session Mac

### 5. Identité visuelle

Prolonger **Precision Native** sans seconde palette :

| Rôle | Valeur (dark, source `App.css`) |
|------|----------------------------------|
| Graphite app | `#1e2124` (`--bg`) |
| Surface / pop | `#24282d` (`--bg-pop`, `--bg-card`) |
| Texte | `#dadee3` / `#b9bec4` / `#90969d` |
| Accent | `#e77f3e` (sélection, running, attention seulement) |
| Rayons | 6 px contrôles, 10 px surfaces |
| Motion | 120–150 ms, opacity/transform, pas de bounce |
| Typo | pile système iOS / SF Pro ; tailles 10/11/12/13/15 |

Contrôle anti-dérive : tests ou snapshot de tokens dans `mobile/` comparés aux
variables desktop (jalon D).

### 6. Architecture client mobile (cible)

```text
mobile/
  src/
    app/          # shell, nav, lifecycle events
    chat/         # store normalisé, reducer (import protocol), transcript, composer
    gallery/
    files/
    transport/    # API + WSS + reconnect + auth
    storage/      # projection locale versionnée
    native/       # wrappers plugins
    design/       # aliases tokens
  src-tauri/      # entrée iOS, capabilities minimales
  tests/
```

État chat (jalon E) :

1. **Durable** — entités normalisées par id (turns/messages/items)
2. **Transport** — offline / connecting / live / degraded
3. **Présentation** — hauteurs, folds, mode scroll (pinned / reading / catch-up)

Un seul reducer pour live et replay (copie sémantique de `harnessEvents`).

## Alternatives rejetées

| Option | Pourquoi non maintenant |
|--------|-------------------------|
| SwiftUI chat dès le jour 1 | Double coût, perd le reducer TS testé, aucune preuve WKWebView insuffisant |
| PWA Safari seule | Keychain/notifs/haptique/lifecycle faibles ; moins « app native » |
| Réutiliser le même `src/` desktop | CSP loopback, invoke, monolithe — non portable sans greffe toxique |
| Capacitor | Écosystème moins aligné Tauri existant ; pas de gain clair |

## Conséquences

**Positives** : partage contrats/tests ; itération UI rapide ; alignement visuel.

**Négatives** : risque perf WKWebView ; discipline stricte anti-monolithe ;
plugins natifs à maintenir.

**Mitigations** : budgets §3.1 plan 034 mesurés sur iPhone physique ; profiling
avant toute réécriture ; virtualisation et buffer 1 frame/token dès E.

## Preuves de non-prêt iOS actuel (drift)

1. Aucun `tauri ios` project / `gen/apple` dans le dépôt.
2. CSP et capabilities desktop-only.
3. Bootstrap `main.tsx` hydrate via `http://127.0.0.1:${port}/uistate` + invoke.
4. Gallery IPC refuse toute origin hors `127.0.0.1:18790–19789` (`ipc.ts`).

Ces points confirment : le mobile est un **nouveau client**, pas un flag de build
sur l’app Mac.

## Références

- `src-tauri/src/lib.rs`, `tauri.conf.json`, `capabilities/default.json`
- `src/styles/tokens.css`, `src/App.css`
- `src/components/chat/*`, `docs/performance/frontend-2026-07.md`
- `plans/016`, `020`, `022`, `023`, `034`
