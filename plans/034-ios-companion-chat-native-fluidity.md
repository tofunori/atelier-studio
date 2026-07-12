# Plan 034 — Atelier Companion iOS : chat de qualité native, galerie et fichiers scientifiques

> **Mandat d’exécution** : Grok réalise l’essentiel de l’implémentation, un lot à
> la fois. Codex agit comme reviewer bloquant entre les lots. Grok ne doit jamais
> enchaîner deux jalons sans fournir le paquet de preuves demandé et recevoir un
> verdict explicite de Codex : `GO`, `GO avec corrections`, ou `STOP`.
>
> **Objectif produit** : permettre à Thierry de poursuivre ses conversations
> Atelier depuis un iPhone ou un iPad, consulter sa Gallery et ouvrir ses fichiers
> LaTeX/PDF/PNG, avec un chat aussi immédiat et stable que les meilleures apps iOS
> de conversation. Le Mac reste le moteur d’agents, de fichiers, de Git, de Zotero
> et de terminal. L’app iOS est un client distant sécurisé, jamais un sidecar bis.
>
> **Principe non négociable** : la fluidité est un contrat mesuré dès le premier
> lot vertical. Elle n’est pas une passe de finition.

## 0. Statut et ownership

- **Priorité** : P1
- **Effort** : XL, incrémental
- **Risque** : HIGH (sécurité distante, fidélité de streaming, iOS, reprise réseau)
- **Catégorie** : nouveau client / mobile / interaction centrale
- **Exécuteur principal** : Grok
- **Reviewer et gatekeeper** : Codex
- **Source de vérité desktop** : contrats sidecar/Rust et journal canonique Atelier
- **Dépendances** : plans 025 et 033 pour les événements et la parité backend;
  plans 020–023 pour le chat, les primitives et le langage visuel
- **Hors périmètre initial** : terminal interactif complet sur iPhone, Git avancé,
  Zotero éditable, génération locale sur l’iPhone, publication App Store publique

## 1. Résultat attendu

Le MVP validé doit permettre, depuis un iPhone connecté au tailnet :

1. de découvrir et authentifier le Mac Atelier;
2. de voir les projets et conversations récentes;
3. d’ouvrir une conversation et charger son historique sans écran blanc;
4. d’envoyer un message et recevoir le streaming en direct;
5. de suivre les états `pending`, `running`, `done`, `error`, `interrupted` et
   `disconnected` sans doublon ni saut de scroll;
6. d’arrêter une génération et répondre aux interactions autorisées;
7. d’ouvrir la Gallery d’un projet;
8. de prévisualiser PDF, PNG/JPEG/SVG, Markdown et LaTeX;
9. d’ajouter un fichier ou une annotation au prochain message;
10. de reprendre proprement après verrouillage de l’écran, changement Wi-Fi/5G,
    perte Tailscale ou redémarrage du backend Mac.

Le MVP ne doit jamais annoncer qu’une action est terminée si le journal canonique
ne contient pas l’événement durable correspondant.

## 2. Décisions d’architecture verrouillées

### 2.1 Modèle client–moteur

```text
Atelier iOS/iPadOS
  ├─ interface mobile et cache local borné
  ├─ rendu chat/Markdown/PDF/images
  └─ transport HTTPS + WSS authentifié
                │
          Tailscale privé
                │
Atelier sur le Mac
  ├─ gateway distante minimale
  ├─ journal canonique / sessions / UI state
  ├─ providers Codex / Claude / Grok / API
  ├─ fichiers, Gallery, Zotero, Git
  └─ sidecar Rust par défaut, Node seulement en fallback de soak
```

- L’iPhone ne lance aucun CLI agent et n’exécute aucun shell arbitraire.
- Le Mac conserve les clés API et les credentials provider.
- Le client mobile ne lit jamais directement les dossiers du Mac.
- La gateway expose une surface dédiée et bornée; elle ne rend pas le sidecar
  desktop brut accessible sur le réseau.
- Tailscale fournit le réseau privé, mais ne remplace ni l’authentification
  applicative, ni l’autorisation, ni la protection CSRF/origin.

### 2.2 Choix UI

