# Atelier pour iPhone (`mobile-native/`)

App SwiftUI native, iOS 26 ou plus récent, iPhone et iPad. C'est le client
mobile d'Atelier : le client web React/Tauri `mobile/` est gelé depuis le
2026-09-28 et n'est plus livré. L'app parle au Mac par la passerelle
`atelier-remote`, dans le tailnet Tailscale.

L'historique des étapes et des validations est dans [REDESIGN.md](REDESIGN.md),
[CHAT_POLISH.md](CHAT_POLISH.md) et [audits/](audits/).

## Ce que fait l'app

- **Chat** : les conversations du Mac, avec la réponse en direct pendant
  qu'elle s'écrit. Créer une conversation, envoyer, arrêter, choisir le modèle
  et l'effort, mettre un message en attente ou réorienter un tour, citer un
  passage, modifier un message, répondre aux approbations simples.
- **Galerie** : les fichiers des projets indexés par le Mac, avec recherche,
  filtres et aperçus (PDF, figures, LaTeX, code, données).
- **Articles** : la bibliothèque Zotero du Mac (recherche, collections, PDF,
  notes), avec un cache local.
- **Lecture PDF** : mode lecture et annotations (surlignage, soulignement,
  note). Les annotations faites sur l'iPhone sont enregistrées dans l'app puis
  envoyées au Mac ; celles du Mac s'affichent sur l'iPhone.
- **Éditeur LaTeX et texte** : coloration, lecture LaTeX simplifiée,
  enregistrement sur le Mac avec détection des conflits.
- **Calculs** : suivi en lecture seule des calculs du Mac, du NAS et de Narval.
- **Dictée**, et **pièces jointes** depuis la Photothèque, Fichiers ou la
  galerie.

## Architecture

