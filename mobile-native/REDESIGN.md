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

## Synchronisation des projets récents — 6 septembre, 21 h 38

- La passerelle relit les conversations et découvre leurs nouveaux projets à chaque requête de catalogue, sans redémarrage. Elle conserve les noms déjà enregistrés et les identifiants opaques de fichiers.
- L’iPhone recharge ensemble conversations et projets, à l’ouverture du menu, au retour au premier plan et toutes les huit secondes lorsque le menu reste visible. Une actualisation manuelle est disponible par tirage. La boucle s’arrête hors du premier plan et à la fermeture du menu.
- Les conversations sont classées par dates interprétées, y compris lorsque les fractions de seconde diffèrent. Une conversation sélectionnée conserve sa version, mais son classement utilise l’activité récente de sa famille de révisions. Les épinglages et masquages explicites sont conservés. Le rafraîchissement périodique n’efface pas les erreurs du chat.
- 62 XCTest, 34 tests Rust et 655 tests sidecar réussis ; TypeScript, Vite, builds simulateur et appareil réussis. Revue indépendante statique sans blocage. Test de régression : nouveau projet créé sur disque après démarrage de la passerelle, récupération par API authentifiée et conservation d’une référence de fichier existante.
- Installation et ouverture sur l’iPhone physique réussies. Après la fin du travail FRQNT actif, arrêt ciblé des seuls processus du bundle courant, reconstruction .app, relance vérifiée du checkout et santé du backend HTTP 200/ok. Le script global habituel a été refusé par la vérification automatique ; les arrêts ciblés par PID et identité ont été acceptés.
- Vérification visuelle dans le simulateur connecté aux données réelles : le menu est passé de l’état déconnecté à la liste actualisée automatiquement ; FRQNT_B2_2027-2028 apparaît en premier hors épinglés (Chapitre1-Albedo épinglé au-dessus). Ses deux conversations sont visibles, « ici est-ce la bonne référence? » avant « LAURENTSTPIERRE_LAUTH2301_Projetrecherche.pdf ». La conversation précédemment sélectionnée reste sélectionnée.

## Retour au bas du fil — 6 septembre, 22 h 03

- Bouton centré au-dessus du compositeur, cible de 44 points, surface adaptative, contour fin et flèche couleur d’accent. Un anneau remplace la flèche pendant le retour demandé ; l’état réduit les animations conformément aux réglages iOS/app.
- Visibilité fondée sur la distance réelle au bas, plutôt que sur le seul booléen de suivi. Les nouveaux messages ne doivent pas faire disparaître le bouton pendant la lecture en amont.
- Pilote unique du UIScrollView extérieur via une sonde ascendante : calcul de la limite avec hauteur réelle, viewport et insets. Conservation de la dernière demande avant attachement ; aucun rejeu lors d’un attachement déjà établi. Le scroll des vues WebKit de message reste désactivé.
- Les changements de hauteur du contenu ou du clavier maintiennent un retour explicite en cours, indépendamment du réglage de suivi automatique. Les gestes de lecture interrompent ce retour. La restauration de position est distincte des demandes de retour au bas.
- Les prototypes utilisant les ancrages SwiftUI ont révélé un cas de saut incomplet et de boucle sur le long scénario ; ils ne constituent pas l’implémentation livrée.
- 64 XCTest réussis avec deux tests du pilote (contenu, viewport, insets, demande avant attachement et absence de rejeu). Build simulateur final réussi après ajustement du garde de viewport ; build appareil et signature finale réussis. Revue indépendante : unique réserve sur ce garde corrigée.
- Essais visuels : scénario long avec douze réponses Markdown/tableaux/formules/code ; position initiale de lecture conservée, retour manuel au dernier message sans suivi automatique ; thème clair et sombre. Streaming simulé de 80 ajouts, clavier ouvert avant le retour : un appui rejoint la réponse en cours et la dernière ligne reste visible à la finalisation. Le simulateur a ensuite été relancé sans fixtures ni overrides de thème/suivi.
- Les gestes tactiles manuels ne sont pas validés exhaustivement par cette session d’automatisation ; aucun nouveau constat de performance réseau de longue durée. Le Mac conserve son bundle actif du checkout ; changements de ce lot limités au natif iOS.

