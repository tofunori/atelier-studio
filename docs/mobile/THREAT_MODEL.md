# Threat model — Atelier Companion iOS (jalon A)

- **Date** : 2026-07-12
- **Commit** : `0fbfc7a`
- **Portée** : MVP plan 034 (chat + gallery/files lecture + pairing)
- **Hors portée** : App Store public, multi-tenant cloud, Funnel

## 1. Actifs

| Actif | Sensibilité | Localisation actuelle |
|-------|-------------|------------------------|
| Clés API providers (Claude, Codex, Grok, …) | Critique | Mac (env / config sidecar) — **ne jamais** répliquer sur iOS |
| Journal de conversation (prompts, code, données science) | Élevé | Mac store / harness-history |
| Token sidecar session `ATELIER_TOKEN` | Critique (contrôle local total) | Process + lockfile Application Support |
| Projets scientifiques (PDF, LaTeX, figures, données) | Élevé | Disque Mac sous project roots |
| UI state (projets ouverts, settings) | Moyen | `ui.json` sidecar |
| Credential appareil mobile (futur) | Critique | Keychain iOS (cible) |
| Secret de pairing (futur) | Élevé | TTL court, affichage Mac |

## 2. Frontières de confiance

```text
┌─────────────────────────────────────────────────────────┐
│ iPhone (moins de confiance)                             │
│  UI + cache projection + Keychain device token          │
└───────────────────────────┬─────────────────────────────┘
                            │ Tailscale (réseau privé)
                            │ HTTPS/WSS + auth applicative
┌───────────────────────────▼─────────────────────────────┐
│ Gateway Mac (frontière d’autorisation)                  │
│  pairing, scopes, rate limits, path policy              │
└───────────────────────────┬─────────────────────────────┘
                            │ loopback seulement
┌───────────────────────────▼─────────────────────────────┐
│ Sidecar + Gallery + providers (confiance haute locale)  │
│  ATELIER_TOKEN session, FS, Git, PTY, clés API          │
└─────────────────────────────────────────────────────────┘
```

**Aujourd’hui** : la frontière « gateway » n’existe pas. Le sidecar écoute
uniquement `127.0.0.1` — l’exposition tailnet brute serait une régression
sécurité majeure (STOP condition plan 034).

## 3. Hypothèses

1. L’attaquant sur Internet public ne voit pas le Mac (Tailscale privé, pas Funnel).
2. Un appareil iOS peut être perdu / volé / jailbreak partiel.
3. Un processus malveillant sur le Mac a déjà un accès large (hors modèle MVP).
4. Thierry est le seul utilisateur légitime du tailnet personnel.
5. Les transcripts peuvent contenir des données de thèse non publiques.

## 4. Menaces et contrôles

### T1 — Usurpation du token sidecar desktop

- **Scénario** : réutiliser `ATELIER_TOKEN` de session depuis le téléphone ou un
  peer tailnet → accès terminal, git, files, send.
- **Contrôles** : jeton **distinct par appareil** ; gateway ne réexporte pas le
  token desktop ; révocation Mac ; rotation.
- **Statut code actuel** : un seul token session — **gap jalon C**.

### T2 — Exposition brute du sidecar sur le réseau

- **Scénario** : bind `0.0.0.0` ou Tailscale Serve sur le port sidecar.
- **Contrôles** : gateway dédiée surface minimale ; sidecar reste loopback ;
  revue policy CI.
- **Statut** : bind `127.0.0.1` OK aujourd’hui ; **ne pas casser**.

### T3 — Path traversal / lecture hors projet

- **Scénario** : `../`, symlink sortant, double encodage, chemin absolu.
- **Contrôles** : ids opaques ; canonicalisation ; resolve symlink ; appartenance
  projet ; allowlist MIME ; taille max.
- **Desktop gallery** : origin loopback + bearer optionnel — modèle à étendre,
  pas à copier tel quel sur le réseau.

### T4 — Pairing brute-force / secret faible

- **Scénario** : deviner code court pendant la fenêtre d’appairage.
- **Contrôles** : TTL court ; rate limit ; invalidation après N essais ; QR
  one-time ; secret à entropie suffisante.

