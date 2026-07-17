# Plan 042 : Stocker le token d'appareil dans le Keychain iOS (fin du fichier en clair)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 12e1a04..HEAD -- mobile/src-tauri/src/lib.rs mobile/src-tauri/Cargo.toml mobile/src/native/secureStorage.ts docs/mobile/THREAT_MODEL.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `12e1a04`, 2026-07-16

## Why this matters

Le token bearer de l'appareil (accès complet au gateway dans ses scopes, y compris `files:write`) est écrit **en clair** dans `secure-store.json` sous `app_data_dir`, avec en plus un fallback silencieux vers `localStorage` du WKWebView si l'invoke Tauri échoue. Le threat model du projet (`docs/mobile/THREAT_MODEL.md`, menace T5 « vol d'appareil ») désigne le **Keychain** comme contrôle cible, et deux commentaires de code prétendent déjà que le Keychain est utilisé « when available » alors qu'aucun chemin Keychain n'existe. Ce plan implémente le vrai Keychain sur iOS, supprime le fallback localStorage pour les secrets sous Tauri, aligne les commentaires, et traite le token de l'ère « fichier en clair » comme brûlé (ré-appairage).

## Current state

- `mobile/src-tauri/src/lib.rs` (116 lignes) — commandes Tauri `secure_set` / `secure_get` / `secure_remove` + cache mémoire `Mutex<HashMap>`. Le stockage disque est TOUJOURS un JSON en clair :

```rust
// lib.rs:1-3 (doc-comment mensonger à corriger)
//! Atelier Companion — Tauri entry (iOS + desktop shell for dev).
//! Secure storage commands map to Keychain on iOS when available; otherwise
//! a private app-data file (never logs secrets).

// lib.rs:20-25
fn store_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("secure-store.json")
}
```

  `secure_set` (lib.rs:44-58) écrit mémoire + `save_disk` ; `secure_get` (61-79) lit mémoire puis disque ; `secure_remove` (81-94) supprime des deux ; `run()` (96-116) précharge le disque en mémoire au setup.

- `mobile/src-tauri/Cargo.toml` — la dépendance Keychain est en commentaire (report documenté, à lever) :

```toml
[target.'cfg(target_os = "ios")'.dependencies]
# Keychain via security-framework is optional; file store used until linked.
# security-framework = "2"
```

- `mobile/src/native/secureStorage.ts` (84 lignes) — wrapper JS. Problème : même sous Tauri, un échec d'`invoke` retombe en silence sur `localStorage` (en clair dans le conteneur WKWebView) :

```ts
// secureStorage.ts:15-31
export async function secureSet(key: string, value: string): Promise<void> {
  memory.set(key, value);
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("secure_set", { key, value });
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    localStorage.setItem(`secure:${key}`, value);
  } catch { /* private mode */ }
}
```

  Même motif dans `secureGet` (33-52) et `secureRemove` (54-69). Le doc-comment lignes 1-5 répète la fausse affirmation Keychain.

- Ce qui transite par ce stockage : les credentials d'appareil complets (`token` bearer, `deviceId`, `gatewayBaseUrl`, scopes) via `mobile/src/storage/credentials.ts:19-22` (clé `atelier.device.credentials.v1`), l'URL gateway, la file d'envoi (`atelier.sendQueue.v1`, contient les prompts).
- `docs/mobile/THREAT_MODEL.md:17` : « Credential appareil mobile (futur) | Critique | Keychain iOS (cible) » ; T5 (lignes 84-87) : contrôle = « Keychain accessibility appropriée ».
- Politique secrets : `docs/mobile/SECRETS_POLICY.md` — jamais de token dans les logs/diagnostics. Le code Rust ne logge rien actuellement ; conserver cette propriété.
- Identifiant de bundle : `com.tofunori.atelier.companion` (`mobile/src-tauri/tauri.conf.json:5`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Compile Rust (desktop) | `cargo check --manifest-path mobile/src-tauri/Cargo.toml` | exit 0 |
| Compile Rust (iOS) | `cargo check --manifest-path mobile/src-tauri/Cargo.toml --target aarch64-apple-ios` | exit 0 (voir STOP si target absente) |
| Tests JS mobile | `cd mobile && npm test` | tous verts |
| Typecheck | `cd mobile && npm run typecheck` | exit 0 |
| Scan secrets | `npm run mobile:check-secrets` | exit 0 |

## Suggested executor toolkit

- Consulter la doc du crate avant d'écrire le code Rust : https://docs.rs/security-framework — module `passwords` (`set_generic_password`, `get_generic_password`, `delete_generic_password`). Si un skill de recherche de docs (`find-docs` / context7) est disponible, l'utiliser pour vérifier la signature exacte et le support d'options d'accessibilité de la version retenue.

## Scope

**In scope** (the only files you should modify):
- `mobile/src-tauri/Cargo.toml`
- `mobile/src-tauri/src/lib.rs`
- `mobile/src/native/secureStorage.ts`
- `mobile/src/native/secrets.test.ts` ou nouveau `mobile/src/native/secureStorage.test.ts` (tests JS)
- `docs/mobile/THREAT_MODEL.md` (mise à jour de deux lignes d'état — pas de refonte)

**Out of scope** (do NOT touch, even though they look related):
- `mobile/src/storage/credentials.ts`, `PairingScreen.tsx` — l'API `secureSet/Get/Remove` ne change pas de signature.
- Le gateway (`rust/crates/`) et la révocation — le ré-appairage est une étape opérateur documentée, pas du code.
- `mobile/src-tauri/capabilities/`, CSP — inchangés.

## Git workflow

- Branche : `advisor/042-keychain-secure-token-storage`
- Commits par étape ; messages style repo (ex. `feat(mobile): keychain iOS pour le secure store`).
- Ne pas pusher ni ouvrir de PR sans instruction de l'opérateur.

## Steps

### Step 1 : Activer security-framework pour iOS

Dans `mobile/src-tauri/Cargo.toml`, remplacer le bloc commenté par :

```toml
[target.'cfg(target_os = "ios")'.dependencies]
security-framework = "3"
```

(Si la résolution de version échoue, essayer `"2"` — les fonctions `passwords::*` existent dans les deux majeures.)

**Verify**: `cargo check --manifest-path mobile/src-tauri/Cargo.toml` → exit 0 (le crate n'est pas compilé sur macOS desktop par ce target-cfg… il EST compilé si l'exécuteur est sur macOS ? Non : `cfg(target_os = "ios")` ne s'applique qu'à la cible iOS. Le check desktop valide seulement la syntaxe du manifest).

### Step 2 : Backend Keychain dans lib.rs (iOS) + fichier conservé (desktop dev)

Restructurer `lib.rs` en gardant les trois commandes et le cache mémoire, mais en scindant la persistance :

```rust
// Persistance par plateforme. iOS : Keychain (kSecClassGenericPassword,
// service = bundle id). Desktop dev : fichier app-data (non chiffré, dev only).
const KEYCHAIN_SERVICE: &str = "com.tofunori.atelier.companion";

#[cfg(target_os = "ios")]
mod persist {
    use super::KEYCHAIN_SERVICE;
    pub fn set(key: &str, value: &str) -> Result<(), String> {
        security_framework::passwords::set_generic_password(
            KEYCHAIN_SERVICE, key, value.as_bytes(),
        ).map_err(|e| e.to_string())
    }
    pub fn get(key: &str) -> Result<Option<String>, String> {
        match security_framework::passwords::get_generic_password(KEYCHAIN_SERVICE, key) {
            Ok(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).into_owned())),
            Err(_) => Ok(None), // item absent
        }
    }
    pub fn remove(key: &str) -> Result<(), String> {
        let _ = security_framework::passwords::delete_generic_password(KEYCHAIN_SERVICE, key);
        Ok(())
    }
}

#[cfg(not(target_os = "ios"))]
mod persist { /* déplacer ici load_disk/save_disk actuels, mêmes fonctions set/get/remove par clé */ }
```

Adapter `secure_set`/`secure_get`/`secure_remove` pour appeler `persist::*` (le cache mémoire `SecureStore` reste identique, il donne le fast path et le comportement en tests). Le `setup` ne précharge le disque **que** dans la variante non-iOS.

Migration iOS (une fois) : dans `setup`, `#[cfg(target_os = "ios")]` — si `secure-store.json` existe dans `app_data_dir`, importer chaque entrée vers le Keychain **puis supprimer le fichier**. Ne jamais logger les clés ni les valeurs.

Corriger le doc-comment de tête (`lib.rs:1-3`) pour décrire la réalité : « Keychain sur iOS ; fichier app-data en dev desktop uniquement ».

**Verify**:
1. `cargo check --manifest-path mobile/src-tauri/Cargo.toml` → exit 0.
2. `cargo check --manifest-path mobile/src-tauri/Cargo.toml --target aarch64-apple-ios` → exit 0. Si la target n'est pas installée : `rustup target add aarch64-apple-ios` puis relancer ; si l'installation est impossible dans l'environnement, STOP condition (le code iOS ne peut pas être validé).

### Step 3 : Supprimer le fallback localStorage sous Tauri (JS)

Dans `mobile/src/native/secureStorage.ts` :

- `secureSet` : si `isTauri()`, tenter l'invoke ; en cas d'échec, **ne pas** écrire `localStorage` — conserver la valeur en mémoire seulement et relancer l'erreur sous forme silencieuse contrôlée (retour normal, mais pas de persistance web). Concrètement : `if (isTauri()) { try { ...invoke...; return; } catch { return; /* mémoire seulement — jamais localStorage sous Tauri */ } }`.
- Même traitement dans `secureGet` (pas de lecture localStorage sous Tauri) et `secureRemove` (toujours tenter le remove localStorage est acceptable — suppression, pas fuite ; le garder hors Tauri seulement pour symétrie).
- Hors Tauri (dev web Safari, tests jsdom) : comportement actuel conservé (localStorage).
- Corriger le doc-comment lignes 1-5 (« Tauri : Keychain iOS / fichier dev desktop ; Web/tests : mémoire + localStorage »).

**Verify**: `cd mobile && npm test` → verts ; `cd mobile && npm run typecheck` → exit 0.

### Step 4 : Tests JS du non-fallback

Nouveau fichier `mobile/src/native/secureStorage.test.ts` (modèle : `mobile/src/native/secrets.test.ts`) :

1. Simuler Tauri : `(window as any).__TAURI_INTERNALS__ = {}` + mock de `@tauri-apps/api/core` (`vi.mock`) dont `invoke` **rejette**. Appeler `secureSet("k","v")` puis vérifier `localStorage.getItem("secure:k") === null` et que `secureGet("k")` retourne `"v"` (mémoire).
2. Sans `__TAURI_INTERNALS__` : `secureSet` écrit bien `localStorage` (comportement web conservé).
3. Nettoyage : utiliser `__resetSecureStorageForTests()` entre les cas.

**Verify**: `cd mobile && npx vitest run src/native/secureStorage.test.ts` → 2+ tests verts.

### Step 5 : Aligner le threat model

Dans `docs/mobile/THREAT_MODEL.md` :
- Ligne 17 (la rangée « Credential appareil mobile » — chercher la chaîne exacte, ne pas se fier au numéro) : « Keychain iOS (cible) » → « Keychain iOS (implémenté — plan 042) ».
- Section T5 : noter que le contrôle Keychain est en place et que les tokens antérieurs au changement doivent être révoqués/ré-appairés (renvoyer à `docs/mobile/REVOCATION_CHECKLIST.md`).

**Verify**: `npm run mobile:check-secrets` → exit 0 ; `git diff docs/mobile/THREAT_MODEL.md` ne montre que ces deux zones.

## Test plan

- Tests JS du Step 4 (non-fallback sous Tauri ; fallback web conservé).
- Rust : pas de test unitaire Keychain possible hors device — la validation est `cargo check` des deux cibles + revue. Ajouter un `#[cfg(test)] mod tests` minimal validant la variante fichier (`persist::set/get/remove` non-iOS round-trip dans un tempdir) si `store_path` est rendu injectable facilement ; sinon le noter en maintenance.
- Vérification finale : `cd mobile && npm test` + les deux `cargo check`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "security-framework" mobile/src-tauri/Cargo.toml` → ligne active (non commentée)
- [ ] `cargo check --manifest-path mobile/src-tauri/Cargo.toml` exit 0
- [ ] `cargo check --manifest-path mobile/src-tauri/Cargo.toml --target aarch64-apple-ios` exit 0
- [ ] `cd mobile && npm test` exit 0 avec les nouveaux tests du Step 4
- [ ] `grep -n "localStorage.setItem" mobile/src/native/secureStorage.ts` : l'écriture n'est plus atteignable quand `isTauri()` est vrai (inspection du flux de contrôle)
- [ ] `grep -c "when available" mobile/src-tauri/src/lib.rs mobile/src/native/secureStorage.ts` → 0
- [ ] `npm run mobile:check-secrets` exit 0
- [ ] `git status` : seuls les fichiers in-scope (et `plans/README.md`) modifiés

## STOP conditions

Stop and report back (do not improvise) if:

- `rustup target add aarch64-apple-ios` échoue ou est interdit dans l'environnement : le code iOS ne peut pas être validé — livrer les steps 3-5 seulement est **insuffisant**, reporter.
- L'API `security_framework::passwords` n'expose pas `set_generic_password`/`get_generic_password`/`delete_generic_password` dans la version résolue : vérifier docs.rs et reporter la signature réelle plutôt que d'improviser une autre API (Core Foundation brute interdite ici).
- Un test existant qui dépendait du fallback localStorage sous Tauri casse : lister lesquels et reporter (le contrat a des consommateurs non documentés).
- L'option d'accessibilité (`WhenUnlockedThisDeviceOnly`) n'est pas configurable via le crate : livrer avec l'accessibilité par défaut du Keychain, et **consigner explicitement** ce résidu dans les maintenance notes du commit + THREAT_MODEL (ne pas bloquer le plan pour ça).

## Maintenance notes

- **Rotation obligatoire** : tout token stocké avant ce plan a existé en clair sur disque — après déploiement, l'opérateur doit révoquer les devices (`docs/mobile/REVOCATION_CHECKLIST.md`) et ré-appairer. Le plan ne peut pas le faire à sa place.
- La validation on-device (le token survit au relaunch, l'item Keychain est bien `ThisDeviceOnly`, absent des backups) reste une étape opérateur sur iPhone physique — l'ajouter à `docs/mobile/SOAK_CHECKLIST.md` lors du prochain passage.
- Si l'accessibilité par défaut a été livrée (voir STOP #4), planifier le durcissement (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`) dès que le crate le permet.
- La file d'envoi (`atelier.sendQueue.v1`, prompts en clair) transite par le même store et bénéficie automatiquement du Keychain — mais elle grossit sans borne (voir plan 043) ; le Keychain a des limites de taille pratiques par item, raison de plus d'exécuter 043.