Commencer avec **Tauri 2 iOS + React**, en réutilisant les contrats TypeScript et
le vocabulaire visuel Atelier. Réserver Swift/SwiftUI aux ponts réellement natifs :

- notifications;
- partage et document picker;
- haptique;
- état réseau/lifecycle;
- secure storage/Keychain;
- réglage fin du clavier, safe areas et comportement du `WKWebView` si nécessaire.

Ne pas réécrire tout le client en SwiftUI avant d’avoir échoué un budget de
performance reproductible avec la version Tauri optimisée.

### 2.3 Identité visuelle

Le client iOS prolonge **Precision Native** :

- graphite `#1e2124`, surfaces `#24282d` et `#2c2f34`;
- texte principal `#dadee3`, secondaire `#b9bec4`, muted `#90969d`;
- accent orange `#e77f3e` réservé à sélection/running/attention;
- typographie iOS/SF Pro via la pile système;
- rayons 6 px pour les contrôles et 10 px pour les surfaces;
- aucune carte décorative autour de chaque réponse;
- transitions 120–150 ms, sans bounce, transform/opacity seulement;
- boutons primaires neutres forts, jamais grands boutons orange par défaut.

Les valeurs de `src/App.css`, `src/styles/tokens.css` et
`src/styles/primitives.css` sont la source de vérité; éviter une seconde palette
mobile divergente.

## 3. Contrats de qualité et budgets

### 3.1 Performance

Mesurer sur un iPhone physique représentatif, pas uniquement dans Safari desktop :

- scroll conversation : cible 60 FPS; p95 frame ≤ 20 ms;
- aucun long task JavaScript > 50 ms pendant un scroll normal;
- première conversation depuis cache : contenu utile < 500 ms;
- historique distant chaud : contenu utile < 1,2 s sur tailnet sain;
- frappe composer : p95 input latency < 50 ms;
- token visible après réception réseau : p95 < 100 ms;
- aucun rerender complet du transcript pour un token entrant;
- mémoire stable lors de 20 minutes de streaming;
- conversation de référence : 500 messages, 50 blocs code, 20 équations,
  10 images et 5 tableaux sans crash ni scroll dégradé.

Ces nombres sont des budgets de décision. Si un appareil ou WebKit rend une cible
irréaliste, Grok doit produire les traces et proposer un ajustement; il ne modifie
jamais silencieusement la cible.

### 3.2 Fidélité conversationnelle

- `turnId`, `messageId`, `itemId`, `eventId`, `sequence`, `durable` et `origin`
  restent les identifiants canoniques du plan 025.
- Les événements live et replay passent dans le même reducer.
- Un événement est idempotent par `eventId`.
- Toute lacune de séquence déclenche un rattrapage, pas une reconstruction devinée.
- Le client n’infère pas `done` depuis une fermeture de socket.
- Le cache local est une projection remplaçable, jamais une source concurrente.

### 3.3 Sécurité

- HTTPS/WSS uniquement hors loopback.
- Appairage initial explicite avec secret court ou QR à durée de vie limitée.
- Credential long terme stocké dans Keychain, rotatif et révocable côté Mac.
- Jeton distinct par appareil; aucun token sidecar desktop réutilisé.
- Autorisation par scope : lecture chats, envoi, interactions, gallery/fichiers.
- Aucun endpoint de chemin arbitraire; tout fichier est résolu sous un projet
  autorisé après canonicalisation et contrôle anti-traversée.
- Limites de taille, MIME allowlist, timeouts et rate limits sur uploads/downloads.
- Logs sans prompt complet, token, chemin sensible ou contenu de document par défaut.
- Révocation visible depuis Atelier Mac.
- Pas d’exposition publique/Funnel dans le MVP.

## 4. Organisation du code cible

Grok doit d’abord proposer l’emplacement exact après audit. Direction souhaitée :

```text
mobile/                         # client iOS/Tauri, workspace isolé si viable
  src/
    app/                        # shell, navigation, lifecycle
    chat/                       # transcript, reducer, streaming, composer
    gallery/                    # index, filtres, previews
    files/                      # navigateur borné, viewers
    transport/                  # API, WSS, reconnect, auth
    storage/                    # projection locale/versioning
    native/                     # wrappers plugins/ponts iOS
    design/                     # aliases des tokens Atelier
  src-tauri/                    # entrée mobile + plugins/capabilities
  tests/

rust/ ou sidecar gateway/
  remote_api/                   # auth, scopes, routes, WS, file policy

packages/atelier-protocol/      # seulement si l’audit prouve que le partage
                                # évite réellement la duplication
```

