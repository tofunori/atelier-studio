# 023 — Polish Precision Native : avant/après et tests de goût

Direction : **A — Precision Native** (approuvée plan 014). `avant-*.png` =
baselines 021 (avant cette passe) ; les baselines courantes de
`tests/visual/__screenshots__/` sont l'« après ». Diff de palette subtil par
construction (graphite recalibré, pas re-décoré).

## Choix non évidents (rapport exigé par le plan)

- **Palette** : candidats OKLCH du plan rejetés tels quels (canvas 0.185 →
  #101316 quasi noir, sidebar #090c10 — contraire à « jamais noir pur ») ;
  structure perceptuelle conservée (teinte 255, chroma 0.008-0.012, paliers
  side<bg<card<ctl) mais luminances calibrées dans le registre graphite
  existant. Contrastes vérifiés par script (fg/bg 11.97 dark · 15.31 light).
- **Accent light** : #cf630d (assombri) — l'orange dark à 2.9:1 sur le chrome
  light échouait le seuil 3:1.
- **Send accent** : le bouton Envoyer au repos devient l'action primaire
  visible (décision composer 2026-07-09 : « Send/Stop = seule action
  primaire ») — forme 6 px alignée sur les contrôles Atelier, plus de cercle
  générique.
- **Pulses retirés** (budget : une boucle max par surface) : Stop, unread,
  busy et le shimmer du label Working sont statiques ; le spinner/arc reste
  l'unique animation continue.
- **Galerie exclue** : directive de session (gallery/assets intouchable —
  travail CM6/diff Codex en cours, plan 031). La passe galerie du plan 023
  (blur du header, previews blanc plein) reste À FAIRE dans une tranche
  dédiée après l'atterrissage du travail galerie.
- **Comparateur golden** : maxDiffPixelRatio 0.02 + seuil par-pixel absorbe
  un glissement de palette subtil — le harnais attrape les régressions de
  structure/layout, la dérive de teinte se revoit par humain (ces avant/après).

## Tests de goût (étape 8) — sur les 13 golden states

| Test | Verdict | Notes |
|---|---|---|
| 1. Flou (3 masses) | PASS | titre local / colonne de contenu / composer restent distincts |
| 2. Niveaux de gris | PASS | hiérarchie par luminance (side<bg<card<ctl) lisible sans l'orange |
| 3. Accent unique | PASS* | 1 action accent par panneau ; *app vide : Nouveau chat (panneau) + Ouvrir un projet (surface) coexistent — 2 panneaux, toléré par le contrat, à trancher en revue |
| 4. Bordures imbriquées ≤2 | PASS | capsule (1) > diff dépliable (2) ; composer sans bordure interne |
| 5. Marque sans rail | PASS | provenance mono (fig3_spatial.svg +12 −4), capsule d'usage, trace orange |
| 6. Contenu long | PASS | troncatures vérifiées (nav 180 px, chips nom long, titres) |
| 7. Retina/100 % | PASS | séparateurs 1 px nets, icônes grille 16 |
| 8. AI Slop | PASS | zéro gradient décoratif/glass/carte clonée ; le shimmer (seul « effet » restant) a été retiré |