### T5 — Vol d’appareil iOS

- **Scénario** : accès physique au téléphone déverrouillé ou backup.
- **Contrôles** : Keychain accessibility appropriée ; révocation Mac immédiate ;
  pas de clés API sur device ; cache chiffré OS ; contenu notif minimal.

### T6 — Injection / CSRF / origin confusion

- **Scénario** : page web hostile force des requêtes vers la gateway.
- **Contrôles** : HTTPS ; checks Host/Origin ; token bearer obligatoire ;
  pas de cookies de session permissifs ; WSS authentifié.

### T7 — Replay d’actions (send, interaction)

- **Scénario** : rejouer un `send` ou une approval capturée.
- **Contrôles** : `clientRequestId` / idempotence serveur ; état terminal
  autoritaire ; nonces d’interaction à usage unique.

### T8 — Fuite via logs / diagnostics / captures

- **Scénario** : diagnostics copiables contiennent prompt, token, chemins.
- **Contrôles** : logs sans secrets (déjà direction Rust server) ; écran
  diagnostics mobile redacted ; fixtures sans données réelles.

### T9 — Downgrade / version protocol incompatible

- **Scénario** : client ancien mal interprète events → faux done / double send.
- **Contrôles** : `protocolVersion` négocié ; refus explicite si incompatible
  (constante Rust existe, **pas sur le fil** → jalon B/C).

### T10 — Déni de service local

- **Scénario** : flood WS, uploads massifs, 1000 events reconnect.
- **Contrôles** : rate limits, max payload, max connexions, timeouts, backpressure.

### T11 — Confused deputy via scopes insuffisants

- **Scénario** : appareil « lecture seule » peut quand même `send` ou term.
- **Contrôles** : scopes stricts côté gateway ; tests token mauvais scope.

### T12 — Contenu HTML de projet exécuté dans le WebView

- **Scénario** : ouvrir un HTML projet → XSS dans contexte app.
- **Contrôles** : viewers isolés ; pas d’exécution HTML projet dans le document
  principal ; SVG sanitizé.

## 5. Risques résiduels acceptés (MVP)

| Risque | Pourquoi accepté | Mitigation partielle |
|--------|------------------|----------------------|
| Compromission Mac = game over | Le Mac est le moteur | OS updates, FileVault |
| Peer Tailscale malveillant sur le même tailnet | Trust réseau familial/perso | Auth applicative + scopes |
| WKWebView supply-chain (deps JS) | Stack partagée desktop | deps pin, CSP mobile stricte |
| Metadata Tailscale (qui parle à qui) | Hors app | — |

## 6. Non-objectifs de sécurité MVP

- Attestation hardware device (App Attest) — option ultérieure
- E2E encryption client↔gateway au-delà de TLS
- Multi-utilisateur concurrent avec isolation fine
- Publication App Store / revue Apple privacy labels (distribution privée d’abord)

## 7. Exigences de tests sécurité (report jalon C)

Doivent échouer clairement avant tout client réel :

1. token absent / expiré / révoqué / mauvais scope
2. brute force pairing + expiration
3. `../`, absolu, double encode, symlink sortant
4. MIME mensonger, fichier trop gros, range invalide
5. Host/Origin inattendu
6. replay send / interaction
7. deux appareils, révocation d’un seul
8. redémarrage Mac : jeton révoqué reste mort

## 8. Cartographie contrôles existants vs manquants

| Contrôle | Desktop actuel | Mobile MVP requis |
|----------|----------------|-------------------|
| Loopback bind sidecar | Oui | Conserver |
| Token session unique | Oui | **Remplacer** par token appareil + proxy |
| Origin gallery IPC | Loopback only | N/A (pas d’iframe desktop) |
| CSP connect loopback | Oui | CSP vers host Tailscale gateway |
| Journal eventId idempotent | Oui (client) | Oui + serveur resume |
| Scopes | Non | **Oui** |
| Révocation appareil UI | Non | **Oui** |
| protocolVersion wire | Non | **Oui** |
| Path opaque files API | Partiel (listFiles paths) | **Oui** (gateway) |