Interdiction de copier-coller les types de protocole dans trois emplacements.
Si un package partagé est créé, il doit être petit, versionné, sans dépendance UI
et consommé par des tests de compatibilité desktop/mobile.

## 5. Workflow Grok → Codex

Pour chaque jalon :

1. Grok lit ce plan, `AGENTS.md`, les fichiers cités et les plans dépendants.
2. Grok publie un mini-plan du jalon et le drift check avant modification.
3. Grok implémente uniquement le périmètre du jalon.
4. Grok exécute les tests prescrits et capture les preuves demandées.
5. Grok écrit un handoff selon le gabarit de la section 15.
6. Codex relit le diff, exécute ses propres contrôles et rend un verdict.
7. Grok corrige les findings avant tout jalon suivant.

Codex doit examiner le code final, pas seulement le résumé de Grok. Un test vert
ne remplace pas la revue des invariants de sécurité, de journal et de scroll.

## 6. Jalon A — Audit, ADR et baseline reproductible

### Travail Grok

- Cartographier les chemins réels : bootstrap Tauri, `src/main.tsx`,
  `useSidecarConnection`, `src/lib/ws.ts`, `src/lib/harnessEvents.ts`, composants
  `src/components/chat/`, backend Rust, galerie et politique de fichiers.
- Vérifier les plans 025, 033 et leur état effectif dans le code.
- Identifier les APIs desktop implicitement liées à `127.0.0.1`, à Tauri invoke,
  au filesystem ou aux processus enfants.
- Examiner `src-tauri/Info.plist`, les capabilities Tauri et l’état réel de
  l’initialisation iOS; ne pas supposer qu’un `mobile_entry_point` suffit.
- Établir une baseline desktop : tailles de bundle, tests, nombre de rerenders
  sur un tour streaming, stabilité du reducer et transcript de référence.
- Rédiger deux ADR : architecture client–gateway et stratégie React/Tauri versus
  frontières Swift natives.
- Produire un threat model initial : actifs, frontières de confiance, menaces,
  contrôles et risques résiduels.

### Livrables

- `docs/mobile/ADR-001-client-gateway.md`
- `docs/mobile/ADR-002-ios-ui-runtime.md`
- `docs/mobile/THREAT_MODEL.md`
- `docs/mobile/BASELINE.md`
- matrice « réutiliser / adapter / interdire sur mobile » par module

### Gate Codex A

Codex vérifie que l’ADR repose sur le code actuel, que le sidecar n’est pas exposé
brut et que les budgets sont mesurables. Aucun code produit ne commence avant `GO`.

## 7. Jalon B — Protocole partagé et simulateur déterministe

### Travail Grok

- Extraire ou formaliser les enveloppes minimales nécessaires au mobile.
- Conserver exactement les identités/ordres du journal canonique.
- Écrire un serveur de fixture local capable de rejouer : historique, streaming,
  outils, interactions, erreur, interruption, trou de séquence et reconnexion.
- Créer des transcripts synthétiques petits, moyens et stress (500 messages).
- Introduire un versionnage négocié `protocolVersion` et une réponse explicite en
  cas de client trop ancien/nouveau.
- Ajouter des tests contractuels exécutés contre Rust et, durant le soak, Node.

### Tests obligatoires

- événements dupliqués, out-of-order et manquants;
- reprise depuis `lastSequence`;
- reload durant streaming;
- interaction en attente au reconnect;
- historique ancien incomplet;
- champ inconnu toléré et champ obligatoire absent refusé clairement.

### Gate Codex B

Revue des types, fixtures et propriétés d’idempotence. Codex injecte au moins trois
séquences adversariales non fournies par Grok.

## 8. Jalon C — Gateway distante sécurisée sur le Mac

### Travail Grok

