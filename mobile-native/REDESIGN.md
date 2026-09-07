# Refonte native — 6 septembre 2026

## Fonctionnalités implémentées

- Navigation Chats, Galerie, Articles ; espace de travail partagé sur iPad et thèmes système, clair, noir.
- Composer unique avec citation repliable, pièces jointes, choix de modèle et jauge d’effort ouvrant un panneau flottant à crans ; masquage des onglets pendant la saisie.
- Annotation de texte, PDF et figures ; choix de conversation, fichier joint et zone rectangulaire normalisée pour les figures.
- Lecture LaTeX simplifiée, source à édition explicite, sélection reliée au passage original. Une sélection ambiguë renvoie vers la source. Ce lecteur ne remplace pas une compilation LaTeX.
- Proposition de reformulation rattachée au message concerné, comparaison avant/après et application explicite. Une source modifiée ou un passage ambigu empêche l'application.
- Sauvegarde des textes sur le Mac avec comparaison de l'original et rejet des conflits ; rechargement conservant une copie récupérable du brouillon.
- Articles Zotero : recherche, collections, PDF et notes avec cache local ; sauvegarde locale distincte de la synchronisation Zotero.
- Écriture Zotero via l'API locale du Mac : autorisation Zotero, clés stables contre les doublons, contrôle des versions et relecture du contenu écrit avant confirmation. Le client iOS ne reçoit pas la clé d'écriture Zotero.

## Validation et activation

Les vérifications TypeScript, Vite, les 654 tests sidecar, les 31 tests Rust et
les 37 tests XCTest iOS passent. Le build signé pour l'appareil réussit et la
nouvelle version est installée sur l'iPhone associé (`com.tofunori.atelier.companion`).
Une revue indépendante statique a couvert le rattachement des propositions,
les conflits de source et les écritures Zotero.

Sur simulateur, les thèmes, la conservation du brouillon lors du choix de modèle,
la sélection d'une zone de figure et la fiche d'annotation ont été inspectés.
Un envoi réel de figure à une conversation de validation a reçu la réponse attendue.

Après autorisation de l'utilisateur, le bundle Mac a été reconstruit et relancé
depuis ce dépôt. Les chemins des processus application, serveur et passerelle
ont été vérifiés. La passerelle résiduelle précédente a également été arrêtée.
Une sauvegarde réelle sur un fichier temporaire a réussi ; une seconde requête
avec l'ancienne version a reçu HTTP 409 sans écraser le contenu. Le fichier a
été supprimé et l'accès temporaire de validation révoqué.

La passerelle lit 321 articles et 19 collections Zotero. Un PDF de 3 510 820 octets
a été téléchargé et son format vérifié. Dans le simulateur, le catalogue puis le
PDF de Draeger et Radić (2026) ont été ouverts et inspectés.
L'écriture dans la bibliothèque Zotero réelle reste non testée ; aucune annotation
de test n'y a été ajoutée. Les protections d'écriture sont couvertes par les tests
et la revue statique. L'iPhone reste verrouillé : installation confirmée, mais
ouverture automatique impossible.

## Limites connues

Le cache PDF n'a pas encore de quota ni de commande de rafraîchissement dédiée.
La position précise du lecteur PDF n'est pas persistée entre les redémarrages.
Le parcours iPad et l'ensemble des sélections tactiles ne sont pas encore validés.
L'édition de source ne lance pas de compilation LaTeX.

## Intégration du chat et de l’expérience native — 6 septembre, après-midi

### Nouveaux comportements

