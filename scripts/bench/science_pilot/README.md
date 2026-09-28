# Pilote scientifique Atelier — diagnostic exploratoire

Ce pilote compare les CLI natifs Codex et Claude, chacun avec deux conditions :
`baseline` (instructions de tâche seules) et `procedure` (même tâche plus une
procédure scientifique commune, écrite pour ce pilote). Il ne compare pas les
modèles entre eux et ne représente pas un benchmark de l'application Atelier.
Il n'importe aucun skill OpenScience et ne change aucune configuration globale.

Les dix cas sont fictifs. Ils couvrent provenance, entité exacte, absence de
preuve, unités, pondération spatiale, énergie, qualité des données, incertitude,
figure, tendance et fuite temporelle. La vérité de référence est déterministe;
elle ne constitue pas une expertise humaine sur des articles réels. Les critères
et les procédures sont figés par SHA-256 avant le lancement. Les agents reçoivent
uniquement leur dossier d'entrée et la tâche, jamais le corrigé.

Chaque tâche vaut le même poids. Ses contrôles ont le même poids entre eux.
Les scripts doivent reproduire leurs sorties dans un processus neuf. Les tâches
qui le permettent ont un second jeu d'entrée, non communiqué au modèle, pour
détecter les nombres codés en dur. Une erreur d'infrastructure est distincte d'une
réponse scientifique fausse. Un délai dépassé reste un résultat de l'essai.
Les paragraphes demandent aussi une lecture indépendante; un contrôle de champs
JSON ne démontre pas à lui seul la qualité de la prose ou de la figure.

Un essai par tâche et condition, ordre alterné, limite identique de temps et
raisonnement constant par fournisseur. Les abonnements existants sont utilisés.
Les tokens et estimations monétaires sont rapportés tels que disponibles;
une valeur absente reste inconnue, et une estimation n'est pas une facture.
Le pilote ne garantit pas une égalité de tokens consommés : il compare sous la
même limite de temps, puis rapporte la consommation réellement observée.
L'indicateur principal est le nombre de tâches dont tous les contrôles passent.
Le score moyen est secondaire. Les deltas ne portent que sur les paires notées.
Aucun déploiement automatique n'est décidé à partir de ces dix cas.

Les sorties et journaux doivent rester hors du checkout, dans un répertoire
de résultats dédié. Ne pas relancer automatiquement un échec d'authentification
ou de transport. Toute nouvelle campagne conserve les résultats précédents.

La personnalisation ambiante est désactivée autant que le permettent les CLI
(Codex `--ignore-user-config`, Claude `--safe-mode`). Les moteurs, prompts natifs
et outils diffèrent entre fournisseurs; seules les comparaisons internes à un
fournisseur permettent d'étudier l'effet de la procédure ajoutée.

## Exécution

```sh
python3 -m unittest discover -s scripts/bench/science_pilot -p 'test_*.py' -v
python3 scripts/bench/science_pilot/run.py --output /chemin/hors/checkout/campagne \
  --codex-model gpt-6-astra --claude-model claude-opus-5-5 --timeout 150
```

Les tests de rejeu utilisent le sandbox natif macOS et doivent être exécutés
depuis un contexte où `sandbox-exec` peut créer son propre sandbox. Le rejeu
dispose uniquement des entrées, du script autonome et des bibliothèques Python
déjà installées; aucun secret d'environnement n'est transmis. Les agents CLI
utilisent leurs permissions natives : le dossier de travail et la consigne
ne constituent pas une preuve d'isolation absolue en lecture du système.

Un prévol sur une tâche distincte doit confirmer authentification, flags,
écriture, interpréteur et rendu matplotlib. Les prévols ne sont jamais agrégés
aux dix cas. Les sessions Claude utilisent un identifiant de modèle exact
résolu au prévol. Pour Codex, le manifeste conserve le modèle demandé; ses
événements CLI ne donnent pas nécessairement le modèle effectivement résolu.

## Limites constatées lors de la première campagne

Le contrôleur v1 conserve deux ambiguïtés documentées : sa tolérance numérique
peut rejeter un arrondi admissible alors que la précision n'est pas annoncée;
son rejeu ne recopie pas les fichiers de données créés et livrés par l'agent.
La consigne d'autonomie interdit un autre fichier de code, sans interdire ces
données. Les notes v1 doivent donc être accompagnées d'une revue de ces rejets.
Ne pas interpréter automatiquement un échec de `fresh_process_reproduction`
comme un calcul faux ou un livrable non reproductible.

La première campagne conserve le barème et les scores originaux; ses diagnostics
complémentaires sont séparés. Avant une nouvelle campagne, annoncer la précision
attendue et définir les dépendances de données autorisées, puis figer une nouvelle
version du protocole. Ne pas réécrire rétrospectivement les résultats v1.