## Pièces jointes et arrêt de l’anneau — 6 septembre, 22 h 17

- Le bouton plus ouvre un panneau compact avec trois lignes à icônes : Galerie, Photos et Fichiers. La fermeture du panneau précède la présentation des sélecteurs natifs ; les fonctions existantes sont conservées.
- Le retour au bas termine désormais sa tâche à partir de la position UIKit réelle, avec une attente maximale de deux secondes environ. Il attend aussi la stabilisation de la hauteur du contenu, pour absorber les dimensions tardives des messages WebKit. Un geste de lecture annule la tâche ; l’anneau ne dépend plus d’un dernier événement de géométrie SwiftUI.
- 67 XCTest réussis avant le dernier ajustement du délai de stabilisation ; builds simulateur et appareil réussis après cet ajustement. Revue indépendante sans blocage. Essai final sur douze longues réponses : un seul appui rejoint « Fin du fil » et fait disparaître l’anneau.
- Ouverture visuelle vérifiée des trois destinations du panneau ; Photos et Fichiers annulés sans import. Simulateur remis en fonctionnement normal après les scénarios. Signature, installation et lancement sur l’iPhone physique réussis à 22 h 17.

## Accès complet permanent et sélection directe — 6 septembre, 23 h 08

- À la demande explicite de l’utilisateur, le mode Accès complet devient le défaut global des chats iPhone. Il est sauvegardé séparément des options par conversation ; les anciennes sessions adoptent ce défaut. Un changement explicite ultérieur reste conservé globalement. Les assistants sans politique réglable conservent leur mode effectif standard sans effacer le choix global destiné aux autres assistants.
- Le moteur Codex Rust et son équivalent JavaScript accordent les autorisations classiques et les consentements MCP sans champs avant le relais interactif en danger-full-access. Les modes form/openai/form/openaiForm et la métadonnée $schema sont couverts. Une saisie de données ou authentification URL n’est pas fabriquée automatiquement.
- Validation : 20 tests Rust du parseur, 44 tests fournisseur JavaScript et suite sidecar 656 tests ; TypeScript et Vite réussis. Bundle Mac reconstruit puis relancé depuis le checkout ; processus vérifié et backend Rust HTTP 200/ok, nouveau hash 3a204f4584ce43b408758043bb941983. Pas de nouveau test réseau complet d’un appel gbrain réel.
- Chat iPhone : retrait du menu contextuel de message qui interceptait l’appui long. Les actions restent dans les menus ellipsis, y compris la lecture vocale des messages utilisateur. « Ajouter au chat » est inséré à la racine du menu d’édition WebKit ; capture du passage et callback différé après fermeture. Suppression du bouton additionnel sous la réponse. Texte simple et enrichi partagent le libellé.
- 70 XCTest réussis, incluant la migration du mode global, la persistance, les assistants sans modes et une citation Unicode après effacement de sélection. Essai visuel natif : appui long sur « Columbia » dans un tableau enrichi, menu « Ajouter au chat / Copy / Look Up », ajout du texte exact au-dessus du brouillon et ouverture du clavier. Scénario local remis en mode normal après validation. Revue indépendante effectuée ; conservation de la lecture vocale ajoutée après sa remarque.

## Annotations de lecture et messages en attente — 6 septembre, 23 h 32

