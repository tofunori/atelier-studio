# Ragdoc dans Atelier

La bibliothèque, la recherche, les nouvelles citations et les imports de la
surface Connaissances utilisent Ragdoc. Les anciennes sources et citations
GBrain restent lisibles pour préserver les conversations existantes.

## Import et approbation

Un PDF passe par la détection de doublon, la conversion Ragdrop, un brouillon
local, l’approbation, puis l’indexation ciblée et sa vérification. La conversion
seule ne produit jamais le statut « ajouté ». L’import automatique est désactivé
par défaut et utilise un réglage distinct de l’ancien réglage GBrain.

Le Markdown, les métadonnées et les illustrations du brouillon sont conservés
dans le dossier local `article-drafts` de la base de connaissances. Fermer le
dialogue conserve les imports en attente. Après un redémarrage, une opération
interrompue demande une vérification ou une reprise ; elle n’est pas déclarée
réussie. Les noms de destination restent fixes pour préserver les liens des
illustrations. Une destination contenant un autre texte ne peut pas être écrasée.

Un DOI produit une fiche bibliographique, avec résumé lorsqu’il est disponible ;
ce n’est pas un import du texte intégral. Notes et pages Web disposent aussi
d’un aperçu avant leur ajout au corpus.

## Connexion

L’adaptateur Rust exécute le petit adaptateur Python embarqué par SSH, sans
installer de serveur supplémentaire. Les valeurs locales par défaut sont :

| Réglage | Valeur par défaut |
| --- | --- |
| `ATELIER_RAGDOC_HOST` | `rorqual` |
| `ATELIER_RAGDOC_ROOT` | `/volume1/Services/mcp/ragdoc` |
| `ATELIER_RAGDOC_LOCAL_ROOT` | `$HOME/Documents/Ragdoc` |
| `ATELIER_RAGDOC_CONVERTER` | `mistral` ; `mineru` également accepté |

L’import utilise les scripts de conversion existants du projet Ragdoc et leurs
identifiants existants. Il nécessite Python 3 local et un accès SSH fonctionnel.
Le lecteur utilise la collection `ragdoc_contextualized_v1`, sa bibliothèque
canonique et le modèle d’embedding indiqué par les métadonnées de la collection.

Les imports ont leur propre ordre et leurs propres budgets de requêtes : un OCR
en cours ne retarde pas l’envoi d’un message, même après une action globale du
chat. Une écriture acceptée continue après une déconnexion de l’interface.

## Citations et contrôle

`ragdoc-search` découvre les passages ; `ragdoc-passage --chunk <id>` récupère le
texte exact et son lien ouvrable dans Atelier. Ajouter `--hash <empreinte>` quand
la recherche fournit une empreinte canonique. Les documents anciens reconstruits
depuis des fragments sont explicitement indiqués comme non vérifiés.

Une page PDF n’est exposée que si sa provenance est connue. L’épinglage conserve
le texte complet lorsque les segments paginés ne couvrent pas tout le document.
L’approbation vérifie les empreintes du texte et des métadonnées, la présence de
fragments indexés et l’indexation des illustrations avant d’annoncer la réussite.

Les tests de l’adaptateur dans `rust/crates/atelier-kb/tests` sont isolés et
n’écrivent pas dans l’index NAS. La validation d’un bundle ouvert suit toujours
la [procédure de validation](atelier-runtime.md).

## Espace Ragdoc intégré

L’onglet Ragdoc du Dépôt regroupe Importer, À vérifier, Bibliothèque, État et
Réglages. Les PDF locaux et les pièces jointes Zotero passent dans la même file
persistante. Le lancement est explicite, les conversions sont séquentielles et
la pause laisse finir le PDF en cours. Le choix Mistral/MinerU et les métadonnées
Zotero accompagnent les reprises. Un doublon vérifié reçoit un résultat distinct,
sans nouvelle conversion. Les DOI produisent seulement une fiche bibliographique.

La vérification compare une copie locale du PDF dont l’empreinte a été contrôlée
avec le Markdown, les tableaux et les figures. La galerie sert cette copie et les
images via une route locale confinée aux brouillons. La navigation par page ne
s’affiche que pour des segments vérifiés ; le texte complet reste disponible.
L’approbation contrôle à nouveau le PDF original. Après une indexation réussie,
le brouillon et un reçu lié à son empreinte sont conservés pour réconcilier une
réponse perdue. Un brouillon indisponible peut être écarté explicitement.

La sélection Zotero lit l’API locale de Zotero et conserve titre, auteurs, année,
revue, DOI et clés Zotero, y compris pour les PDF liés. La veille, désactivée par
défaut, vérifie toutes les cinq minutes et conserve ses notifications localement ;
elle ne lance aucun import. État interroge l’index canonique, sans prétendre
vérifier la disponibilité du service MCP. Les nouveaux messages corrélés sont
`articleReview`, `ragdocZotero` et `ragdocStatus`.

La sélection Zotero demande aussi un contrôle groupé des empreintes PDF. Un badge
« Déjà importé » exige une correspondance du PDF et des métadonnées avec l’index
actif. Une absence de correspondance reste « Non retrouvé », et une panne ou un
fichier illisible reste « Statut non vérifié ». Les filtres isolent ces résultats
et les travaux dans la file. Les PDF confirmés sont ouvrables et non sélectionnables.
Le sélecteur ouvert actualise ses statuts après une indexation ou un doublon.