- Ajouter une gateway distante séparée de l’API loopback desktop.
- Implémenter appairage court, jeton par appareil, scopes, rotation et révocation.
- Exposer seulement : health/version, projets, threads, historique paginé,
  stream/replay, send/stop/interaction, gallery index et fichier borné.
- Refuser par défaut toute route non déclarée.
- Appliquer origin/host checks, limite de connexions, rate limiting, timeouts,
  tailles maximales et validation stricte des payloads.
- Canonicaliser les chemins, résoudre les symlinks et vérifier l’appartenance au
  projet avant lecture.
- Émettre des erreurs structurées sans fuite de chemin ou secret.
- Fournir une UI Mac minimale pour voir/révoquer les appareils appairés.
- Documenter une configuration Tailscale Serve privée reproductible; ne jamais
  activer Funnel automatiquement.

### Tests de sécurité obligatoires

- token absent, expiré, révoqué et mauvais scope;
- brute force d’appairage et expiration;
- `../`, chemin absolu, encodage double, symlink sortant;
- MIME mensonger, fichier trop gros, range invalide;
- Host/origin inattendu;
- replay d’une interaction ou d’un send;
- deux appareils et révocation d’un seul;
- redémarrage Mac sans réactivation implicite d’un jeton révoqué.

### Gate Codex C

Codex fait une revue sécurité séparée et tente des requêtes adversariales. Aucun
client réel ne se connecte avant fermeture des findings HIGH/CRITICAL.

## 9. Jalon D — Shell iOS vertical et appairage

### Travail Grok

- Initialiser la cible iOS Tauri 2 dans une structure qui ne perturbe pas le build
  desktop.
- Mettre en place navigation Chats/Gallery/Fichiers/Réglages.
- Implémenter safe areas, mode sombre, Dynamic Type raisonnable, VoiceOver,
  focus visible et cibles tactiles ≥ 44 pt.
- Créer le parcours d’appairage, stockage Keychain et révocation locale.
- Afficher les états : jamais appairé, Mac hors ligne, Tailscale absent,
  authentification expirée, version incompatible et prêt.
- Ajouter un écran diagnostics copiable sans secret.
- Reprendre les tokens Atelier exacts et un contrôle automatisé anti-dérive.

### Slice verticale exigée

Sur un iPhone physique : appairer → lister projets → ouvrir un thread → afficher
20 messages depuis fixture/gateway. Aucun envoi n’est encore requis.

### Gate Codex D

Codex vérifie l’app physique, pas seulement le simulateur : cold start, rotation,
retour arrière, Dynamic Type, VoiceOver de base et verrouillage/déverrouillage.

## 10. Jalon E — Moteur de chat fluide

### 10.1 Store et reducer

- Normaliser les entités par identifiant; ne pas stocker un arbre React complet.
- Séparer état durable, état de transport et état de présentation éphémère.
- Appliquer les événements en O(1) ou coût local borné.
- Conserver le même reducer pour replay et live.
- Exposer des sélecteurs fins par turn/message/item.
- Instrumenter le nombre de commits/rerenders par token.

### 10.2 Streaming

- Bufferiser les petits deltas et flusher au rythme d’affichage, maximum une mise
  à jour visuelle par frame.
- Flusher immédiatement les transitions sémantiques : interaction, erreur, done.
- Ne jamais retarder l’accusé de réception réseau à cause du rendu Markdown.
- Garder une représentation texte légère durant streaming; promouvoir vers le
  rendu final enrichi après stabilisation.
- Planifier KaTeX, Mermaid, coloration syntaxique et tableaux lourds en idle ou
  par tranche interruptible.

### 10.3 Transcript et virtualisation

- Virtualiser par unité stable de turn, pas par ligne de texte.
- Mesurer les hauteurs et préserver l’ancre lors de leur évolution.
- Précharger une petite fenêtre au-dessus et dessous.
- Garder sélection/copie et accessibilité fonctionnelles.
- Désactiver ou adapter la virtualisation lorsqu’elle nuit à VoiceOver.
- Ne pas démonter le turn streaming actif.

### 10.4 Contrat de scroll

Définir trois modes explicites :

1. **pinned** : l’utilisateur est près du bas; suivre le streaming;
2. **reading** : l’utilisateur a remonté; ne jamais voler sa position;
3. **catch-up** : afficher « nouveaux éléments » et revenir au bas sur action.

