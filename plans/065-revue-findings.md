# Revue complète du port KB — synthèse (2026-08-16, commit f32796a7)

3 relecteurs adversariaux : sécurité/intégration (KBS-01..15), couverture
(KBG-01..16), correction ligne à ligne (KBC-01..31). Rapports complets dans les
transcripts de session ; ci-dessous l'index décisionnel. VERDICT : le store
local est solide, la bascule du flag serait PRÉMATURÉE.

## BLOQUANTS avant toute activation (vague 4 — correctifs)
- B1 KBC-02 : gbrain exécuté en LOCAL au lieu de `ssh nas` (ATELIER_GBRAIN_SSH_HOST
  ignoré) — écritures dans le MAUVAIS brain. Le plus grave.
- B2 KBC-01/KBG-01 : ensureFresh jamais porté — texte périmé servi sans signal,
  erreur dure sur cache absent (Node se répare seul).
- B3 KBS-04/KBG-04/KBC-16 : kinds youtube/zotero refusés à l'add ET décoration
  perdue (timestamp, lien profond) sur les sources DÉJÀ épinglées.
- B4 KBC-04/KBG-05 : MinerU jamais spawné — imports dégradés en pdftotext sans
  progression ni signal.
- B5 KBS-01 : panic in-process sur dossier racine (+ KBC-29 verrou non-RAII qui
  fuit sur panic) ; KBS-02 : aucun spawn_blocking — la KB bloque les threads du
  serveur (fetch 20 s, scans).
- B6 KBC-03 : garde « jamais une citation sans token » perdue — citations hors
  sujet possibles.
- B7 KBG-02 : le soak prévu n'exerce PAS search (wrappers non basculés) —
  redéfinir le critère Done de la phase C.

## MAJEURS (vague 5 — fixtures + alignements)
- KBG-03 search sans aucun passage fixturé (466 lignes non contraintes) ;
  KBG-05/10/11/13 (faux MinerU, corpus gbrain semé, doublons, pannes) ;
  KBG-07 refreshed:true ; KBG-08 registre corrompu ; KBG-15 --dir.
- KBC-05 URL non normalisée (doublons de sources) ; KBC-06/07 non-UTF8/BOM ;
  KBC-08 mtimeMs f64 (invalidation croisée des caches) ; KBC-09..15 arrondis/
  limites/chaînes vides ; KBC-17..28 divers (voir transcripts).
- KBS-03 fetch sans cap mémoire/redirects (disjoncteur processus disparu) ;
  KBS-11 folder 4 Go in-process ; KBS-13 regex recompilées.

## MINEURS / risques acceptés
- KBS-08/09/12/14/15 (parité Node, durcissements opportunistes) ; KBC-30/31 ;
  KBG-14 (ragdoc ssh — vérif manuelle avant bascule) ; KBG-16/KBC-30
  preserve_order (activer pour rendre la sauvegarde comparable).

## Séquence décidée (mode autonome)
1. Vague 4 : corriger B1..B7 (+ cap fetch KBS-03) — exécuteur + revue.
2. Vague 5 : fixtures des trous KBG (~25 steps) — le contrat s'épaissit.
3. Re-revue delta ciblée, puis STOP : proposition d'activation à l'opérateur
   (sauvegarde store → flag rust → soak redéfini par B7).