- Lecture LaTeX : menu natif « Ajouter au chat / Annoter », avec citation directe distincte de la remarque. Fiche compacte, sauvegarde locale atomique des notes, compteur, liste et reprise des remarques dans le brouillon sans l’effacer. Les citations incluent la source exacte et leurs lignes. Le stockage utilise le projet et l’identifiant stable du fichier distant ; deux fichiers homonymes restent séparés.
- Les ancrages UTF-16 conservent les occurrences répétées et l’empreinte du source. Le surlignage WebKit utilise CSS Highlight sans insérer de balises dans le texte ; toucher un passage surligné ouvre sa remarque. Le nombre d’occurrences est contrôlé aussi côté DOM : un commentaire LaTeX masqué ne doit pas déplacer le surlignage. Après modification du source, les notes restent lisibles et modifiables, mais leur surlignage est suspendu.
- Les messages préparés apparaissent au bas du chat avec menu Modifier / Intervenir (Steer) / Annuler. L’éditeur conserve le brouillon courant et suspend immédiatement la file. Les échecs avant transmission restent modifiables ; après une transmission incertaine, la reprise conserve identifiant, mode et autorisation du premier envoi. L’intervention est proposée seulement si le fournisseur l’annonce.
- Validation finale : 82 XCTest réussis ; tests du renderer Markdown, sécurité HTML, occurrences répétées, surlignage après réconciliation et refus des comptes divergents réussis. Revue indépendante des notes, du menu et des reprises de file ; corrections intégrées. Diff des sources propre ; le bundle JavaScript généré conserve des espaces de template literals de highlight.js signalés par git diff --check.
- Simulateur : menu natif Ajouter au chat / Annoter observé après appui long ; surlignage « glacier », liste, modification et sauvegarde de remarque vérifiés ; ajout au chat avec brouillon préexistant et source exacte observé. Menu de file, modification d’un message, conservation du brouillon et annulation du second vérifiés. Les erreurs prétransmission et reprises sont couvertes par les tests ; aucune intervention Steer réelle sur un tour distant n’a été déclenchée. Simulateur relancé sans fixtures.
- Build iPhone final réussi, signature stricte valide. Le lot actuel modifie uniquement l’app native ; le bundle Mac validé à 23 h 04 reste actif.
- Installation physique réussie à 23 h 32 (bundle com.tofunori.atelier.companion, séquence 4820). La relance à 23 h 33 a été refusée par iOS parce que l’iPhone est verrouillé ; ouvrir l’app après déverrouillage reste à faire.

## Retour dans l’app sans fil vide — 7 septembre, 7 h 29

- Le passage réel en arrière-plan est distingué des transitions inactives (menus système, interruptions brèves). Au retour actif, une nouvelle génération de connexion remplace immédiatement le flux suspendu sans attendre sa temporisation. Les anciens retours asynchrones sont ignorés et leur tâche URLSession est annulée explicitement. Le catalogue des assistants charge indépendamment du flux.
- Le transcript de la conversation courante est désormais sauvegardé avec ses identifiants d’événements et marqueurs de tours. Il se restaure avant toute requête réseau avec le brouillon et la position existants. Les lignes optimistes pending ne sont pas archivées ; running est déduit des tours réellement actifs, afin qu’un arrêt pendant upload ne bloque pas le chat au redémarrage. Les snapshots précédents restent lisibles.
- Une reprise brève n’affiche pas de bannière de connexion pendant la première seconde ; une panne durable et une association expirée restent visibles. Les messages ne sont pas masqués pendant la synchronisation.
- Validation : 88 XCTest réussis, dont reprise de streaming sans doublon, isolation des conversations, ancien snapshot, envoi interrompu, conservation du brouillon/position au retour actif et expiration de l’association. Revue indépendante : deux réserves corrigées (chargement initial du catalogue et état optimiste d’envoi).
- Essai simulateur avec serveur localhost isolé et historique retardé de deux secondes : passage Home puis retour au même processus (52704), ouverture immédiate du nouveau flux et fermeture de l’ancien, transcript/brouillon conservés, nouveaux messages intégrés une seule fois. Le serveur temporaire a été arrêté et le simulateur relancé sans fixtures. Le scénario réseau réel Facebook/Google sur l’iPhone n’a pas été mesuré.
- Build appareil réussi et signature stricte vérifiée ; changements de ce lot limités à l’app native iOS.
- Installation iPhone réussie à 7 h 29 (séquence 4828), puis lancement confirmé à 7 h 30.

## Fil vide et défilement du chat — 7 septembre, 7 h 47