Cas obligatoires : clavier ouvert/fermé, image chargée tard, KaTeX promu,
rotation, retour background, historique précédent ajouté en haut, changement de
thread et message utilisateur très long.

### 10.5 Composer

- Textarea auto-grow bornée avec scroll interne au-delà.
- Enter/newline cohérent avec clavier mobile; IME/dictée testés.
- Send optimiste avec `clientRequestId` idempotent.
- Bouton Stop remplace Send sans changement de géométrie.
- Context shelf pour attachments; aucun saut lorsque les chips apparaissent.
- Keyboard insets et barre système sans double padding.
- Haptique légère uniquement sur send/stop confirmé, jamais à chaque token.

### Tests et mesures

- Profiler React sur transcript stress;
- métriques FPS/long tasks/mémoire sur appareil;
- compteur de rerenders du transcript et du composer;
- automatisation des trois modes de scroll;
- test de frappe pendant streaming;
- 30 minutes de soak avec messages, outils, code et images.

### Gate Codex E — bloquant produit

Codex reproduit les mesures et inspecte visuellement le chat sur iPhone. Si le
budget échoue : profiler d’abord, optimiser ensuite. SwiftUI ne devient une option
que si une preuve montre une limite structurelle de WKWebView après correction
des rerenders, du Markdown et de la virtualisation.

## 11. Jalon F — Résilience réseau et lifecycle iOS

### Travail Grok

- Machine d’état : offline, connecting, authenticating, syncing, live, degraded.
- Backoff exponentiel avec jitter et plafond; un seul reconnect actif.
- Reprise par `lastSequence` avec snapshot si la fenêtre de replay est expirée.
- File d’envoi locale idempotente; statut pending clair et action retry manuelle.
- Distinction entre message non envoyé, envoyé sans ack et ack durable.
- Gestion foreground/background, verrouillage, changement Wi-Fi/5G et Tailscale.
- Ne pas promettre un stream continu lorsque iOS suspend l’app; resynchroniser au
  foreground depuis le journal.
- Cache versionné, migration testée et purge bornée.

### Scénarios obligatoires

- mode avion 30 s pendant streaming;
- Mac endormi puis réveillé;
- backend redémarré avec nouveau port interne;
- Tailscale désactivé/réactivé;
- app tuée après send avant ack;
- même thread ouvert sur Mac et iPhone;
- 1 000 événements à rattraper;
- version serveur devenue incompatible.

### Gate Codex F

Codex réalise les coupures sur appareil physique et vérifie absence de doublons,
perte silencieuse, faux `done` et boucle de reconnexion agressive.

## 12. Jalon G — Gallery et fichiers scientifiques

### Gallery

- Index paginé avec miniatures, type, taille, date et statut workflow.
- Filtres Tous/PDF/Figures/LaTeX/Données cohérents avec le desktop.
- Chargement progressif, cache miniature et placeholders stables.
- Pas de téléchargement pleine résolution pour afficher la grille.
- Ouvrir, partager, annoter et ajouter au chat selon scope.

### Viewers

- PDF : lecteur natif ou solution iOS éprouvée, zoom/pan, page courante, recherche
  si disponible, reprise de position et partage.
- PNG/JPEG : zoom/pan fluide, métadonnées essentielles, pleine résolution à la
  demande.
- SVG : rendu sûr, scripts désactivés/sanitisés, fallback raster.
- LaTeX/Markdown/code : lecture d’abord; édition légère seulement après stabilité
  du MVP. Police mono, numéros de lignes optionnels, recherche et copie.
- Les fichiers trop gros montrent taille et confirmation avant téléchargement.

### Politique fichiers

- API par `projectId` + identifiant opaque, jamais chemin fourni par le client.
- Range requests pour PDF et gros fichiers.
- ETag/version afin d’éviter un aperçu périmé.
- Aucun HTML de projet exécuté dans le contexte privilégié de l’app.
- Annotation et « Ajouter au chat » créent des objets durables et attribuables.

### Gate Codex G

Codex teste de vrais PDF/PNG/LaTeX du projet, fichiers longs, noms Unicode,
orientation, zoom, mémoire et refus d’un chemin hors projet.

