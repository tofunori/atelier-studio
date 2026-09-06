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
À cette étape initiale, seule la galerie était connectée ; le chat réel est décrit ci-dessous.

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

## Aperçus texte et code

Les cartes de texte, LaTeX, Python, Markdown, CSV/JSON et autres formats source
compatibles affichent le début réel du fichier (requête Range limitée à 64 Kio,
900 caractères affichés). Les images/PDF conservent leurs miniatures ; les formats
binaires non pris en charge et les visuels de plus de 5 Mo gardent une icône.

L’éditeur natif UITextView colore les commandes/commentaires LaTeX et les
mots-clés, chaînes, commentaires et nombres Python ; règles aussi pour R,
Swift, JS/TS, Rust et JSON. La coloration est lexicale, pas un serveur de langage.
Elle couvre les premiers 200 000 caractères ; tout le texte reste éditable.
La sélection Unicode est conservée pendant la recoloration et la recréation
éditeur, avec le même parcours Annoter → note → chat local.

Validation coloration : 14 tests XCTest réussis, dont chaînes/commentaires Python,
pourcent échappé LaTeX, édition et citation Unicode, restauration de sélection
à la recréation de l’éditeur. Revue indépendante et correction appliquée.

## Conversations réelles du Mac

L’onglet Chat lit les conversations existantes et l’historique du runtime,
puis reçoit les événements en NDJSON via HTTPS. Il permet de créer une
conversation, d’envoyer un message, d’arrêter une réponse et de choisir le
modèle et l’effort parmi les valeurs exposées par le fournisseur du Mac.
Le flux est filtré par conversation et le jeton est revérifié avant chaque
événement et heartbeat ; une révocation coupe l’abonnement.

Les brouillons restent distincts par conversation. L’historique et le flux
sont dédupliqués par eventId ; les fragments d’un tour terminé sont ignorés.
Les annotations transmettent le nom, la page/les lignes, le passage et la note
au chat choisi. Le brouillon est conservé si la transmission échoue.

Limites : autorisations d’outils à traiter sur le Mac ; éditions/surlignages
des documents en mémoire seulement ; aucune sauvegarde distante ni compilation
LaTeX déclenchée depuis iOS. Un accusé réseau confirme la transmission au
runtime, pas l’exécution du fournisseur. Pas de test sur iPhone physique.

Validation automatisée : 19 tests XCTest, tests du crate atelier-remote,
TypeScript/Vite et 654 tests sidecar passent. Revue statique indépendante
effectuée, avec corrections du changement de conversation, des reprises de
flux et de la révocation.

Validation en direct (simulateur connecté au Mac) : catalogue et création Codex,
message « validation iOS. réponds juste ok » → réponse « ok » ; sélection LaTeX
notes.tex ligne 7 (« espace »), annotation → réponse « reçu » dans le même chat.
Le bundle Mac a été reconstruit et son chemin de processus vérifié.
Dernier filtrage du menu de création aux cinq fournisseurs acceptés : compilé,
non réinstallé dans le simulateur afin de préserver une saisie utilisateur en cours.

## Pièces jointes et Photos

Dans la galerie, le menu ⋯ et l’appui long proposent Afficher / Joindre au chat.
Le lecteur propose aussi Joindre au chat pour le fichier ouvert. Le brouillon
affiche les pièces jointes avec aperçu et retrait, séparément pour chaque chat.
Sans conversation active, le sélecteur de conversations s’ouvre.

Le bouton + du chat propose Galerie, Photothèque (PhotosPicker natif) et Fichiers.
Les photos sélectionnées sont converties en JPEG, côté long maximal 2048 pixels,
avant transfert. Les HEIC/TIFF de Fichiers sont aussi convertis. Six pièces
jointes maximum ; les imports locaux sont limités à 8 Mo chacun. Les références
de galerie restent soumises à la limite existante de 50 Mo.