- Régression reproduite à l’écran sur douze longues réponses enrichies : un appui sur la flèche conduisait à une zone durablement vide avec la navigation UIKit directe. Les premières corrections de délai n’y suffisaient pas. Le retour et le suivi utilisent désormais ScrollViewReader et l’ancre chat-bottom, afin que SwiftUI affiche les lignes de destination. UIKit mesure encore l’arrivée ; il ne choisit plus l’offset du retour en bas.
- Demandes de suivi regroupées sur une frame, navigation animée protégée des invalidations concurrentes et annulation des requêtes pendantes dès un geste manuel. La mesure du défilement est stockée hors de l’état invalidant tout le fil. La flèche reste une flèche, sans anneau ; elle disparaît à l’arrivée. Le contrôleur n’attend plus la stabilisation de la hauteur de toute la réponse.
- Continuité WebKit : chaque nouvelle vue démarre avec une couverture UIKit contenant le texte, même si SwiftUI conserve rendered=true. Une capture de la zone visible peut préserver son apparence pendant le réveil du moteur ; cache limité à huit captures / 16 Mio. Les captures attendent la mise en page et la dernière mise à jour. Le retour au premier plan et le redémarrage d’un processus WebKit conservent cette couverture jusqu’à l’ACK après deux frames de rendu. Texte et sélection enrichie reprennent ensuite leur vue normale.
- Essais visuels : le scénario initialement vide rejoint maintenant « Fin du fil » ; streaming au bas sans anneau persistant. Envoi réel au serveur localhost isolé depuis le début d’un fil long : fermeture du clavier, ancien contenu, nouveau message et réponse progressive restent affichés. Retour au même processus du simulateur avec réveil renderer retardé artificiellement de dix secondes : contenu conservé. Le serveur temporaire a été fermé et le simulateur relancé sans fixtures.
- 96 XCTest réussis après modifications finales ; tests JavaScript renderer réussis, y compris ACK asynchrone de reprise. Revue indépendante finale sans réserve après correction de l’ACK prématuré. Build iPhone et signature stricte réussis. Ces observations ne constituent pas une mesure Instruments des pertes de frames sur toutes les conversations réelles de l’iPhone.
- Installation physique réussie à 7 h 48 (séquence 4836), lancement confirmé à 7 h 48 min 46 s.

### Appels d’outils lisibles — 7 septembre, 07 h 56

Les lignes d’activité utilisent la police native body (17 pt à taille standard),
une icône et un chevron, sans fil vertical. Le résumé replié reprend l’action
courante (commande, recherche ou fichier) et la conserve après la fin du tour.
Les marqueurs `__thinking` sans contenu sont masqués ; les réflexions réelles
et les demandes d’autorisation restent accessibles. Les paramètres et résultats
sont fusionnés par champ à chaque mise à jour, sans perdre la commande initiale.
Les anciennes sauvegardes sans champs structurés restent décodables.

Validation : 98 XCTest réussis ; revue indépendante avec correction du résumé
après fin du tour ; simulateur avec quatre outils, ouverture du résultat de
commande et code de sortie, puis progression repliée observée de « Recherche ·
glacier albedo » à « Lecture de notes.md ». Build iPhone signé vérifié et
installation confirmée sur l’appareil associé (séquence 4844). Ces changements
sont limités au client SwiftUI natif.

### Retour en bas : dernier échange matérialisé — 7 septembre, 08 h 10

Écran noir reproduit après remontée/retour dans le simulateur avec douze longs
échanges et une réponse de 80 ajouts. Une position mesurée proche du bas pouvait
coexister avec un dernier message non dessiné : déplacer uniquement le repère
hors de LazyVStack était insuffisant. Le dernier échange, à partir du dernier
message utilisateur, reste maintenant dans la pile immédiate ; seul l’historique
précédent est paresseux. La frontière reste stable pendant le streaming.
Les grands retours sautent directement au bas, les petits gardent l’animation.
Une destination bloquée est réessayée sans animation même à hauteur inchangée,
et un dépassement inférieur n’est plus classé comme une arrivée réussie.

