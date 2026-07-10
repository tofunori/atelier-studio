# État d'exécution Fable — série 016→025 (2026-07-09)

Directive de Thierry (goal actif) : enchaîner les plans jusqu'à 025 inclus,
SANS revue Codex intermédiaire (revue globale à la fin), commit + push à
chaque étape, implémenter les plans à la lettre, auto-vérification après
chaque implémentation (ultracode actif : workflows multi-agents, panels
adversariaux).

## Fait (DONE, committé, poussé)
- 016 tokens/primitives (+ complétion 5a1e941 des fichiers manqués par le
  commit auto — l'auto-commit de l'app N'AJOUTE JAMAIS les fichiers non
  suivis : toujours vérifier après coup)
- 017 Research Home (0539616 ; corrections du vérificateur indépendant
  incluses : tri 800px, état chargement tri-état sidecar, dédup, i18n maps)
- 018 hiérarchie workspace (37a93c8 ; 5 agents ∥ + panel adversarial 3
  lentilles, ~15 corrections)
- 019 galerie (f76e10d, 8a87742, d43afe7, eb2e015 ; notes détaillées dans
  plans/019-execution-notes.md ; E2E 12/12)
- Bonus : signature stable « Atelier Dev Signing » (tauri.conf.json) — fin
  des prompts Documents à chaque rebuild. À VALIDER au prochain rebuild :
  plus aucun prompt attendu.

## Fait — en attente de revue Codex (2026-07-10)
- 024 Research Navigator (branche `claude/atelier-projects-panel-redesign-f86165`,
  worktree dédié, 5 commits, PAS poussé — consigne de Thierry 2026-07-10 :
  revue Codex AVANT push/merge, tranche par tranche). Détails : plans/README.md.

## Fait — en attente de revue Codex (2026-07-10, tranche 020)
- 020 tours de chat + composer (branche `claude/atelier-020-chat-composer`,
  basée sur la tranche 024 validée par Codex ; PAS poussé — revue Codex avant
  push/merge). Détails : plans/README.md.

## Fait — en attente de revue Codex (2026-07-10, tranche 021)
- 021 Settings/a11y/responsive/QA visuelle (branche `claude/atelier-021-settings-a11y`,
  basée sur la tranche 020 ; PAS poussé — revue Codex avant push/merge).

## Fait — en attente de revue Codex (2026-07-10, tranche 023)
- 023 polish Precision Native (branche `claude/atelier-023-polish`, base 021 ;
  PAS poussé). Galerie exclue (directive gallery/assets) — reporter cette
  partie du plan 023 après l'atterrissage CM6/galerie.

## Ordre restant (dépendances vérifiées)
2. **025** harnais agentique (P0 XL, dép 008–010/015–016/018 ✓) — livre
   docs/AGENT_HARNESS_CONTRACT.md
3. **020** tours de chat + composer (exige 025 DONE — STOP sinon)
4. **021** settings/a11y/responsive/QA
5. **022** perf chargement v2
6. **023** polish cosmétique
(013 distribution : hors périmètre du goal actuel)

## Contexte opérationnel
- Tâche parallèle de Thierry : durcissement du démarrage sidecar
  (task_09c69bd5) dans un worktree .claude/worktrees/… — NE PAS toucher à
  ses process/fenêtres ; deux instances d'Atelier peuvent coexister
  (cibler les fenêtres par PID du bundle principal).
- Boucle d'entre-tuerie sidecar diagnostiquée (voir chip) : après un
  build, si « Sidecar déconnecté » persiste, UNE relance propre machine
  calme suffit ; ne pas lancer de sidecars manuels de test sans tuer l'app.
- AGENTS.md à la lettre pour toute relance ; suites galerie obligatoires si
  gallery/ touché ; gallery-dist est GITIGNORÉ (restagé au build).
- Méthode par plan : lire le plan entier → drift check → contrats/i18n
  d'abord (fichiers partagés réservés à l'intégrateur) → fan-out agents sur
  fichiers disjoints si utile → intégration → panel adversarial → gates →
  captures → AGENTS.md → README des plans → commit+push.
