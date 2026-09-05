# Réglages Atelier — intégration du design approuvé

## Direction

Interface sobre et raffinée : typographie système légère, navigation compacte,
orange réservé aux repères, lignes discrètes plutôt que cartes encadrées.
Le prototype approuvé a servi de référence visuelle, les actions de production
et la persistance des préférences ont été conservées.

## Plan réalisé

1. Recomposer la fenêtre : identité Atelier, recherche, cinq rubriques,
   navigation avec icônes, statut d’enregistrement et réinitialisation.
2. Hiérarchiser les options : réglages courants immédiatement visibles,
   personnalisation et diagnostic dans des replis nommés, contrôles plus légers.
3. Construire l’aperçu Apparence à partir des préférences réelles et harmoniser
   la résolution des thèmes natifs clair, sombre et système, y compris le terminal.
4. Ajouter la recherche traduite : navigation vers le champ, ouverture des
   options avancées, défilement et focus clavier. Vérifier les interactions,
   effectuer la revue indépendante, reconstruire et inspecter le bundle macOS.

## Périmètre

- Général, Modèles, Apparence, Atelier, Consignes.
- Recherche FR/EN, raccourci Cmd/Ctrl K, états sans résultat et retour aux options.
- Aperçu des tailles de texte, largeur de lecture, densité et couleurs.
- Conservation du catalogue de thèmes, des options et des actions existantes.
- Présentation adaptée aux fenêtres étroites.

## Vérifications

- TypeScript et build Vite réussis.
- 224 tests ciblés réussis (18 fichiers).
- 654 tests sidecar réussis (40 fichiers).
- Galerie : parity ok, diff suite 207 tests, aucun TODO.
- Revue indépendante : deux corrections intégrées (terminal clair et bordure
  sombre native conservée), puis aucun problème concret restant en revue statique.
- Bundle macOS reconstruit et relancé depuis le checkout attendu ; santé du
  sidecar HTTP 200, ok true.
- Inspection native des cinq rubriques, du catalogue chargé (688 modèles),
  de la consigne existante et de la recherche vers un champ avancé avec focus.
- Deux retouches de libellés après inspection ; 12 tests de navigation/recherche
  repassés. Les mises en page étroites ne sont pas couvertes par cette inspection
  native de bureau.
