# Brief — Sidebar : groupement des chats par récence

Lis CLAUDE.md (système de design contraignant). Fichiers : src/components/Sidebar.tsx, src/App.css, src/lib/i18n.ts.

## Tâche unique
Grouper la liste des chats par récence avec micro-labels de section :
- « Aujourd'hui » / « Hier » / « 7 derniers jours » / « Plus ancien » (clés i18n fr+en).
- Basé sur thread.updatedAt (ISO string).
- Label de section : uppercase, --fs-xs, letter-spacing 0.08em, color var(--muted2), padding 10px 8px 4px. PAS de bordure.
- Ne PAS changer le rendu des rangées elles-mêmes (hover actions, pastilles projets, ellipsis — tout existe et doit rester identique).
- L'ordre reste le tri actuel (modifié récent en premier) ; les sections sont juste des séparateurs visuels insérés.
- Rangées : hauteur constante — vérifier qu'aucune rangée ne dépasse ~32px ; si une classe casse ça, corriger avec les tokens.

## Contraintes
- npx tsc --noEmit et npx vite build doivent passer.
- Ne toucher à RIEN d'autre (pas Settings, pas Chat).
- Ne pas committer (je révise et committe).
