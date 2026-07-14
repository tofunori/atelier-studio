# Inventaire complet shadcn/ui — Atelier iOS

Date : 2026-07-13  
Source : <https://ui.shadcn.com/docs/components>  
Périmètre : `mobile/`, c’est-à-dire l’interface React embarquée dans l’app iOS.

## Verdict

La migration des primitives d’interface de l’app mobile est complète :

- **64/64 composants officiels inventoriés**;
- **31 composants adoptés**, tous installés et utilisés dans une surface produit;
- **33 composants non requis**, car aucun comportement actuel de l’app ne les justifie;
- **0 contrôle générique historique** restant à migrer;
- les deux éléments HTML `button` résiduels sont uniquement les éléments accessibles
  fournis au slot `render` de la primitive shadcn `Item`.

Les moteurs spécialisés restent volontairement hors de la migration : canvas PDF,
coloration syntaxique, rendu texte/LaTeX, image/SVG et contenu technique des outils.
shadcn fournit leur chrome, leurs actions, leurs états et leur navigation; il ne
remplace pas ces moteurs de rendu.

## Inventaire des 64 composants

| Composant | État mobile | Usage ou décision |
|---|---|---|
| Accordion | Non requis | `Collapsible` suffit pour le détail d’activité unique. |
| Alert | Adopté | Connexion, erreurs, synchronisation et envois en attente. |
| Alert Dialog | Adopté | Fichier volumineux et oubli d’un appareil. |
| Aspect Ratio | Non requis | Les viewers possèdent leurs contraintes scientifiques propres. |
| Attachment | Adopté | Pièces jointes du composer et suppression. |
| Avatar | Non requis | L’interface compacte n’affiche pas d’avatars décoratifs. |
| Badge | Adopté | Modèle, métriques, statut, extension et pagination. |
| Breadcrumb | Non requis | Un fil d’Ariane horizontal est inadapté à la largeur iPhone. |
| Bubble | Adopté | Messages utilisateur, assistant et erreurs. |
| Button | Adopté | Toutes les actions génériques. |
| Button Group | Adopté | Toolbars PDF, image, texte et actions de fichier. |
| Calendar | Non requis | Aucun workflow calendrier. |
| Card | Adopté | Questions interactives et formulaires structurés. |
| Carousel | Non requis | Aucun parcours de type carousel. |
| Chart | Non requis | Les figures scientifiques sont affichées comme fichiers. |
| Checkbox | Adopté | Choix multiples des interactions agent. |
| Collapsible | Adopté | Détails du thinking, bash, outils et skills. |
| Combobox | Non requis | Les listes actuelles restent courtes. |
| Command | Non requis | Pas de palette clavier dans l’app iPhone. |
| Context Menu | Non requis | Pas de menu clic droit sur iOS. |
| Data Table | Non requis | Les listes mobiles n’ont pas de colonnes. |
| Date Picker | Non requis | Aucun choix de date. |
| Dialog | Non requis | `Drawer` gère les formulaires mobiles et `AlertDialog` les confirmations. |
| Direction | Non requis | Aucun mode RTL dans le périmètre actuel. |
| Drawer | Adopté | Création compacte d’un chat et choix provider/modèle. |
| Dropdown Menu | Non requis | Les choix actuels utilisent `Select` ou `Drawer`. |
| Empty | Adopté | États vides, boot, chargement et absence de fichiers. |
| Field | Adopté | Appairage, réglages et interactions. |
| Hover Card | Non requis | Le survol n’existe pas sur iPhone. |
| Input | Adopté | Appairage et réponses textuelles. |
| Input Group | Adopté | Recherche et composer avec actions intégrées. |
| Input OTP | Non requis | Le code d’appairage n’est pas un OTP segmenté. |
| Item | Adopté | Conversations, fichiers et étapes d’agent. |
| Kbd | Non requis | Aucun raccourci clavier mobile exposé. |
| Label | Adopté | Contrôles qui exigent une association accessible explicite. |
| Marker | Adopté | Statut de travail en direct et compteur de secondes. |
| Menubar | Non requis | Navigation iOS assurée par `Tabs`. |
| Message | Adopté | Structure des tours et métadonnées du chat. |
| Message Scroller | Adopté | Ancrage streaming, reprise de position et retour au dernier message. |
| Native Select | Non requis | `Select` Base UI fournit le comportement uniforme retenu. |
| Navigation Menu | Non requis | La barre inférieure utilise `Tabs`. |
| Pagination | Adopté | Navigation bornée de la galerie. |
| Popover | Non requis | Aucun contenu flottant nécessaire sur l’écran étroit. |
| Progress | Non requis | Les opérations actuelles sont indéterminées et utilisent `Spinner`. |
| Radio Group | Adopté | Choix exclusifs dans les demandes de l’agent. |
| Resizable | Non requis | Une vue iPhone ne possède pas de panneaux redimensionnables. |
| Scroll Area | Non requis | Le scroll natif iOS est conservé; le chat utilise `MessageScroller`. |
| Select | Adopté | Projet, tri, provider et modèle. |
| Separator | Adopté | Composition interne des listes et groupes shadcn. |
| Sheet | Non requis | `Drawer` est la variante mobile retenue. |
| Sidebar | Non requis | Navigation inférieure compacte, sans panneau latéral. |
| Skeleton | Adopté | Chargement du chat, PDF et historique. |
| Slider | Non requis | Les zooms sont des actions discrètes accessibles. |
| Sonner | Adopté | Copie et ajout à un chat, avec un seul `Toaster` global. |
| Spinner | Adopté | Connexion, refresh, chargement et agent actif. |
| Switch | Non requis | Aucun réglage booléen immédiat dans l’état actuel. |
| Table | Non requis | Aucun tableau interactif mobile. |
| Tabs | Adopté | Navigation Chats, Gallery, Fichiers et Réglages. |
| Textarea | Adopté | Composer multilignes avec word wrap. |
| Toast | Non requis | Composant historique remplacé officiellement par Sonner. |
| Toggle | Adopté | Numéros de ligne et états binaires compacts. |
| Toggle Group | Adopté | Filtres de la galerie. |
| Tooltip | Non requis | Le survol n’est pas un geste iPhone. |
| Typography | Non requis | Le rendu Markdown, code et LaTeX reste spécialisé. |

## Surfaces migrées

- navigation principale et états de connexion;
- liste, création et ouverture des chats;
- timeline, streaming, messages, thinking, bash, outils, skills et interactions;
- composer, pièces jointes et envoi;
- galerie, recherche, filtres, tri, pagination et notifications;
- viewers PDF, image, SVG, code, texte et LaTeX;
- appairage, réglages, diagnostics et confirmations destructives.

## Contrat de fin de migration

Une future surface n’est pas automatiquement « shadcn » parce qu’un fichier existe.
Elle doit importer la primitive officielle, l’utiliser réellement, respecter les
tokens Precision Native et conserver les composants métier spécialisés au-dessus.
Toute nouvelle primitive suit le workflow du skill projet : documentation, recherche
du registre, `--dry-run`, inspection du diff et absence de `--overwrite`/`--force`.
