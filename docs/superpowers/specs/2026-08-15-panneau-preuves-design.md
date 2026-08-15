# Panneau Preuves — design

Date : 2026-08-15 · Statut : approuvé par Thierry (artefact « Panneau Preuves »)

## Objectif

Pendant la rédaction, une demande de référence au chat (« trouve-moi une référence qui
appuie cette phrase ») produit un **passage exact, visible et vérifiable** — la citation,
la source, la page — épinglable dans un **panneau Preuves par projet**, rattaché à la
phrase du manuscrit qu'il appuie. Fonctionne avec tous les providers (Claude, Grok, Codex).

## Décisions tranchées

| Question | Choix |
|---|---|
| Destination | Panneau « Preuves » par projet (pas la KB, pas gbrain) |
| Affichage | Carte dans la réponse, repliée sur UNE ligne — le chat reste léger |
| Ancrage | Automatique via la sélection en direct (`~/.claude/fig-selection.json`) au moment de la demande |
| Ton | Sobre — système de design strict (SVG trait fin, tailles 10–15, rayons 6/10, accent réservé à l'état épinglé) |
| Providers | Agnostique — convention markdown, aucun événement propriétaire |

## UX

### Carte passage (chat)

- **Convention d'émission** : un lien `#atelier-zotero-passage?…` **seul dans son paragraphe**
  se rend en carte ; en inline il reste la pilule actuelle (rétro-compatible). Paramètres
  existants (key, pdfKey, file, page, quote ≤ 900) + nouveau paramètre optionnel `supports`
  (phrase appuyée, encodée) que l'agent joint quand une sélection était active.
- **Repliée (défaut)** : une ligne — début de citation en italique (ellipse), `citeLabel · p. N`,
  chevron (`Tick`) + icône épingle. Aucun bloc, max-width ~540px.
- **Dépliée** : citation complète, source longue, actions « Ouvrir le PDF p. N » (flux
  `chat-open-zotero-passage` existant) et « Épingler ».
- **États épingle** : trait fin neutre → accent quand épinglé (déjà épinglé au chargement =
  accent aussi, via `listPins`). Dé-épingler depuis la carte est permis.

### Panneau Preuves (surface du rail, par projet)

- Groupes = phrase appuyée (`supports.text`), avec `fichier · Llignes` en éteint ;
  épingles sans ancrage dans un groupe « Sans ancrage » en fin.
- Rangée = citation (italique) + `citeLabel · p. N` ; clic → PDF à la page ; actions :
  copier `\autocite{clé}` , retirer l'épingle (confirmation non requise — réversible en ré-épinglant).
- Tri : groupes par dernier ajout desc ; rangées par ajout desc. Vide : EmptyState sobre.

## Architecture

### Existant réutilisé

- `sidecar/zotero_passages.mjs` : index plein-texte par page + scoring (+ `passageLink`).
- Outil CLI `atelier-zotero-passages` + instruction injectée (`zotero_passage_prompt.mjs`,
  et son équivalent côté backend Rust — à localiser au plan ; parité obligatoire).
- `md.tsx` : `parseZoteroPassageRef`, pilule, `chat-open-zotero-passage` (App.tsx → BiblioSurface).
- Sélection en direct : `~/.claude/fig-selection.json` (text, rel, lines, ts).

### Nouveau

1. **Rendu carte** (`md.tsx`) : détection au niveau du composant `p` — paragraphe dont l'unique
   enfant est un lien passage → `<PassageCard>`. Composant dans `src/components/chat/`.
2. **Messages WS** (backends Rust **et** Node, sémantique identique, tests des deux côtés) :
   - `pinPassage { projectRoot, pin }` → ack `{ type:"evidencePins", pins }`
   - `listPins { projectRoot }` → `{ type:"evidencePins", pins }`
   - `unpinPassage { projectRoot, pinId }` → `{ type:"evidencePins", pins }`
3. **Stockage** : Application Support `evidence/<sha256(projectRoot)>.json` — HORS repo
   (l'auto-commit ne doit jamais balayer les preuves). Écriture atomique (pattern `atomic.rs` /
   équivalent mjs). Schéma d'épingle :
   ```json
   {
     "id": "uuid", "ts": 0,
     "quote": "…", "zoteroKey": "…", "pdfKey": "…", "pdfFile": "….pdf", "page": 7,
     "citeLabel": "Williamson 2021",
     "supports": { "text": "…", "file": "intro.tex", "lines": "L42" } | null,
     "threadId": "…", "provider": "claude"
   }
   ```
4. **Surface Preuves** : onglet du rail (même mécanique que les surfaces existantes),
   composant `src/components/EvidenceSurface.tsx`, i18n fr/en complet.
5. **Instruction renforcée** (`zotero_passage_prompt.mjs` + équivalent Rust) : demande de
   référence + sélection récente → chercher via l'outil, répondre avec le lien-carte seul
   dans son paragraphe, joindre `supports` depuis la sélection. Jamais de citation inventée :
   uniquement les passages retournés par l'outil.

### Capture de l'ancrage

Au clic « Épingler », le frontend envoie le `supports` porté par la carte ; si absent,
le backend lit `fig-selection.json` en secours SEULEMENT si `ts` < 15 min. Sinon `supports: null`.

## Erreurs

- PDF introuvable à l'ouverture : toast existant (flux passage actuel, inchangé).
- Écriture d'épingle échouée : toast erreur, état de la carte inchangé (pas d'optimisme).
- `quote` absente/vide dans le lien : pas de carte, pilule inline (dégradation douce).

## Tests

- `md.tsx` : détection paragraphe-seul (carte) vs inline (pilule) ; quote vide → pilule.
- Store épingles : ajout/liste/retrait + atomicité (Rust `cargo test`, Node vitest, parité).
- `EvidenceSurface` : groupement par `supports`, groupe « Sans ancrage », actions.
- Instruction : test d'injection (les deux backends émettent la même instruction).
- Sonde WS de bout en bout après relance (pattern des sondes de cette session).

## Hors périmètre (YAGNI)

Intégration KB/gbrain, export BibTeX massif, surlignage persistant dans le PDF,
synchronisation multi-machines, re-ranking sémantique de l'index.