Validation : 102 XCTest, revue indépendante ; trois parcours de retour visibles,
dont streaming, remontée tactile puis retour, et remontée jusqu’au premier
échange suivie du bouton vers la dernière ligne. Build iPhone réussi et signature
vérifiée. Cela valide ces parcours reproduits, pas tous les longs fils possibles.

### Défilement UIKit et contraste figure — 7 septembre, 08 h 32

Les solutions précédentes (dernier échange immédiat et reprises répétées) ont
été signalées comme une régression par l’utilisateur. Le chat utilise désormais
NativeChatList, UITableView avec cellules SwiftUI UIHostingConfiguration et
identifiants diffables stables. NativeChatView ne fait plus appel au pilote
ChatScrollController ni au découpage du dernier échange. UIKit gère animation,
réutilisation et mesure ; un geste manuel suspend le suivi. Les retours tiennent
compte de Réduire les animations. Les callbacks de changement de conversation
sont filtrés, et les états d’outils/actions finales sont rafraîchis séparément.

Preuve du blocage précédent : /private/tmp/atelier-scroll-hang.sample.txt, thread
principal occupé dans LazySubviewPlacements/AttributeGraph sur toute la capture.
Après remplacement : /private/tmp/atelier-table-idle.sample.txt, 743/751
échantillons du thread principal en attente normale. Ces captures courtes ne sont
pas une mesure générale de FPS. Vidéo de 142 s :
/private/tmp/atelier-table-scroll.mp4, remontée manuelle pendant le flux, retour
au bas et retour depuis le début du fil ; aucune plage noire observée dans les
captures examinées. 106 XCTest passent, dont quatre nouveaux tests de liste
UIKit, et revue indépendante finale sans anomalie évidente.

FigureAnnotationView utilise un bleu soutenu, un libellé blanc et un double
contour blanc/bleu. Vérification simulateur sur figure moitié claire/moitié
sombre avec sélection traversante. Build iPhone réussi, signature vérifiée.
La comparaison directe avec ChatGPT n’a pas été possible : Mac verrouillé.

### 7 septembre, 09:05 — outils défilants et correction des hauteurs du chat

Les détails d’un outil déplié sont contenus dans une carte à défilement vertical
et horizontal (240 pt pour la zone de code), avec catégorie et état persistants.
Validation visuelle : 100 lignes, passage de la ligne 1 à la ligne 7 sans déplacer
le titre ni l’étape suivante.

Le défilement UIKit précédent restait incorrect : la trace montrait une perte
de 652 pt de hauteur du fil pendant un geste manuel, sans rappel automatique.
Le redimensionnement automatique des cellules est maintenant désactivé. Chaque
hauteur réellement rendue est publiée avec sa disponibilité dans une préférence
atomique, conservée indépendamment de la cellule et appliquée sans animation.
Une vue de chargement ne remplace plus cette mesure. Un cache de huit cellules
hors écran garde les rendus récents; les mesures subsistent après leur éviction.
Le texte brut temporaire n’est plus substitué au rendu Markdown à l’apparition;
les événements texte encore vides ne créent pas de cellule.

Le suivi utilise une tolérance de 1 pt (36 pt reste le seuil de proximité destiné
à l’interface). La lecture manuelle conserve son ancre; aucune réassignation de
position identique ne vient couper la décélération. Les signets attendent la
mesure du message avant d’appliquer leur décalage interne. Le retour-bas annule
une restauration en attente et les mesures tardives sont filtrées par génération
de conversation.

Validation : 112 tests XCTest passent, compilation iPhone et vérification stricte
de signature réussies. Sur le même geste en simulateur, la nouvelle trace ne
montre plus de changement de hauteur sur les messages terminés. Pendant une
réponse progressive, la décélération se poursuit à travers trois augmentations
de hauteur (1688,33 → 1859,33 pt), sans rappel automatique vers le bas.
Retour-bas final vérifié après la lecture manuelle. Revue indépendante appliquée.
Référence consultée : Apple, WWDC22 « What’s new in UIKit », section sur les
animations du redimensionnement des cellules; recherche Firecrawl et lecture du
cas de réutilisation UIHostingConfiguration publié par Lucas van Dongen.

