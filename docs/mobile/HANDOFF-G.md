# Handoff jalon G — plan 034

### Périmètre livré

Gallery + fichiers scientifiques (client mobile + durcissement gateway) :

1. **Index gallery** paginé client (24/page), filtres Tous/PDF/Figures/LaTeX/Données/Code
2. **Miniatures** progressives (petites figures seulement, cache LRU, pas full-res pour la grille)
3. **fileId opaque** uniquement — chemins non utilisés côté client pour l’accès
4. **Viewers** : PDF (object/iframe), image zoom, SVG sanitizé, texte/LaTeX/code (n° lignes, recherche, copie)
5. **Gros fichiers** : confirmation > 5 Mo avant téléchargement
6. **ETag / Range** côté gateway + client (`If-None-Match`, `Accept-Ranges`)
7. **CSP sandbox** sur réponses fichiers ; pas d’HTML projet exécuté privilégié
8. **Ajouter au chat** → pièces jointes dans le shelf composer (fileId + nom)
9. **Partager** via `navigator.share` si dispo
10. Layout **list** pour onglet Fichiers, **grid** pour Gallery

### Fichiers

- Gateway : `rust/crates/atelier-remote/src/routes.rs` (kind, modifiedAt, etag, CSP)
- Mobile : `files/*`, `gallery/GalleryScreen.tsx`, `transport/filesClient.ts`, CSS, App
- `docs/mobile/HANDOFF-G.md`

### Contrats/invariants

- Client n’envoie jamais de chemin arbitraire pour lire un fichier (fileId).
- `relativePath` éventuel du serveur n’est pas stocké dans le modèle client.
- SVG : scripts / handlers / javascript: retirés.
- Anti-traversée : toujours côté gateway (tests security existants verts).

### Tests exécutés

```text
cd mobile && npm test
  → 62+ passed (classify, svg sanitize, filesClient, pendingAttach, suite A–F)

cargo test -p atelier-remote --manifest-path rust/Cargo.toml --locked
  → 13 security + 4 path_policy passed
```

### Mesures appareil

- PDF/PNG/LaTeX réels sur iPhone : non rejoués ici (pas d’IPA).
- Données de test : mocks + gateway security suite.

### Limites

1. PDF = viewer WebKit embarqué (pas PDFKit natif) — suffisant MVP Tauri WebView.
2. Annotation figure interactive hors scope G (add-to-chat metadata seulement).
3. Index gallery shallow (racine + figures/outputs/docs) — comme gateway C.
4. HTML projet non ouvert comme page ; si type code/html → texte.

### Demande à Codex

**`GO`** pour jalon H (notifications / interactions natives) si revue fileId/viewers OK ;
sinon corrections sur SVG/PDF/partage.
