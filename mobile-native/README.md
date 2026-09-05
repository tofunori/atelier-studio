# Atelier — prototype SwiftUI natif

Prototype iPhone/iPad iOS 26+, isolé du client React/Tauri dans `mobile/`.
SwiftUI pour les écrans, TabView/NavigationStack pour la navigation système,
TextEditor avec sélection pour LaTeX, PDFKit pour le PDF. Aucun WebView.

Les fichiers de démonstration, documents importés, annotations et messages sont
conservés seulement en mémoire. Aucun original n’est modifié.
Le PDF est un exemple fixe ; l'édition de source ne déclenche pas de compilation.
Le brouillon et le numéro de page survivent au changement de surface.
Le menu « … » et le bouton « + » permettent d’ouvrir un PDF ou un texte UTF-8
(.tex compris) via le sélecteur Fichiers natif. Importer une source retire le PDF
précédent pour éviter toute confusion entre documents non liés.

Sélectionner un passage → Annoter → rédiger une note → Envoyer au chat.
Le message conserve le texte sélectionné, le fichier, la page ou les lignes.
Les annotations PDF utilisent des surlignages PDFKit en mémoire avec la note.
La sélection est capturée avant ouverture de la fiche et du clavier.

Le champ de saisie propose un choix de modèle, un niveau de réflexion et les
options Web/Analyse. Le catalogue est une fixture issue du client mobile,
pas une liste de capacités ou disponibilités live. Chaque message conserve une
copie des réglages au moment de l’envoi. Aucun outil ni modèle n’est exécuté.
Le zoom et la position exacte dans la page ne sont pas encore restaurés après
une bascule Source/PDF. La gateway du Mac n'est pas encore connectée.

## Construire

Depuis la racine du dépôt, avec Xcode 26+ et XcodeGen :

```sh
xcodegen generate --spec mobile-native/project.yml
xcodebuild -project mobile-native/AtelierNative.xcodeproj \
  -scheme AtelierNative -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/atelier-native-derived \
  build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-
```

Projet Xcode généré et produits exclus de Git. Le package `AtelierUI` peut aussi
être chargé avec le lanceur SwiftUI Preview du plugin Build iOS Apps.
Les applications appareil réel nécessitent une configuration de signature.

## Visualisation dans Codex

Le skill `build-ios-apps:ios-simulator-browser` décrit le miroir `serve-sim`.
Utiliser le simulateur dédié retourné par `xcrun simctl list devices available`,
installer et lancer `com.tofunori.atelier.swiftui.preview`, puis ouvrir l'URL
locale affichée par `npx serve-sim@latest <UDID>` dans Codex.
Arrêter le helper par UDID après utilisation ; ne pas arrêter les autres miroirs.

## Validation

5 septembre 2026 : compilation iOS Simulator et 6 tests XCTest réussis :
annotation source/citation/brouillon, surlignage et page PDF, rejet note vide,
réglages immuables par message, import source sans PDF/selection périmés,
numéros de lignes CRLF. Revue indépendante, deux corrections appliquées.

Parcours vérifié dans le miroir du simulateur : sélection tactile dans LaTeX,
fiche Annoter, saisie d’une note et envoi au chat avec citation, choix de modèle,
réflexion élevée et ouverture du menu d’outils. Le rendu PDF et son zoom ont été
inspectés ; le geste tactile de sélection PDF et l’import via Fichiers restent
à valider manuellement. Le surlignage PDF est couvert par XCTest/PDFKit.

Aucun test sur appareil physique, sauvegarde persistante ou appel réel au Mac.

## Galerie native et association simplifiée

La galerie affiche les fichiers importés et l’index de la passerelle Atelier.
Recherche et filtres Tous/PDF/Figures/LaTeX/Texte ; PDFKit, images zoomables et
éditeur de texte natif. Un fichier non pris en charge est indiqué sans ouverture.
Les documents conservent leurs éditions et annotations en mémoire entre ouvertures.
Les miniatures distantes sont chargées sous 5 Mo ; ouverture limitée à 50 Mo.

Sur le Mac : Réglages → Appareils distants → Ajouter → Copier le lien de connexion.
Sur iOS : Galerie → Connecter le Mac → Coller. Le lien `atelier-native://pair`
peut aussi être ouvert directement. L’adresse et le code temporaire sont inclus ;
le jeton de l’appareil est conservé dans le trousseau, jamais dans les préférences.
La saisie adresse/code reste disponible. HTTPS Tailscale sur le port 8443 pour le lien automatique.
Le chat reste un prototype local ; l’association active ici la galerie uniquement.

Le panneau macOS communique avec la passerelle par `remote/pair.sock`, mode 0600,
réservé au compte macOS. Il ne demande plus de jeton administrateur au frontend.
Les routes administratives HTTP conservent leurs contrôles loopback et jeton.

Validation galerie : 10 tests XCTest passent (les six tests initiaux plus
conservation source/brouillon, annotations PDF, ouverture image et rejet PDF invalide).

### Connexion dans le simulateur Codex

Le presse-papiers du Mac et celui du simulateur ne sont pas automatiquement
partagés. `python3 mobile-native/scripts/connect-simulator.py <UDID>` génère un
code temporaire via le canal local et lance l’app avec le lien ; ce point d’entrée
n’existe que dans une compilation Simulator. Aucun jeton administrateur n’est lu.

Le lien utilise HTTPS Tailscale sur le port 8443. Aucune exception HTTP ATS
n’est activée. Tailscale Serve relaie vers 127.0.0.1:18765, où un adaptateur local
de la passerelle partage son état avec l’écoute Tailscale. Le relais final est vérifié : health HTTPS 200, routes admin 404, interface web 200.
Association iOS réussie et vrais artefacts manuscript_ch1 affichés dans le simulateur.
La compilation Simulator doit être signée ad hoc pour utiliser le trousseau.

Validation en direct finale : ouverture du PDF figS_smoke_modis_vs_raqdps.pdf depuis
la galerie manuscript_ch1, puis relance et réinstallation sans nouveau lien :
connexion restaurée par le trousseau. Aucun test sur iPhone physique.
