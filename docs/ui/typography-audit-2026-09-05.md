# Passe typographique Atelier — 5 septembre 2026

Périmètre : interface desktop Atelier et ses visionneuses intégrées. Cette passe corrige les écarts de police, de taille et de propagation des réglages ; elle ne redessine pas les sections.

## Règles appliquées

- Les prompts, messages, réponses, commentaires du chat, Quick Ask et transcriptions des agents suivent `--ui-font`, `--chat-fs` et `--chat-lh`.
- Les titres, libellés et métadonnées d’interface suivent les rôles partagés `--fs-title`, `--fs-body`, `--fs-body-s`, `--fs-label` et `--fs-caption`.
- Les extraits secondaires peuvent être plus petits. Le code reste monospace. Les documents conservent leur typographie de lecture.

## Résultats par section

| Section | Constat et intervention |
| --- | --- |
| Chat et saisie | Le prompt et son calque de mentions utilisaient 13 px / 1,45 tandis que les messages suivaient les préférences. Alignement des métriques ; hauteur recalculée quand la police ou la largeur change. Le champ vide réserve une ligne entière. |
| Quick Ask | Alignement du champ et des échanges sur les réglages de lecture du chat. Code inline proportionnel au texte. |
| Sous-agents | Le preset Typeset utilisait un interligne fixe de 1,65. Il suit désormais le réglage du chat. |
| Annotations du chat | Styles déjà harmonisés dans la passe précédente, contrôlés à nouveau. Citation secondaire à 0,92 em, commentaire à la taille du chat. |
| Navigation, accueil, connaissances, annotations et Narval | Audit des styles propres à ces sections : familles et rôles partagés déjà utilisés. Les citations de la base de connaissances gardent le rôle de citation distinct. |
| Dossiers et catalogue de projet | Remplacement des tailles fixes des titres, chemins, libellés et métadonnées par les rôles partagés. |
| Consignes, plans proposés, plugins et menus de projet | Suppression des tailles fixes résiduelles dans le chrome. |
| Réglages | Titre d’identité proportionnel à la taille d’interface ; aperçu du prompt aligné sur la taille et l’interligne du chat. |
| Galerie, filtres, présentation, liste détaillée et inspecteur | Tailles des contrôles et métadonnées reliées aux rôles partagés, avec valeurs de repli pour l’ouverture autonome. |
| PDF, SVG, Markdown, LaTeX et code | Harmonisation du chrome et héritage explicite de la police pour les contrôles natifs. Les éditeurs de code et la typographie des pages PDF/LaTeX restent indépendants. |
| Annotations des visionneuses | Correction des polices système imposées dans les styles injectés par JavaScript. Les champs réservent au minimum une ligne, même avec une grande police. |
| Historique, différences et conflits des visionneuses | Contrôles et métadonnées reliés aux tailles partagées. |
| Widgets | La notification de changement de thème intervient après l’application des polices et tailles, pour éviter la lecture des anciennes valeurs. |
| Terminal | Police Monaspace/Nerd Font et zoom propres au terminal conservés pour la grille et les glyphes. |

Les contenus externes, les blocs SVG/canvas dessinés par les documents, les formules et les bundles tiers Notes/Tableau blanc ne sont pas normalisés par remplacement global de leurs polices.

## Vérifications

- 116 tests ciblés : saisie, annotations, contrats CSS/Typeset et échelle d’interface.
- 36 tests supplémentaires : widgets et réglages Apparence.
- 53 tests des surfaces éditeur, CSV et sélection PDF.
- Deux tests navigateur sur les vrais composants compilés : à 13,5 et 18 px, égalité de la famille, de la taille et de l’interligne entre prompt, calque, message utilisateur et réponse. Conservation du texte au rétrécissement de la fenêtre et hauteur correcte du champ vide.
- Relecture indépendante des corrections, puis correction de la hauteur minimale signalée dans les champs d’annotation des visionneuses.
- Contrôles visuels avec Computer sur les composants compilés du chat, de Quick Ask et d’Apparence. Ils ne constituent pas une inspection manuelle de chaque état de chaque section.

Validation finale effectuée selon AGENTS : TypeScript et Vite réussis, 654 tests sidecar réussis, parité galerie valide et 207 tests diff réussis. Bundle `.app` reconstruit et bon exécutable relancé (PID 24812 à la validation). Les 14 fichiers modifiés dans les assets des visionneuses correspondent à leurs copies embarquées. Contrôle visuel natif des réglages Modèles, avec le chat et la galerie visibles derrière. Les interactions natives supplémentaires ont été limitées car l’application était utilisée en parallèle.

## Complément — sélecteurs trop imposants

Le contrôle « Codex » signalé après la passe typographique avait encore une grande flèche provenant du `SelectTrigger` partagé. La passe initiale n’avait pas traité cette dimension du contrôle.

Correction : chevron supprimé du rendu du composant commun ; suppression de la largeur minimale de 148 px ; hauteur et espacement réduits ; options à la taille `--fs-body-s`. Les réglages ne réimposent plus une hauteur de 34 px. Les coches et indicateurs des sous-menus ont des dimensions explicites pour éviter le défaut Lucide de 24 px.

Vérification sur les composants compilés : bouton « Codex » de 54,6 × 26,8 px, texte 12 px, zéro SVG décoratif dans le bouton. Menu ouvert contrôlé avec Computer. Les 72 tests ciblés passent ; un test navigateur supplémentaire vérifie les dimensions, la sélection, l’ouverture au clavier, Échap et le retour du focus. Relecture indépendante sans régression identifiée.
