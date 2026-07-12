# Atelier Companion (mobile) — plan 034 jalon D

Client iOS/Tauri isolé du desktop. Ne modifie pas le build macOS principal.

## Stack

- React + Vite (`:1421` en dev)
- Tauri 2 (`src-tauri/`, identifier `com.tofunori.atelier.companion`)
- Gateway Mac : `atelier-remote-gateway` (jalon C)

## Commandes

```bash
cd mobile
npm install
npm run typecheck
npm test
npm run build

# Dev web (Safari iOS ou desktop) contre gateway locale
# Terminal 1 : gateway
#   cargo run -p atelier-remote --manifest-path ../rust/Cargo.toml
# Terminal 2 :
npm run dev

# iOS (Xcode requis)
npm run ios:init   # une fois
npm run ios:dev
```

## Jalons livrés (D–F)

- **D** : shell, appairage, navigation, diagnostics
- **E** : store chat, stream buffer, scroll pinned/reading/catch-up, composer
- **F** : machine réseau, file d'envoi, resume `lastSequence`, cache, lifecycle
- **G** : gallery/files fileId, viewers PDF/image/SVG/texte
- **H** : notifs opt-in, interactions 025, deep links, badge, picker

```bash
npm test          # 50+ tests
npm run dev       # :1421 + gateway C
```

## Structure

```text
src/
  app/           shell, connection state
  chat/          list + transcript lecture
  gallery/ files/ placeholders (jalon G)
  settings/      pairing, diagnostics
  transport/     client gateway
  storage/       credentials
  native/        secure storage (Keychain path / fallback)
  design/        tokens Precision Native + CSS mobile
```
