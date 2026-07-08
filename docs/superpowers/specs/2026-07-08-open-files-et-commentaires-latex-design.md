# Design : ouverture de fichiers depuis le chat + commentaires LaTeX (couleurs, panneau, actions groupées)

Date : 2026-07-08 · Statut : approuvé par Thierry

## Partie A — Ouvrir les fichiers du chat dans Atelier

### Problème
Cliquer un fichier mentionné dans une réponse du chat n'ouvre rien :
- Le chip « Edited `<fichier>` » (résumé d'un tool call Write/Edit) ne fait qu'afficher le diff git inline (`Chat.tsx:295-307`).
- Un chemin en code inline sans `:ligne` ne devient pas un chip cliquable (`Chat.tsx:375` exige `.includes(":")`).

L'infrastructure d'ouverture existe déjà : `openFileRef` → événement `chat-open-file` → `openFileTab` (App.tsx:1070) → onglet Atelier (md_studio / latex_studio / pdf_viewer / image selon extension).

### Changements
1. **Code inline** (`Chat.tsx` renderer `code`, MD_COMPONENTS + variante streaming) : un chemin nu correspondant à `FILE_REF` (extension reconnue) devient un chip `file-ref` cliquable, sans exiger `:ligne`.
2. **Chemins absolus** : si le chemin commence par `/` et est sous le projet actif, le convertir en relatif avant `openFileTab` (dans le handler `chat-open-file` d'App.tsx) ; sinon ignorer proprement (pas de tab cassé).
3. **Chip « Edited »** : le clic sur le nom du fichier ouvre le fichier dans Atelier (`openFileRef(path)`) ; le toggle du diff git est déplacé sur une petite icône diff monochrome séparée à droite du chip. Aucune perte de fonctionnalité.

### Hors scope
Fichiers hors du projet actif (autre racine) ; nouveaux types d'éditeurs.

### Tests
`npx tsc --noEmit`, `npx vite build`. Vérif manuelle : clic sur chip Edited, chemin inline avec et sans `:ligne`, chemin absolu.

## Partie B — Commentaires LaTeX : couleur par commentaire, panneau, envoyer tout, tout supprimer

### Contexte existant
`gallery/assets/latex_studio.html`, fonctions `texc*` (lignes ~1167-1340). Stockage serveur : `POST/GET /pdfannot` (`gallery/server/routes/annotations.mjs`), fichier `.fig_thumbs/pdf_annots.json`, clé `"tex-comments:"+path`. Objet commentaire : `{id, from, to, text, comment}`. Couleur unique codée en dur `.texc-hl` (ambre). Envoi au chat un-par-un via `postMessage {type:"atelier-add-to-chat"}` → pièce jointe composer (App.tsx:1040). Aucune opération groupée.

**Contrainte dure (docs/PIEGES_CONNUS.md §6)** : ne pas toucher au ré-ancrage par contenu (`texcFind`/`texcAnchorAll`/`texcSyncFromMarks`). On ajoute des champs et de l'UI seulement.

### Changements
1. **Couleur par commentaire** : champ `color` optionnel (absent = ambre, rétrocompatible). 5 pastilles dans le popup `#texcPop` : ambre (défaut), rouge, bleu, vert, violet — fond ~14 % opacité + border-bottom pointillé, même recette que `.texc-hl` actuel. Clic pastille = recolorer le mark immédiatement + `texcSave()`.
2. **Panneau « Commentaires »** : bouton toolbar à côté du bouton outline ; panneau latéral sur le modèle de `#outlineEl`. Item = pastille couleur + extrait passage tronqué + commentaire + × de suppression ; clic item = scroll + flash du passage. En-tête : boutons « Envoyer tout au chat » et « Tout supprimer ».
3. **Envoyer tout** : UNE pièce jointe via le canal `atelier-add-to-chat` existant, commentaires triés par position document :
   `chemin.tex — N commentaires :` puis `1. (L12-14) « passage… » — Commentaire : …` par ligne.
4. **Tout supprimer** : confirmation inline (bouton devient « Confirmer ? » 3 s), puis `texcAll = []`, clear des marks, `POST /pdfannot` avec tableau vide (le serveur écrit déjà un `.bak`).

### Hors scope
Commentaires dans `code_editor.html` ; recoloration globale ; catégories nommées.

### Tests
`node gallery/server/tests/diff_suite.mjs` avant/après (obligatoire). Vérif manuelle : créer/colorer/rouvrir (persistance couleur), ancien commentaire sans `color` (ambre), envoyer tout, tout supprimer puis vérifier `.bak`. Reporter `latex_studio.html` modifié vers `src-tauri/gallery-dist/` et le `.fig_thumbs/` servi.
