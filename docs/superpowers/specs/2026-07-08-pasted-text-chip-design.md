# Chip « Texte collé » dans le chat — design

Date : 2026-07-08 · Statut : approuvé par Thierry

## Problème

Coller un long texte dans le composer insère tout le contenu dans le textarea,
puis la bulle utilisateur imprime le texte au complet. On veut le comportement
de Claude Desktop : un chip compact « Texte collé · N lignes », cliquable pour
un aperçu, pendant que le modèle reçoit quand même le texte intégral.

## Design

### Déclenchement
Dans le `onPaste` du textarea (`src/components/Chat.tsx`) : si le texte collé
dépasse le seuil (**≥ 1000 caractères ou ≥ 10 lignes**), `preventDefault()` et
remontée via un nouveau callback `onPasteText(text)`. Sous le seuil,
comportement natif inchangé. Le collage d'images reste inchangé.

### Stockage
Dans `App.tsx`, `onPasteText` crée un attachment `kind:"paste"` (nouveau kind
dans le type `Attachment` + miroir `ChatAttachment`), calqué sur `onQuote` :
`name` = « Texte collé », `lines` = nombre de lignes, `text` = contenu complet.
Dédup par `text` via `addAttachment` existant.

### Envoi — aucun changement
Le mécanisme existant concatène le `text` des attachments dans le prompt envoyé
au modèle (`fullPrompt`, App.tsx). La bulle utilisateur n'affiche que le `label`
compact déjà produit pour les attachments. Le modèle reçoit tout ; l'UI reste
compacte.

### Affichage
- Chip automatique dans `.chips-row` du composer, supprimable (✕ existant).
- Clic sur le chip → **popover aperçu** : panneau flottant scrollable avec le
  texte, fermé au clic ailleurs. Basé sur `.chip-preview` existant, rendu
  cliquable/scrollable pour les chips `paste`.
- Styles 100 % via tokens (rayon 10, fond de surface élevée + ombre douce,
  icône SVG monochrome stroke 1.3–1.5, tailles de texte du système).

## Hors scope
- Rendu markdown du texte collé dans l'aperçu (texte brut monospace suffit).
- Persistance du chip dans la bulle au-delà du `label` existant.
