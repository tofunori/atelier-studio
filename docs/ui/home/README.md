# Captures — plan 017 (Research Home)

Captures **déterministes** exigées par le plan (§ Contrôle visuel), prises sur
le bundle de production via le banc `#homebench-<état>[-light]` (fixtures
fixes, `now` gelé au 2026-07-09T18:00Z, passe par le vrai
`deriveResearchHomeModel`).

| Fichier | État | Taille |
|---|---|---|
| `017-home-rich-dark-1512.png` | historique riche (terminé + interrompu + 6 artefacts) | 1512×883 dark |
| `017-home-clean-light-1512.png` | sans erreur (À traiter absent) | 1512×883 light |
| `017-home-running-dark-1280.png` | tour en cours (badge running + durée + « Revenir au thread ») | 1280×800 dark |
| `017-home-empty-project-dark-800.png` | projet sans thread — une colonne, hint neutre | 800×600 dark |
| `017-home-no-project-dark.png` | zéro projet | 1280×800 dark |
| `017-home-sidecar-dark.png` | sidecar déconnecté + thread interrompu (distinct de Continuer — pas de doublon) | 1280×800 dark |
| `017-home-sidecar-dark-800.png` | idem en étroit — prouve l'ordre Continuer → À traiter → Artefacts → Démarrer | 800×600 dark |
| `017-home-loading-dark.png` | démarrage à froid (connecting) : squelette sobre, ni alerte ni faux vide | 1280×800 dark |

Reproduire : `npx vite preview` puis
`http://localhost:4173/#homebench-rich`, `-clean-light`, `-running`,
`-empty-project`, `-no-project`, `-sidecar`.

Grille de lecture (plan 017) : premier regard = titre projet puis carte
Continuer ; un seul accent orange (Nouveau chat) ; sections cardless, seule la
carte Continuer est élevée ; dates relatives avec ISO du record en `title` ;
libellés = records (« terminé », « interrompu », « usage enregistré »).
