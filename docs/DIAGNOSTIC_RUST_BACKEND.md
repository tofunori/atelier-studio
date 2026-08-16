# Diagnostic & récupération — sidecar Rust (plan 033)

## Identité

| | |
|--|--|
| Process | `atelier-studio-server` (pas `tauri-app`) |
| Bundle path | `Atelier.app/Contents/Resources/rust-server/atelier-studio-server` |
| Lock | `~/Library/Application Support/atelier-studio/sidecar.lock` |
| PID | `~/Library/Application Support/atelier-studio/sidecar.pid` |
| Backend | Rust seul (Porte 10 ; repli `ATELIER_BACKEND=node` retiré, plan 065 phase A — voir `docs/soak/033-COMPLETE.md`) |

## Health rapide

```bash
APP="$HOME/Library/Application Support/atelier-studio"
P=$(pgrep -f "atelier-studio-server" | head -1)
echo "pid process=$P  pidfile=$(cat "$APP/sidecar.pid" 2>/dev/null)"
PORT=$(sed -E 's/.*"port":([0-9]+).*/\1/' "$APP/sidecar.lock" 2>/dev/null)
TOKEN=$(sed -E 's/.*"token":"([^"]+)".*/\1/' "$APP/sidecar.lock" 2>/dev/null)
curl -s -m 5 -H "x-atelier-token: $TOKEN" "http://127.0.0.1:$PORT/health" | python3 -m json.tool
# attendu: ok=true, service=atelier-sidecar, backend=rust (champ optionnel)
```

## Symptômes → actions

### « Sidecar déconnecté » en boucle

1. `pgrep -fl atelier-studio-server` — combien d'instances ?
2. Si plusieurs : kill exhaustif (voir protocole relance) puis **un** relance.
3. Premier boot post-build adhoc : attendre **&lt; 30 s** de convergence TCC
   (pas de rebuild en panique).
4. Vérifier que le binaire n'écrit **pas** dans le `.app` au chargement
   (même règle que le sidecar Node historique).

### Lock pourri / PID mort

```bash
APP="$HOME/Library/Application Support/atelier-studio"
rm -f "$APP/sidecar.lock" "$APP/sidecar.pid"
# puis relancer l'app (ne pas laisser deux spawns concurrents)
```

### Health identity mismatch (bundleHash)

Normal après rebuild : le hash = empreinte du binaire. L'ancien process est
tué (lock pid) puis un nouveau spawn. Si boucle :

```bash
pkill -9 -f atelier-studio-server
rm -f "$HOME/Library/Application Support/atelier-studio/sidecar."{lock,pid}
```

> Historique : jusqu'au 2026-08-16, un repli `ATELIER_BACKEND=node` existait
> ici en dernier recours. Il a été retiré (plan 065 phase A, soak clos —
> `docs/soak/033-COMPLETE.md`) : Rust est désormais le seul backend chat, et
> positionner cette variable n'a plus aucun effet.

## Logs utiles

- stderr du child : visible si spawn échoue (message Tauri « spawn sidecar »)
- Standalone :
  ```bash
  export ATELIER_TOKEN=devtoken ATELIER_APP_DIR=/tmp/atelier-rust-diag
  export ATELIER_SKIP_SINGLE_INSTANCE=1 ATELIER_BUNDLE_HASH=diag
  ./rust/target/release/atelier-studio-server
  # 1re ligne stdout = JSON health
  ```

## Smoke sans UI

```bash
cargo build -p atelier-server --release --manifest-path rust/Cargo.toml
npm run soak:sidecar          # 20 cycles release → COUNTS_FOR_S2=yes
npm run check:backend-policy  # défaut Rust + stage présent
# SOAK_ALLOW_DEBUG=1 = smoke seulement (pas S2)
```