- Édition dans une fiche dédiée, annulation sans modification, branches de conversation et navigation des versions ; régénération à partir du message d’origine. Les contextes remplacés ne sont pas envoyés au fournisseur. Les éditions imbriquées retrouvent la famille du premier message.
- Reprise d’un envoi avec le même identifiant, confirmation par le journal et retrait du message provisoire après accusé perdu. Une erreur avant transmission rend la demande réessayable sans permettre de changer sa charge sous le même identifiant.
- Identité du bloc de texte conservée entre streaming et réponse finale ; le renderer réconcilie les éléments existants au lieu de reconstruire tout le message. La sélection suspend les mises à jour visuelles.
- Réglages persistants : accent, thème, taille, densité, police du lecteur, contraste, mouvement, suivi de réponse et activité développée. Dynamic Type et Réduire les animations système restent prioritaires.
- Travail du Mac : détails réels des outils et sorties de commandes, changements de fichiers transmis par le fournisseur, comparaison des extraits avant/après lorsqu’ils existent, précision au tour en cours et arrêt.
- File locale persistante avec pièces jointes, réordonnancement et retrait. Elle avance uniquement après une fin réussie reçue dans la conversation ouverte. Erreur ou arrêt met la file en pause ; un envoi incertain demande une reprise explicite.
- Dictée avec autorisations iOS, transcription relue avant ajout au brouillon, lecture vocale, épinglage et raccourcis de navigation/recherche.
- Reprise locale du dernier document : données, source non enregistrée et original de référence, page PDF et défilement du lecteur LaTeX. Le contrôle de conflit à la sauvegarde reste actif.

### Vérifications exécutées

- 46 XCTest iOS réussis, dont streaming/final, replay après accusé perdu, file après erreur, restauration de pièces jointes et brouillon de document.
- Regroupement de 5 000 événements : moyenne précédente 0,432 s ; après correction environ 0,0025–0,004 s sur le simulateur iPhone en Debug. Ce résultat mesure le regroupement seul, pas les images par seconde de toute l’app.
- 32 tests de passerelle Rust (7 bibliothèque, 3 binaire, 22 sécurité), 2 tests runtime d’édition ; tests JavaScript du rendu riche, sélection, sécurité HTML et identité DOM.
- TypeScript, Vite et 654 tests sidecar réussis. Bundle Mac reconstruit et chemins actifs de l’app, du moteur et de la passerelle vérifiés.
- Essai réel dans une conversation de validation : outil exécutant uniquement un calcul Python, autorisation depuis l’appareil émetteur, réponse, édition et répétition de la même demande. Original conservé et une seule nouvelle demande dans le journal.
- Sur simulateur iPhone : préférence d’accent persistante, navigation version 2 → version 1, sortie réelle du terminal affichant 4, fiche de modification remplie puis annulée sans changer le message.
- Build signé et installation dans l’app iPhone existante `com.tofunori.atelier.companion` confirmés. Revue indépendante statique sans blocage matériel restant sur les corrections examinées.

### Portée et limites

Les notifications intégrées sont locales et concernent les événements reçus par l’app. Une livraison lorsque iOS suspend l’app nécessite encore une infrastructure APNs. La file est conservée sur l’iPhone ; elle n’est pas une file autonome sur le Mac. Les aperçus de changements décrivent des modifications déjà signalées et ne proposent pas de fausse action de sauvegarde. L’autorisation d’un outil reste liée à l’appareil émetteur ; une tentative depuis un autre appareil a été refusée pendant la validation.

La transcription vocale, le ressenti haptique et la fluidité globale sur un iPhone physique ne sont pas certifiés par ces tests. Le cache PDF reste sans quota et le lecteur ne lance pas de compilation LaTeX. Les paragraphes de validation précédents décrivent la première livraison ; la persistance de page PDF et de document est maintenant implémentée et couverte par la nouvelle sauvegarde locale.

Contrôle iPad supplémentaire : le build iOS existant a été installé et lancé sur un simulateur iPad Pro 11 pouces M4 neuf. Inspection visuelle de la disposition à deux colonnes, du composer, d’une pièce jointe, des formules, du tableau et du code avec une fixture locale. Aucun Mac n’était associé à ce simulateur ; ce contrôle valide la disposition, pas les échanges distants sur iPad. Le simulateur temporaire a ensuite été supprimé.

### 6 septembre — thèmes en direct et édition dans la bulle

Les réglages appliquent leur propre apparence claire/sombre et affichent un
aperçu du chat avec ses fonds adaptatifs et la couleur d’accent. La bascule a
été observée dans la fenêtre restée ouverte sur simulateur.

L’édition d’un prompt remplace désormais son contenu par un champ multiligne
et les boutons Annuler/Envoyer. Elle conserve le mécanisme de versions et les
réessais de la passerelle. Saisie puis annulation vérifiées dans une conversation
de validation sur simulateur; le message original reste inchangé.