Après confirmation explicite de l’utilisateur, le build iPhone final a été
installé à 09:07 (com.tofunori.atelier.companion, séquence 4876). La fluidité sur
l’appareil physique reste à confirmer; les parcours décrits ci-dessus ont été
observés en simulateur.

### 7 septembre, 09:14 — connexion discrète dans le titre

Le statut de connexion apparaît sous la forme d’un point de 6 pt à côté du titre :
vert connecté, orange connexion/reconnexion, gris inactif et rouge association
requise. Le titre conserve sa couleur principale. Un toucher ouvre un petit
popover contenant le statut, l’explication complète et Réessayer si applicable.
Le libellé accessible indique aussi l’état de connexion.

Les erreurs de connexion ont leur propre propriété connectionError : elles ne
s’affichent plus sous le fil, contrairement aux erreurs d’envoi ou d’outil.
Le bandeau de statut au-dessus du fil et le bouton de reconnexion dans le footer
sont retirés. Le scénario simulateur de reconnexion confirme le point orange,
l’absence de texte sous le chat et le détail complet dans le popover.
112 tests XCTest passent, build iPhone et signature vérifiés. Installé sur
l’iPhone à 09:13 (séquence 4884).

### 7 septembre, 09:20 — saisie compacte puis développée au focus

NativeComposerView affiche au repos une ligne de 52 pt avec +, Message…, micro
et envoi/arrêt. Au focus, le même TextField reste monté, devient multiligne
(jusqu’à cinq lignes) et les commandes modèle/effort apparaissent sur la ligne
inférieure. Les citations et pièces jointes restent visibles. L’envoi, l’arrêt
et l’ajout à la file conservent leurs conditions précédentes.

Compilation simulateur/iPhone et signature vérifiées. Parcours visuel : barre
compacte, focus → champ développé, saisie d’un brouillon, ouverture/fermeture du
modèle → texte conservé. Le clavier logiciel n’a pas été observé dans ce parcours
(le simulateur utilisait le clavier matériel et le Mac était verrouillé).
Build installé sur l’iPhone à 09:20, séquence 4892. Pas de nouveau test XCTest
spécifique pour cette modification de présentation.

### 2026-09-07 — libellés Steer et contrôles du composeur

- Le marqueur interne `__steered` s’affiche comme « Steered », avec une flèche de redirection. Le menu du message en attente affiche « Steer » et « Check Steer » pour vérifier une tentative.
- Nom du modèle en `subheadline`, chevron de 13 points et indicateur de réflexion de 24 points dans le composeur (zone tactile de 44 points).
- Builds simulateur et iPhone réussis ; signature vérifiée, composeur déplié inspecté dans le simulateur. Mise à jour installée sur l’iPhone (séquence 4900). Ouverture automatique refusée par iOS car l’appareil était verrouillé ; lancement physique non confirmé.

### 2026-09-07 — Calculs sur iPhone (maquette)

Nouvelle destination Calculs dans le menu latéral, conservée au retour dans l’app. Liste compacte filtrable Tous/Mac/NAS/Narval ; cartes avec projet, état, étape, durée et avancement quand il est connu. Fiche au toucher avec dernières nouvelles. Exemples explicitement simulés, sans connexion aux processus ni commande de contrôle. Le futur raccordement peut reprendre le contrat `computeSnapshot` de `src/components/CalculsSurface.tsx`.

Validation : revue indépendante statique sans problème signalé, builds simulateur/iPhone réussis, signature vérifiée. Navigation depuis le menu, fiche et filtre Narval vérifiés dans le simulateur. Installée sur iPhone (séquence 4908), ouverture confirmée. Suivi réel des calculs non implémenté à ce stade de maquette.

### 2026-09-07 — Calculs : raccordement réel