## 13. Jalon H — Notifications, interactions et finition native

- Notifications opt-in pour done, error et interaction requise.
- Contenu minimal par défaut; aucune donnée scientifique sensible sur écran
  verrouillé sans choix explicite.
- Deep link vers le bon projet/thread/interaction.
- Approvals et elicitation rendues depuis le contrat générique du plan 025.
- Double soumission interdite; état terminal autoritaire du serveur.
- Menus contextuels, partage, copie, haptique et document picker natifs.
- Badges cohérents et réinitialisés après consultation réelle.
- Icône/app name/permissions iOS propres, sans demander une permission avant son
  premier besoin contextuel.

### Gate Codex H

Revue des permissions, notifications verrouillées/déverrouillées, deep links,
accessibilité, gestes et cohérence avec l’app Mac.

## 14. Jalon I — Hardening, distribution privée et documentation

- Matrice de compatibilité client/serveur.
- Migration et rollback documentés.
- Build reproductible iOS, signature et installation privée définies.
- Aucun secret dans bundle, logs, fixtures ou captures.
- Checklist de révocation d’un appareil perdu.
- Health/diagnostics lisibles dans Mac et iOS.
- Runbook : Mac hors ligne, Tailscale, pairing, certificat, gateway, cache corrompu.
- Politique de rétention cache et données personnelles.
- Test de mise à jour client avec serveur ancien et inversement.
- Soak multi-appareil Mac + iPhone + iPad.

### Gate Codex I

Audit final complet : sécurité, contrat, performance, UX, accessibilité, build et
documentation. Codex produit un rapport findings avec sévérité et preuves.

## 15. Gabarit de handoff obligatoire pour Grok

À la fin de chaque jalon, Grok répond dans ce format :

```markdown
## Handoff jalon X

### Périmètre livré
- ...

### Fichiers modifiés
- `chemin` — raison

### Contrats/invariants touchés
- ...

### Tests exécutés
- `commande` → résultat exact

### Mesures appareil
- appareil / iOS / scénario / résultat

### Preuves visuelles
- chemin capture ou vidéo + état illustré

### Limites et risques restants
- ...

### Drift et changements hors plan
- aucun, ou liste explicite

### Demande à Codex
- `GO`, `GO avec corrections`, ou `STOP`
```

Grok ne doit pas écrire « tout fonctionne » sans relier chaque affirmation à une
commande, une trace, une capture ou un test appareil.

## 16. Checklist de revue Codex par jalon

Codex doit au minimum :

1. lire `git status`, le diff complet et les fichiers nouveaux;
2. vérifier que les changements ne masquent pas le worktree existant;
3. rechercher duplications de protocole et états concurrents;
4. lancer les tests ciblés indépendamment;
5. injecter un scénario négatif absent du handoff;
6. vérifier le comportement dans le vrai runtime pertinent;
7. comparer aux budgets et critères du jalon;
8. classer les findings : CRITICAL, HIGH, MEDIUM, LOW;
9. bloquer la suite sur CRITICAL/HIGH;
10. documenter le verdict et les corrections attendues.

## 17. Stratégie de tests globale

### Unitaires

- reducer/journal/idempotence;
- sélecteurs et buffering;
- machine réseau;
- validation auth/scopes/path;
- cache/migrations;
- scroll state math;
- formatage de présentation sans inférence de succès.

### Contractuels

- gateway Rust ↔ protocole partagé ↔ client;
- live/replay identiques;
- versions compatibles/incompatibles;
- fixtures des providers et interactions.

### Intégration

- pairing, token rotation/révocation;
- send/ack/durable;
- reconnect/replay;
- gallery/file ranges;
- background/foreground;
- notifications/deep links.

### UI/E2E

- navigation à une main;
- historique long et streaming;
- composer + clavier + IME/dictée;
- scroll pinned/reading/catch-up;
- PDF/image/LaTeX;
- Dynamic Type, VoiceOver et reduced motion;
- erreurs et états hors ligne.

### Performance

- appareil physique, build release/profiling;
- transcript stress stable en fixture;
- traces versionnées avec modèle appareil/iOS/commit;
- comparaison automatique ou tableau avant/après.