46 tests iOS réussis; build appareil et installation sur l’iPhone réussis.
TypeScript/Vite passent. 654 tests sidecar passent avec `--maxWorkers=1` après
des dépassements de délai variables en parallèle (dont le test Kimi annulant
son tour après un délai fixe de 250 ms). Le protocole Mac a été exécuté et les
chemins des trois processus du bundle vérifiés.

Le nouveau volet latéral reste une proposition dans la maquette web; il n’est
pas intégré au client natif à cette étape. Le lecteur PDF des articles reste
PDFKit; la remise en page du texte des PDF est une piste distincte.
# Intégration du volet et de l’icône — 6 septembre 2026

Les changements validés dans la maquette sont intégrés à l’app native : volet
commun Chats/Galerie/Articles, conversations regroupées par projet avec recherche
et groupes repliables, création avec choix explicite du projet, galerie dont le
projet est indépendant du chat, filtres de type dépliés dans la liste et recherche
combinée. Recherche et groupes du volet, filtres par projet et documents ouverts
restent disponibles pendant la session. Le retour affiche explicitement Galerie
ou Articles au-dessus du nom du fichier. Les thèmes avec aperçu immédiat et la
modification du prompt dans sa bulle, déjà intégrés, sont conservés.

L’icône sauge validée est incluse dans AppIcon (1024 × 1024, opaque) et apparaît
sur l’écran d’accueil du simulateur. La version iPhone signée est compilée avec
l’identité et le profil existants, bundle `com.tofunori.atelier.companion`.
Paquet préparé : `/private/tmp/atelier-native-device/Build/Products/Debug-iphoneos/AtelierNative.app`.
Installation physique de cette version en attente du branchement du téléphone.

Validation : 51 XCTest réussis, dont résolution des couleurs sur un moteur de
rendu en arrière-plan, brouillon conservé au changement de chat, indépendance
des projets, recherche de conversations par projet et reprise distincte des
documents Galerie/Articles. Revue indépendante statique terminée. Dans le
simulateur connecté au vrai Mac : galerie de 2 207 fichiers → filtre Figures
(228 résultats) → ouverture PNG → Articles → reprise du même PNG → retour à la
liste filtrée; recherche du volet conservée après fermeture; thèmes clair/sombre
inspectés; libellé Galerie et nom de fichier vérifiés dans la compilation finale.

Une fermeture reproductible pendant le filtrage provenait du fournisseur de
couleurs UIColor capturant l’isolation MainActor. Le debugger l’a localisée dans
`AtelierTheme.accent(named:)` sur `SwiftUI.AsyncRenderer`. Le calcul des couleurs
est désormais non isolé; les retours tactiles restent sur MainActor. Le test de
résolution en arrière-plan et la répétition du parcours réel passent.

Contrôles Mac : TypeScript, Vite et 654 tests sidecar réussis; protocole complet
de rebuild .app et relance du checkout vérifié. Aucun changement de logique Mac
spécifique à cette navigation. Le mode Lecture LaTeX existant est conservé;
la remise en page adaptative des PDF d’articles évoquée précédemment demeure
une amélioration distincte, non intégrée à cette version.

## Ajustements projets et effort — 6 septembre, 14 h 24

- Projets récents par défaut, épinglage, masquage et tri local via Gérer ; les anciens projets sont regroupés et masqués par défaut. La recherche traverse tous les projets. Les conversations ont des lignes plus sobres et un historique dépliable.
- Jauge avec arc, pivot et aiguille près du modèle ; panneau flottant avec crans des efforts proposés par le fournisseur et accès au choix de modèle. Un effort conservé mais indisponible reste explicitement identifié.
- Trois actions sous chaque message réduites à 11 points, avec cibles agrandies pour les tailles de texte d’accessibilité.
- 55 tests XCTest réussis avant la dernière finition du panneau. Builds finaux simulateur et appareil réussis, signature vérifiée. Revue indépendante statique sans blocage.
- Essais simulateur : masquage/réaffichage et épinglage de projet, panneau d’effort Auto → Élevé → Auto, aiguille, ouverture puis fermeture du choix de modèle et inspection des petites actions. VoiceOver et panneau au-dessus du clavier non vérifiés de manière exhaustive.
- Version finale installée sur l’iPhone associé à 14 h 23 (`com.tofunori.atelier.companion`). L’ouverture automatique a été refusée parce que l’iPhone était verrouillé ; l’application reste installée et peut être ouverte manuellement.

