# Aperçu du workspace mobile

Ouvrir le client mobile avec `?preview=workspace` (exemple local :
`http://127.0.0.1:4176/?preview=workspace`). Le mode normal reste inchangé.

Le prototype est chargé séparément via React.lazy. Il utilise un projet fictif,
un PDF statique de deux pages et un état React en mémoire : aucun appel à la
gateway, aucune écriture dans les documents réels, aucune réponse d'agent.
Recharger la page réinitialise la source, les messages et les brouillons.

Parcours : accueil → chat → document PDF/source → sélection source → chat.
À partir de 800 px, les deux panneaux sont visibles ensemble. Les vues restent
montées pour conserver brouillon, sélection, page et défilement pendant les
changements de surface. L'édition de source ne recompile pas le PDF fixe.

Validation du 5 septembre 2026 : build mobile réussi ; 102 tests mobiles verts
avec `NODE_OPTIONS=--no-experimental-webstorage npm --prefix mobile test`
(Node 26 expose sinon un localStorage global incompatible avec certains tests).
Essai WebKit à 390 × 844 : navigation, page PDF 2 conservée, brouillon conservé,
sélection clavier et pièce jointe, ajout local du message. Rendu à 1024 × 900
inspecté. Revue indépendante du thème et de la sémantique des panneaux.
Aucun simulateur iOS disponible ; clavier virtuel et appareil physique non validés.