La passerelle exige files:write pour importer, chat:send et files:read pour
transmettre les références. Elle résout les identifiants opaques et fournit les
images en inputs local_image au runtime ; les autres fichiers sont référencés
par leur chemin vérifié dans le contexte. Les imports sont conservés dans
mobile-uploads sous les données Atelier, quota de 128 Mo par appareil.
Un réessai identique réutilise le fichier par empreinte SHA256 et nom.
L’envoi attend l’événement utilisateur corrélé du runtime avant de retirer les
pièces jointes ; refus ou confirmation absente conservent le brouillon.
Les approbations simples de commandes peuvent être autorisées une fois ou refusées
depuis leur bloc iPhone. La confirmation attend l’événement answered du Mac ;
les demandes expirées restent inactives. Les questions structurées et permissions
spécifiques de connexion d’un outil peuvent encore nécessiter le Mac.

Validation automatisée : 23 tests XCTest ; 27 tests Rust (dont 20 de sécurité),
TypeScript/Vite et 654 tests sidecar. Revue indépendante appliquée.

La création de conversation passe par upsertThread du runtime, avec confirmation
du nouvel ID. La passerelle ne réécrit plus threads.json quand le runtime est
connecté ; cela évite qu’un chat vide disparaisse lors d’une sauvegarde du Mac.

Validation interactive : PhotosPicker → image rouge/bleu → pièce jointe → réponse
correcte du modèle sur les deux couleurs. Menus galerie et attachement depuis
le lecteur vérifiés dans le simulateur. La référence JSON atteint bien le runtime
et ses demandes d’outils ; lecture finale du contenu non confirmée, car elle a
rencontré des autorisations. Aucun test sur iPhone physique.

Les blocs de tools/interaction affichent les détails disponibles du flux. La
configuration web/MCP demeure celle du moteur sur le Mac ; aucun nouveau
commutateur Web ni installation Firecrawl n’a été ajouté dans cette étape.

Présentation compacte des outils : les événements consécutifs d’un même tour
sont regroupés dans une ligne d’activité sobre. Son libellé évolue pendant
le travail, avec un symbole animé (désactivé par Réduire les animations).
Un toucher ouvre les détails dans une feuille ; les approbations en attente
restent visibles et accessibles directement dans le chat.

Reprise après redémarrage Mac : avant envoi, les pièces jointes distantes
réindexent leur projet et valident leur identifiant exact. Les aperçus relancent
aussi cette résolution si la passerelle répond fichier inconnu. Les noms seuls
ne servent jamais de remplacement. Le flux du chat conserve ses réessais
automatiques toutes les trois secondes et l’association du trousseau.

Indexation complète : le serveur parcourt désormais tous les sous-dossiers
admissibles sans le plafond prématuré de 1 000 fichiers ni la limite de profondeur
de 10 dossiers. Un instantané trié (10 minutes, 8 conservés maximum) fournit des
pages de 500 entrées ; les clients Swift et web suivent automatiquement toutes
les pages. Les dossiers cachés/dépendances et les liens symboliques restent exclus.
Tests : projet de 1 011 fichiers, LaTeX profond, suppression entre pages,
chargement de plusieurs pages dans les clients.

Accueil : entrée directe dans les conversations, recherche et création, avec
deux onglets Chats/Galerie. Le dernier onglet est restauré au lancement.
Sur iPhone, le document est poussé depuis la galerie avec retour au chat ;
sur iPad, le chat et la galerie/le document partagent l’écran. Le retour à la
liste conserve le brouillon et fusionne les pièces jointes en attente.

Citations du chat : sélection native dans une réponse/message → Ajouter au
message. Le passage apparaît au-dessus du champ de saisie, retirable, sans
remplacer le brouillon. Une citation par chat ; une nouvelle sélection remplace
la précédente. À l’envoi, le passage est inclus comme citation dans le prompt ;
seul un envoi confirmé retire la citation capturée.

Défilement du chat : suivi de la hauteur du fil pendant le streaming vers un
repère fixe en bas. Remonter manuellement suspend le suivi ; le bouton flèche
le réactive. Validation simulateur : réponse réelle de 40 lignes suivie sans
geste, remontée manuelle, puis retour à la ligne 40 avec la flèche.