| Élément | Rôle |
|---|---|
| `App/` | Point d'entrée, `Info.plist`, icônes |
| `Sources/AtelierUI/` | Package Swift : écrans SwiftUI, PDFKit, modèles réseau |
| `Renderer/chat-renderer.ts` | Rendu riche des messages (Markdown, tableaux, KaTeX, code) affiché dans un `WKWebView` |
| `Sources/AtelierUI/Resources/ChatRenderer/` | Bundle généré du rendu, committé |
| `Tests/` | Tests XCTest |
| `project.yml` | Projet XcodeGen (le `.xcodeproj` n'est pas suivi par Git) |
| `Config/Signing.xcconfig` | Signature ; inclut `Config/Local.xcconfig` s'il existe |

Passerelle : `rust/crates/atelier-remote` (binaire `atelier-remote-gateway`).
Atelier.app la lance quand Tailscale est actif ; elle écoute sur l'IP Tailscale
du Mac (port 18765) et sur `127.0.0.1:18765`. Tailscale Serve publie cette
écoute en HTTPS dans le tailnet, sur le port 8443 (jamais Funnel) :

```sh
tailscale serve --bg --https=8443 http://127.0.0.1:18765
```

Association : sur le Mac, Réglages → Général → Avancé → Appareils distants
(iPhone) → Ajouter → Copier le lien de connexion. Sur l'iPhone, ouvrir le lien
`atelier-native://pair?address=https://<mac>.<tailnet>.ts.net:8443&code=…`, ou
le coller dans Galerie → Connecter le Mac. Le jeton de l'appareil reste dans le
trousseau iOS. Détails et révocation : [docs/mobile/TAILSCALE_SERVE.md](../docs/mobile/TAILSCALE_SERVE.md).

## Compiler et tester

Swift ne compile pas sur Linux : tester sur un Mac avec Xcode 26 et XcodeGen
(`brew install xcodegen`), depuis la racine du dépôt.

```sh
xcodegen generate --spec mobile-native/project.yml
xcodebuild -project mobile-native/AtelierNative.xcodeproj -scheme AtelierNative \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  test CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-
```

Rendu du chat, après une modification de `Renderer/chat-renderer.ts` :

```sh
node mobile-native/scripts/build-chat-renderer.mts   # régénère le bundle à committer
node mobile-native/scripts/test-chat-renderer.mts    # jsdom
node mobile-native/scripts/test-chat-wrap.mts        # WebKit, 320 à 430 px
```

La CI (`.github/workflows/ci.yml`, job `mobile-native`, runner `macos-26`)
vérifie à chaque pull request que le bundle du rendu est à jour, lance ces deux
tests, génère le projet et exécute les tests XCTest sur un simulateur iPhone.

Dans le simulateur, `python3 mobile-native/scripts/connect-simulator.py <UDID>`
associe l'app au Mac sans passer par le presse-papiers.

## Installer sur l'iPhone

L'installation met à jour l'app en place : **ne jamais supprimer l'app de
l'iPhone avant de réinstaller**. Ses annotations, brouillons et son association
au Mac vivent dans l'app et disparaîtraient avec elle.

1. Une fois : `cp mobile-native/Config/Local.xcconfig.example mobile-native/Config/Local.xcconfig`,
   puis y mettre l'identifiant de l'app **déjà installée** sur l'iPhone et
   l'équipe Apple (Personal Team avec un compte gratuit). Ce fichier est ignoré
   par Git. Xcode doit être connecté au compte Apple (Settings → Accounts).
2. Brancher l'iPhone en USB, ou l'avoir jumelé pour le débogage réseau :
   Xcode → Window → Devices and Simulators → cocher « Connect via network ».
   L'installation par Wi-Fi ne marche qu'après ce jumelage, avec l'iPhone et le
   Mac sur le même réseau.
3. Lancer :

   ```sh
   mobile-native/scripts/install-iphone.sh
   ```

Le script génère le projet, compile pour iOS avec `-allowProvisioningUpdates`,
puis installe sur le premier iPhone joignable avec `xcrun devicectl`, sans
désinstaller. Il refuse d'installer si l'iPhone n'a pas déjà une app de cet
identifiant (sinon iOS en créerait une seconde, vide) ; pour une toute première
installation : `ATELIER_IPHONE_FIRST_INSTALL=1`. Autres réglages en tête du
script (`ATELIER_IPHONE_DEVICE` pour viser un appareil précis).

### Renouvellement automatique

Avec un compte Apple gratuit, l'app cesse de s'ouvrir 7 jours après la création
de son profil ; ses données restent intactes et une réinstallation la
réactive. Un LaunchAgent relance le script chaque lundi à 9 h :

```sh
sed -e "s#__HOME__#$HOME#g" -e "s#__REPO__#$HOME/Documents/atelier-studio#g" \
  mobile-native/scripts/renew-iphone.launchd.plist.example \
  > ~/Library/LaunchAgents/com.atelier.iphone-renew.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.atelier.iphone-renew.plist
launchctl kickstart gui/$(id -u)/com.atelier.iphone-renew   # essai immédiat
```

Journal : `~/Library/Logs/atelier-iphone-renew.log`. En cas d'échec, une
notification macOS le signale. Le script indique la date d'expiration du
nouveau profil ; s'il écrit « Xcode ne l'a pas renouvelé », lancer le
renouvellement chaque jour (retirer la clé `Weekday` du plist). Pour retirer
le LaunchAgent : `launchctl bootout gui/$(id -u)/com.atelier.iphone-renew`.

## Limites connues

- Signature gratuite : 7 jours, renouvelés par le script ci-dessus. Le Mac doit
  être allumé, connecté au compte Apple, et l'iPhone joignable au moment du
  renouvellement.
- Pas de notifications push Apple (elles exigent un compte payant). Les
  alertes passent par l'app ntfy, configurée dans Réglages → Notifications de
  l'app.
- Le Mac doit être éveillé, Atelier ouvert et Tailscale connecté des deux côtés :
  l'iPhone n'a pas de serveur à lui.
- Les autorisations d'outils complexes et la compilation LaTeX restent sur le
  Mac.