## 18. Commandes de vérification minimales

Grok doit adapter ces commandes à la structure réellement créée, mais ne peut en
supprimer une sans justification :

```bash
# Desktop et contrats existants
npm run typecheck
npm run build:web
npm run test:frontend
npm run test:sidecar
npm run test:rust
npm run check:backend-policy

# Suite agrégée
npm run verify

# Gallery si touchée
npm run test:gallery
npm run verify:e2e

# Mobile — noms définitifs à ajouter au package
npm run mobile:typecheck
npm run mobile:test
npm run mobile:build

# Rust gateway — cibler les packages exacts
cargo test --manifest-path rust/Cargo.toml --locked

# iOS
xcodebuild -showBuildSettings ...
xcodebuild build ...
xcodebuild test ...
```

La validation finale suit aussi intégralement le protocole de relance
`AGENTS.md`; aucune conclusion depuis le code source seul.

## 19. Done criteria du programme

- [ ] L’iPhone s’appaire et se révoque sans exposer les credentials desktop.
- [ ] Les projets/threads/historiques proviennent de la source canonique.
- [ ] Live et replay utilisent le même reducer et ne dupliquent aucun item.
- [ ] Send/stop/interactions sont idempotents et correctement attribués.
- [ ] Le chat respecte les budgets sur appareil physique avec transcript stress.
- [ ] Le scroll ne vole jamais la lecture pendant streaming.
- [ ] Le composer reste fluide durant un gros rendu Markdown.
- [ ] Les reprises réseau/lifecycle n’inventent ni perte ni succès.
- [ ] Gallery et viewers PDF/PNG/LaTeX fonctionnent sur données réelles.
- [ ] Les chemins hors projet et fichiers dangereux sont refusés.
- [ ] Les notifications respectent confidentialité et deep link correct.
- [ ] Dynamic Type, VoiceOver, reduced motion et touch targets sont vérifiés.
- [ ] Aucun finding sécurité/performance CRITICAL ou HIGH reste ouvert.
- [ ] Desktop ne régresse pas et son protocole reste compatible.
- [ ] Build, installation privée, diagnostic et révocation sont documentés.

## 20. STOP conditions

Grok arrête immédiatement le jalon et demande un verdict Codex si :

- le plan 025 ou le journal canonique ne permet pas la reprise par séquence;
- un changement exige d’exposer le sidecar desktop brut au tailnet;
- un endpoint doit accepter un chemin arbitraire fourni par le mobile;
- le worktree contient un chevauchement non compris avec les mêmes fichiers;
- la parité Rust/Node diverge sur un contrat utilisé par le mobile;
- les credentials ne peuvent pas être isolés par appareil;
- un test de sécurité HIGH/CRITICAL échoue;
- une optimisation casse VoiceOver, sélection/copie ou fidélité historique;
- les métriques sont prises uniquement en dev/simulateur alors que le jalon exige
  un appareil physique;
- une réécriture SwiftUI globale est proposée sans profil montrant une limite
  structurelle du chemin Tauri/WKWebView;
- la suite demanderait Funnel ou une exposition Internet publique;
- une modification desktop visible est nécessaire mais absente du périmètre.

## 21. Ordre de livraison conseillé

```text
A Audit/ADR
  → B Protocole + fixtures
    → C Gateway sécurisée
      → D Shell iOS en lecture
        → E Chat fluide
          → F Résilience réseau
            → G Gallery/fichiers
              → H Natif/notifications
                → I Hardening/distribution
```

Le premier objectif démontrable est la fin du jalon E : un chat réel, fluide et
fidèle sur iPhone. Gallery/fichiers viennent ensuite afin de ne pas diluer la
preuve principale dans une app large mais médiocre.

## 22. Instruction de démarrage à donner à Grok

```text
Lis AGENTS.md et plans/034-ios-companion-chat-native-fluidity.md en entier.
N’implémente que le jalon A. Fais d’abord le drift check et l’audit du code réel.
Produis les quatre documents exigés, les mesures baseline disponibles et le
handoff exact de la section 15. Ne commence aucun code de gateway/mobile avant
le verdict explicite de Codex.
```
