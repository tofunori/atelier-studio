# Handoff jalon D — plan 034

### Périmètre livré

- Workspace isolé `mobile/` (Vite + React + Tauri 2) — **ne touche pas** le build desktop.
- Navigation Chats / Gallery / Fichiers / Réglages (tab bar ≥ 44 pt, safe areas, dark, focus-visible).
- Parcours d'appairage → token device en secure storage (Tauri commands + fallback web).
- États de connexion : `never_paired`, `offline`, `tailscale_missing`, `auth_expired`, `version_incompatible`, `connecting`, `ready`.
- Diagnostics copiables **sans secret**.
- Tokens Precision Native + test anti-dérive vs `src/App.css`.
- Slice verticale testée : pair → threads → history messages (mock gateway).
- Placeholders Gallery/Fichiers (jalon G). **Pas d'envoi** (jalon E).

### Fichiers

- `mobile/**` — client complet
- `package.json` — scripts `mobile:typecheck|test|build`
- `docs/mobile/HANDOFF-D.md`

### Contrats/invariants

- Client parle **uniquement** à la gateway (`/remote/*`), jamais au sidecar brut.
- `protocolVersion = 1` négocié via health / pair.
- Token device jamais dans diagnostics ni logs UI.
- Desktop `src/` hors Settings remote (C) non requis pour D.

### Tests exécutés

```text
cd mobile && npm run typecheck   → OK
cd mobile && npm test            → 17 passed
cd mobile && npm run build       → OK (dist ~210 KB JS gzip 66 KB)
npx tauri ios init --ci          → ÉCHEC : cocoapods absent (gem sudo requis)
```

### Mesures appareil

- **iPhone physique** : non exécuté dans ce harness (pas d'install ad-hoc signée ici).
- Xcode 26.6 présent ; `tauri ios init` bloque sans CocoaPods — à installer par Thierry :
  `sudo gem install cocoapods` puis `cd mobile && npm run ios:init`.
- Preuve logique slice : `tests/vertical-slice.test.tsx` (17 tests package).
- Dev web : `npm run dev` (port 1421) + gateway C pour validation sans Xcode.

### Preuves visuelles

- À capturer sur device/sim après `npm run ios:dev` + gateway locale.

### Limites et risques restants

1. Secure storage Tauri = fichier app-data chiffré OS ; Keychain iOS natif à brancher (API prête via invoke).
2. `tauri ios init` / team ID / provisioning : étape opérateur.
3. CSP mobile autorise `*.ts.net` pour Tailscale Serve.
4. Gallery/Files UI = placeholders.
5. Gate Codex D exige **app physique** — rejouer pair→20 msgs sur iPhone réel.

### Drift

- Port dev **1421** (desktop 1420) pour cohabitation.
- Identifier `com.tofunori.atelier.companion` distinct du desktop.

### Demande à Codex

**`GO`** pour jalon E (moteur chat fluide) après vérif device si possible, ou **`GO avec corrections`** si le shell/storage doit être ajusté.
La slice lecture (sans send) suffit pour débloquer E en parallèle d'un pass device.