La surface native utilise désormais `GET /remote/v1/compute?host=all|mac|nas|narval` et `GET /remote/v1/compute/log?runId=…`. La passerelle exige `files:read` et relaie exclusivement les commandes de lecture desktop `computeSnapshot` (7 jours) et `computeReadLog` (100 lignes). UUID de corrélation par requête et délai global de 90 secondes. Aucun contrôle, arrêt ou lancement de processus ajouté.

L’iPhone distingue les hôtes inaccessibles, le relevé vide et la progression inconnue. Le dernier relevé est conservé sur erreur de transport et daté ; un changement d’hôte ou d’association efface l’ancien relevé. Actualisation visible/active seulement, 30 s Mac et 60 s distant, ainsi que geste tirer pour actualiser. Dernières lignes sélectionnables dans la fiche. La maquette web conserve ses exemples explicitement simulés.

Validation : 35 tests Rust de passerelle, 114 tests iOS et 656 tests sidecar réussis ; TypeScript et Vite passent. Revue indépendante statique sans blocage. Signature iPhone vérifiée et installation séquence 4916. Validation du bundle Mac et du parcours connecté consignée après relance.

Validation connectée : bundle Mac reconstruit et relancé depuis ce checkout (tauri-app 97924, sidecar 97996, gateway 98104 ; serveurs galerie anciens nettoyés). Dans le simulateur associé, le relevé réel affiche Copernicus 02-03 2017–2023 sur NAS (0/275 fichiers), le run 2014 terminé (68/68 lots) et un run local ; ouverture de la fiche NAS et lecture de ses dernières lignes confirmées. Narval renvoie actuellement « authentification SSH Narval requise », visible comme erreur partielle. Aucun état Narval actuel affirmé au-delà de cette erreur.
Ouverture de l’app installée sur l’iPhone physique confirmée par devicectl après la mise à jour Mac.

### 2026-09-07 — Prévention des passerelles orphelines

Incident : après remplacement du sidecar, un ancien `atelier-remote-gateway` gardait le port 18765. Le démarrage suivant écrivait son PID avant d’avoir acquis le port ; un simple test TCP validait ensuite la réponse de l’ancien processus. Le lock pouvait ainsi désigner un processus déjà terminé, tandis que le téléphone restait relié à l’ancien moteur.

Correction dans `src-tauri/src/remote_gateway.rs` : verrou interprocessus au démarrage, priorité au lock partagé actuel, rejet d’une tâche planifiée pour un ancien sidecar, recherche du véritable propriétaire du port indépendamment du lock, arrêt limité au binaire gateway du même utilisateur, attente de libération du port. Le lock n’est écrit qu’après vérification du child vivant et propriétaire de l’écoute. Un PID réutilisé par un autre programme n’est pas signalé. Test de régression avec un ancien listener et un nouveau child qui ne possède pas son port.

Vérification : 8 tests du cycle de vie et 656 tests sidecar passent ; TypeScript/Vite valides ; revue indépendante sans blocage. La passerelle a été rétablie au préalable en conservant devices.json et les associations. Livraison du bundle installée après validation runtime.
Livraison validée : bundle du checkout testé (gateway 76413), puis installation propre dans /Applications/Atelier.app avec signature stricte vérifiée. Au lancement installé : gateway 79134 réellement propriétaire de 18765, sidecar 61906 et empreinte concordants, /remote/health HTTP 200. Le simulateur déjà associé recharge les conversations et affiche « Mac connecté » dans le chat. Associations conservées ; bundle précédent sauvegardé dans /private/tmp/Atelier-before-gateway-fix-20260907.app.

### Chargement des longs chats — 2026-09-07

- Décodage JSON de l’historique hors du MainActor, puis application par lots de
  128 événements avec restitution à l’interface entre les lots.
- Index temporaire des lignes/turns pendant chaque lot; reconstruction après
  suppression, abandon avant suspension. Les gardes de conversation restent
  appliquées entre les lots. Sauvegarde regroupée par lot.
- Galerie, articles, calculs et document montés à leur première ouverture puis
  conservés pour préserver leur état de navigation.
