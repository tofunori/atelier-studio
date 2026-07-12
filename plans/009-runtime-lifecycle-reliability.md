# Plan 009: Fiabiliser reconnexion, persistance UI et effets React

> **Executor instructions**: charger `/efficient-fable`. Tests de caractérisation
> d'abord. Ne pas désactiver React.StrictMode.
>
> **Drift check**: `git diff --stat 8a5d0ca..HEAD -- src/main.tsx src/App.tsx src/lib/ws.ts src/components/AtelierPane.tsx src/**/*.test.*`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 008
- **Category**: bug / tests
- **Planned at**: commit `8a5d0ca`, 2026-07-09

## Why this matters

WS reconnect récupère nouveau port/token, mais le write-through localStorage du
boot garde l'ancien. Le garde `connectedOnce` interagit mal avec double
setup/cleanup StrictMode. AtelierPane ajoute un listener global dans useState sans
cleanup. Résoudre par annulation explicite et source SidecarInfo partagée.

## Target design

- `connectSidecar` accepte AbortSignal ou disposer équivalent.
- Tous timers retry/sockets sont annulés au cleanup.
- Chaque connexion réussie publie SidecarInfo courant.
- POST uistate lit info courant; sur échec réseau, refresh invoke puis un retry.
- pagehide utilise dernier info connu sans chaîne async non bornée.
- App n'a plus connectedOnce; StrictMode produit une connexion active.
- AtelierPane useEffect + removeEventListener.

## Scope

`src/lib/ws.ts`, helper éventuel `sidecarInfo.ts`, main, App, AtelierPane, tests.
Hors scope: protocole métier WS, format ui.json, refactor App, retrait StrictMode.

## Steps

1. Tests WebSocket/invoke/timers: abort empêche retry; cleanup ferme socket;
   reconnexion met info à jour; flush cible nouveau port; listener retiré.
2. Source SidecarInfo sans dépendance React, resettable en test.
3. Rendre connectSidecar annulable: signal avant connect/retry, clear timers,
   neutraliser onclose lors abort.
4. App: AbortController dans effet, retirer connectedOnce, cleanup abort+close.
5. Write-through: consulter info au flush, retry une fois après refresh; nettoyer
   fonctions/listeners patchés en environnement de test.
6. AtelierPane: useEffect + cleanup.

## Verification

```bash
npm run test:frontend -- --run
npm run verify
```

Puis protocole Tauri. Manuel: changer pin/favori, tuer sidecar, attendre reconnect,
changer encore, quitter/revenir; deux changements persistent. Avec dev lancé par
Thierry, StrictMode sans événement doublé.

## Done criteria

- [ ] Aucun connectedOnce.
- [ ] Aucun retry après abort.
- [ ] Une socket active après StrictMode.
- [ ] uistate suit nouveau port/token.
- [ ] Aucun listener AtelierPane après unmount.
- [ ] Fake timers + smoke réel passent.

## STOP conditions

- Invoke impossible à mocker sans production hors scope.
- Singleton global non réinitialisable.
- Un retry survit à abort.

## Maintenance notes

Tous les futurs clients sidecar consomment la même SidecarInfo; ne jamais
recapturer port/token dans une closure longue durée.
