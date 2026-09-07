# Plan 074 : La passerelle distante refuse par défaut — pair inconnu ≠ loopback, liste d'hôtes vide ≠ tout accepter

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat b70ac4b3..HEAD -- rust/crates/atelier-remote/src/routes.rs rust/crates/atelier-remote/src/hostcheck.rs rust/crates/atelier-remote/src/lib.rs rust/crates/atelier-remote/tests/security.rs`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `b70ac4b3`, 2026-09-06

## Why this matters

`atelier-remote` est la passerelle qui expose Atelier au compagnon mobile via
Tailscale. Deux gardes sont **fail-open** : (1) `require_admin` saute la
vérification loopback quand l'adresse du pair vaut `"unknown"` (commentaire :
« may be unknown in tests ») — un changement de topologie ou de proxy qui fait
perdre `ConnectInfo` retire silencieusement la défense en profondeur des routes
admin (appairage, révocation, rotation) ; (2) `check_host` accepte n'importe quel
`Host` quand `allowed_hosts` est vide (commentaire : « require list. ») — une
config incomplète ouvre au DNS rebinding. Les deux avaient été notées en juillet
(SEC-04/05 de l'audit mobile) et jamais planifiées. Le jeton admin reste une
seconde barrière ; ce plan restaure la première.

## Current state

- `rust/crates/atelier-remote/src/routes.rs:223-231` :
  ```rust
  async fn require_admin(state: &GatewayState, headers: &HeaderMap, peer: &str) -> ApiResult<()> {
      if !is_loopback_ip(peer) && peer != "unknown" {
          // ConnectInfo may be unknown in tests — allow if admin token matches anyway for unit tests
          // but reject clear non-loopback.
          if !(peer.starts_with("127.") || peer == "::1") {
              return Err(ApiError::new(StatusCode::FORBIDDEN, "admin_loopback_only", "admin réservé au loopback"));
  ```
  puis vérification du jeton `x-atelier-admin-token` (`hash_token(tok) != g.auth.admin_token_hash()`).
- `rust/crates/atelier-remote/src/hostcheck.rs:6-19` :
  ```rust
  pub fn check_host(headers: &HeaderMap, allowed: &[String]) -> Result<(), ApiError> {
      … if host.is_empty() { return Err(ApiError::bad_request("bad_host", "Host manquant")); }
      let host_lower = host.to_ascii_lowercase();
      if allowed.is_empty() {
          // Default: reject clearly public-looking hosts when list empty? require list.
          return Ok(());
      }
  ```
- `allowed_hosts` : `lib.rs:52` `pub fn app_router(state, allowed_hosts: Vec<String>)`, `lib.rs:92` (`config.allowed_hosts.clone()`), `lib.rs:161` (`c.allowed_hosts = hosts`), utilisé `routes.rs:182` (`check_host(headers, &g.config.allowed_hosts)?`).
- Tests d'intégration : `rust/crates/atelier-remote/tests/security.rs` — `fn test_config(tmp)` (l.11), `async fn boot()` (l.26, démarre une passerelle réelle et retourne `(handle, base_url, admin_token)`), `fn client()`, `async fn pair_device(base, admin, host, name)` (l.60), tests `#[tokio::test]` (`health_public_no_token` l.94, `health_degrades_without_device_token` l.111, …). **Modèle à suivre.** Regarde comment `test_config` remplit `allowed_hosts` : c'est là que se décide si les tests existants passent par la liste vide.
- Décision documentée (plan 062) : frontière de confiance = IP Tailscale + jetons ; ce plan ne change pas ce modèle, il ferme deux trous du modèle.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests remote | `cargo test -q -p atelier-remote --manifest-path rust/Cargo.toml` | `test result: ok` |
| Build | `cargo build -q --manifest-path rust/Cargo.toml` | exit 0 |

## Scope

**In scope**: `routes.rs` (`require_admin`), `hostcheck.rs` (`check_host`), `lib.rs` (uniquement si une validation de config au démarrage s'impose), `tests/security.rs`, et le fichier de tests unitaires de `hostcheck.rs` s'il existe.
**Out of scope**: `auth.rs`, le protocole d'appairage, le mobile (`mobile/`, `mobile-native/`), la configuration par défaut livrée à l'utilisateur (si la liste d'hôtes n'est jamais remplie en production, voir STOP).

## Git workflow

Branche `advisor/074-passerelle-fail-closed` ; commits `fix(remote): pair inconnu traité comme non-loopback` et `fix(remote): liste d'hôtes vide = refus` ; ne pas pousser.

## Steps

### Step 1 : Tests rouges
Dans `tests/security.rs`, sur le modèle de `pair_device`/`boot` : (a) un appel admin avec un `Host` absent de la liste est refusé (`403` ou `400 bad_host`) quand la liste est **non vide** ; (b) avec une config dont `allowed_hosts` est vide, tout appel authentifié est refusé avec un code d'erreur explicite (`bad_host`/`host_not_configured`) — ce test échoue aujourd'hui ; (c) unitaire `hostcheck` : `check_host(headers, &[])` → `Err`. Pour `require_admin`, un test unitaire direct avec `peer = "unknown"` et un jeton valide → `Err(admin_loopback_only)` (si `GatewayState` est constructible en test — sinon passer par `boot()` et un en-tête qui force le pair inconnu, s'il existe ; sinon STOP et rapporte).
**Verify**: `cargo test -q -p atelier-remote --manifest-path rust/Cargo.toml` → les nouveaux tests échouent, les anciens passent.

### Step 2 : `check_host` fail-closed
`allowed.is_empty()` → `Err(ApiError::new(StatusCode::FORBIDDEN, "host_not_configured", "aucun hôte autorisé configuré"))` (adapter au constructeur d'erreur existant). Mettre à jour le commentaire.
**Verify**: le test (b)/(c) passe.

### Step 3 : `require_admin` sans exception « unknown »
Supprimer `&& peer != "unknown"` : un pair inconnu est traité comme non-loopback et refusé. Si les tests d'intégration existants reposaient sur ce contournement (pair `unknown` en test), corriger **le test** pour fournir un `ConnectInfo` loopback (regarde comment `boot()` monte le serveur : `axum::serve(...).into_make_service_with_connect_info::<SocketAddr>()` doit être en place ; sinon c'est une condition STOP).
**Verify**: `cargo test -q -p atelier-remote --manifest-path rust/Cargo.toml` → tout vert.

### Step 4 : Validation au démarrage (si simple)
Dans `lib.rs`, à la construction de la config (l.~92/161), refuser de démarrer la passerelle (erreur explicite, journalisée) si `allowed_hosts` est vide **et** que le mode n'est pas explicitement local ; si le repo n'a pas de notion de « mode local », logguer un avertissement clair et s'en tenir au refus par requête de l'étape 2. Ne pas inventer une option de configuration.
**Verify**: `cargo build -q --manifest-path rust/Cargo.toml` → exit 0.

## Done criteria

- [ ] `grep -n 'peer != "unknown"' rust/crates/atelier-remote/src/routes.rs` → aucune sortie.
- [ ] `grep -n "return Ok(())" rust/crates/atelier-remote/src/hostcheck.rs` → plus dans la branche `allowed.is_empty()`.
- [ ] `cargo test -q -p atelier-remote --manifest-path rust/Cargo.toml` → ok, ≥ 3 tests de plus.
- [ ] `git status --short` limité au scope.

## STOP conditions

- Le serveur de test (`boot()`) n'expose pas `ConnectInfo` et les tests admin existants ne passent que grâce à `"unknown"` — rapporte, ne désactive aucun test.
- La configuration de production livrée laisse `allowed_hosts` vide (vérifie où elle est écrite : `grep -rn "allowed_hosts" rust/crates src-tauri src/lib`) — fermer la garde couperait le mobile ; rapporte la source de config avant de continuer.

## Maintenance notes

Reviewer : vérifier que le message d'erreur d'une liste vide guide l'utilisateur (quel réglage remplir), pas seulement un 403 muet.