- Mesure simulateur, 6 000 événements / 3 000 messages : reconstruction initiale
  2,843 s avant, 0,100 s après en lots de production. Cela exclut le transfert
  réseau et le rendu. Replay doublonné : 0,111 s.
- Validation : 116 tests iOS réussis, dont équivalence des contenus/ordre/outils,
  suppression des lignes optimistes et streaming périmé. Revue indépendante
  sans blocage. Fil `--chat-render-fixture --long-history-fixture` affiché et
  parcouru dans le simulateur avec le message « Question 1500 » visible.
- Build iPhone signé et vérifié réussi. Installation actuellement empêchée par
  l’état `unavailable` de l’iPhone dans CoreDevice; ne pas confondre avec une
  installation effectuée ou une mesure de vitesse sur appareil physique.

### Indicateur de réflexion — 2026-09-07

« Préparation de la réponse » est remplacé par « Thinking », avec un reflet
qui traverse le mot en 2,2 secondes. Animation confinée au libellé (30 Hz),
hauteur stable, désactivée en arrière-plan et lorsque les animations sont
réduites ou désactivées. VoiceOver : « Thinking ».
Builds simulateur et iPhone réussis; affichage et libellé accessible vérifiés
dans le simulateur avec `--chat-render-fixture --thinking-label-fixture`.
Installation physique en attente, téléphone actuellement à distance.

### Suggestions du composer — 2026-09-07

- `/` en tête de message : catalogue des skills utilisateur/projet du Mac,
  filtrage pendant la saisie et insertion sans envoi. `/model` et `/permissions`
  ouvrent leurs réglages et conservent le texte qui suit la commande.
- `@` après un espace : catalogue paginé des fichiers du projet; sélection
  insère le nom et joint le fichier (limite existante de six pièces jointes).
- Remplacement à la position du curseur, suffixe conservé; l’index de sélection
  est validé contre le texte courant avant conversion UTF-16, car SwiftUI peut
  publier la nouvelle sélection avant le nouveau texte.
- Route authentifiée `threads/{id}/commands` : racine dérivée du fil stocké sur
  le Mac, chemins locaux absents de la réponse. L’envoi d’un `/skill` reconnu
  est résolu côté Mac et fournit son fichier au provider, tout en conservant
  le message original dans l’historique.
- Validation : 120 tests iOS, 37 tests passerelle, 656 tests sidecar, TypeScript,
  Vite, parité galerie et 207 tests de différences réussis. Revue indépendante
  sans blocage après correction de la conservation du suffixe du brouillon.
- UI compilée : `/reda` → `/redaction-article`, `@man` → pièce jointe et mention
  vérifiés en fixture; skills et fichiers réels vérifiés avec l’association
  existante du simulateur. Aucun message de test envoyé.
- Mac construit selon le protocole, installé dans `/Applications/Atelier.app`
  et processus vérifié. Bundle iPhone construit et signature vérifiée;
  installation physique toujours en attente du retour du téléphone.

### Citations compactes dans les messages — 2026-09-07

Le parseur de présentation reconnaît maintenant les passages ajoutés au composer
(une seule nouvelle ligne avant « Passage cité », question libre) et les notes
d’annotation (ligne vide, « Ma note »). Le document et sa localisation figurent
dans une carte compacte; le commentaire reste visible. Toucher la carte ouvre
le passage intégral dans une sheet consultable, sélectionnable et copiable.
Le texte transmis et l’historique restent intacts; les messages anciens qui
utilisent ces formats bénéficient également de l’affichage compact.

La suppression d’un footer de pièces jointes exige les noms issus des métadonnées
et une correspondance exacte du suffixe. Une question contenant « Ma note » ou
« Pièces jointes » est conservée. Formats non reconnus : affichage original.

125 tests iOS réussis, revue indépendante sans blocage, carte fermée et passage
complet ouverts vérifiés dans le simulateur avec `--annotation-card-fixture`.
Build iPhone signé vérifié; installation physique en attente, téléphone distant.
