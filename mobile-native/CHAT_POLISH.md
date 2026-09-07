# Chat iOS — objectif de finition

Objectif réalisé dans le simulateur : rendre le chat fluide pour le travail scientifique, sans perdre
la sélection-citation ni le suivi du streaming.

- [x] 1. Rendu Markdown, code, tableaux et équations ; copie et citation.
- [x] 2. Reprise du chat, brouillons, pièces jointes et position après relance.
- [x] 3. Actions copier, modifier-renvoyer, réessayer et citer.
- [x] 4. Pièces jointes ouvrables dans l’historique.
- [x] 5. États d’envoi, reconnexion et autorisations compréhensibles.
- [x] 6. Finition tactile, clavier et animations ; validation intégrée.

Chaque étape reçoit des tests ciblés, une revue indépendante et une validation
Simulator. Les essais physiques iPhone restent explicitement séparés.

Étape 1 : micromark/GFM, KaTeX et highlight.js embarqués, lecteur local
WebKit partagé, copie de code, sélection-citation, repli texte et chargement.
Tests Node de rendu/sécurité/sélection + 25 XCTest ; aperçu scientifique vu
dans le simulateur. Citation tactile testée via le sélecteur natif de passage.

Étapes 2–5 : session locale atomique, blobs dédupliqués, pièces en attente de
conversation conservées, protection après erreur de restauration ; actions
copier/citer/modifier/redemander ; fichiers historiques liés au message iOS ;
états de connexion, réponse et autorisation distincts. 31 XCTest passent.
Revue indépendante réalisée, corrections de conservation et image seule testées.
PDF joint ouvert depuis l’historique dans le simulateur ; brouillon retrouvé
après fermeture complète.

Portée : les cartes historiques concernent les pièces jointes envoyées depuis
cette version iOS, dont les références sont enregistrées localement. Les anciens
messages Mac sans références conservées restent textuels. Les modifications de
documents et la compilation LaTeX distante ne font pas partie de cet objectif.

Étape 6 : texte natif visible durant l’initialisation du rendu riche, taille de
texte iOS, cibles tactiles de 44 points, mouvements réduits respectés. Réponse
réelle de 20 lignes suivie automatiquement jusqu’à « FIN DU TEST » ; remontée
manuelle et bouton de retour vérifiés. Après fermeture de l’app iOS et rebuild
Mac indépendant, reconnexion automatique et même position de lecture observée
(offset 1575,33 ; hauteur 2844). Le démarrage vide ne remplace plus ce repère.

Validation finale : 31 XCTest sans échec (atelier-chat-final31.log), tests Node
Markdown/math/table/code/copie/sécurité verts, build iOS réussi, revue indépendante
sans blocage. Aucun test sur iPhone physique ni certification de performance sur
historique massif ; ces essais restent distincts de la validation Simulator.