## Fil d’activité dépliable — 6 septembre, 14 h 35

- Le bouton d’activité déplie ses étapes directement dans la conversation. Chaque résultat et sortie d’outil peut être déplié sur place ; la fiche modale Activité a été retirée.
- Icônes et libellés selon l’action (réflexion, recherche, lecture, commande, modification), états des outils conservés, erreurs et interruptions distinctes. Un résultat inconnu n’est pas présenté comme réussi.
- Les dépliages sont propres à la conversation et au groupe, conservés en mémoire au fil des mises à jour et des recréations des lignes. Leur ouverture suspend le suivi automatique, que le bouton de retour au bas permet de reprendre.
- Les deltas gardent leur identité à la finalisation ; un événement done ferme aussi les flux sans événement texte final. État d’activité évalué par tour, y compris quand plusieurs tours existent.
- 58 XCTest réussis après les dernières corrections ; builds simulateur et appareil réussis, signature vérifiée. Revue indépendante des états et détails corrigés sans blocage.
- Scénario simulé : réflexion, recherche, lecture puis texte progressif. Dépliage des étapes et du résultat de recherche inspecté dans le fil ; section encore ouverte après finalisation et position de lecture maintenue. Le moteur Markdown conserve son mécanisme de réconciliation existant. Pas de mesure nouvelle du débit ni de validation de longue durée du streaming réseau réel.
- Référence : ChatGPT web sans connexion observé sur une requête publique ; son déroulé avancé complet n’était pas accessible dans cette session. Interaction construite à partir du besoin explicite de l’utilisateur, sans revendiquer une reproduction exacte de l’application native ChatGPT.
- Installation physique réussie à 14 h 35. Ouverture automatique refusée par iOS parce que l’iPhone est verrouillé ; ouvrir Atelier manuellement après déverrouillage.

## Chat épuré et autorisations — 6 septembre, 15 h 54

- Maquette appliquée au chat natif : en-tête réduit au menu, suppression des signatures Atelier répétées, bulles utilisateur compactes et menu de message discret. Les trois actions apparaissent sous le dernier texte de chaque tour terminé ; les textes intermédiaires restent consultables.
- Options du chat : Demander confirmation, Modifications autorisées et Accès complet (Auto), selon les capacités annoncées par le fournisseur. Choix conservé par conversation ; anciennes sessions restaurées en mode confirmation.
- La passerelle transmet le mode choisi pour les envois et les révisions, vérifie les capacités et distingue les modes dans les empreintes de requête. Les messages en attente utilisent le mode de la conversation au moment de leur envoi. Une intervention conserve la politique du travail actif ; son éventuel repli tardif sur un nouveau tour reste en mode confirmation.
- Les demandes déjà affichées ne sont pas approuvées par un changement de réglage. Le mode Auto n’a pas été activé dans les préférences réelles de l’utilisateur.
- Validation : 61 XCTest, 33 tests Rust et 654 tests sidecar réussis ; TypeScript, Vite et builds finaux simulateur/appareil réussis. Revue indépendante native et passerelle sans blocage après corrections.
- Essais visuels sur scénario local : bulles courtes, textes intermédiaires, actions finales, ouverture des options et sélection du mode. Simulateur relancé ensuite sans scénario. Pas de validation exhaustive VoiceOver, grandes tailles de texte ou long échange réseau sur l’appareil physique.
- Installation iPhone et vérification de signature réussies à 15 h 50. Ouverture automatique refusée parce que l’appareil est verrouillé.
- Le verrou a empêché un second build Mac concurrent. Le build déjà actif a terminé avec les sources de la passerelle mises à jour ; bundle du checkout relancé, processus de passerelle remplacé et santé du sidecar vérifiée (HTTP 200, ok). Une seconde instance sans backend a été fermée ; une seule instance reste active.
