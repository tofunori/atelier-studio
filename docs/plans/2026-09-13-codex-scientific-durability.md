# Durcir le harnais Codex pour les longues analyses scientifiques

## Mandat et réception

Demande : plan détaillé puis implémentation par GPT-5.6-Sol, effort high.
Sol possède les changements du harnais, du stockage, du provider et leurs tests.
Le parent possède ce plan, la revue indépendante et les contrôles de réception.
Les changements préexistants et la correction `atelier-file-scope` sont conservés.
Aucun commit, push, changement de mémoire, release ou DMG n'est demandé.

Activation : l'utilisateur a d'abord autorisé l'arrêt/rebuild/relance une fois
prêt, puis a demandé « attend avant de relancer ». Cette dernière consigne prime :
l'instance ouverte reste intacte ; la reconstruction/remise en service de l'app
est en attente. Les compilations et essais de serveur isolé continuent.

Objectif : retrouver la bonne session après un arrêt précoce, conserver les sorties
acceptées ou exposer leur défaut de sauvegarde, et laisser vivre les calculs
silencieux dont le statut ne prouve pas un échec. Ce travail ne promet pas une
exécution distante exactement une fois ni la validité scientifique des résultats.

## État initial vérifié

- `codex.rs` ouvre la session native avant le tour ; `send.rs` persiste normalement
  son identifiant après le retour de `send()`. Les événements de goal disposent
  déjà d'une voie de persistance anticipée, qui doit être conservée.
- `HarnessThread::dispatch` ignore le retour de `HarnessJournal::append`.
  Le journal refuse les événements sérialisés de plus de 512 Kio.
- Codex utilise 15 minutes de silence par défaut et un second compteur de
  45 minutes sans événement traduit hors usage. L'expiration demande un arrêt.
- La récupération `task_complete`, la lecture native et les curseurs du journal
  existent. Les reçus en vol deviennent `uncertain` au redémarrage.
- Les tests antérieurs couvrent les reprises simulées ; ils ne démontrent pas
  une endurance native de plusieurs heures. Un test d'annulation a échoué sous
  parallélisme puis passé isolément et en séquentiel.

## Lot 1 — Session native persistée avant exécution

1. Ajouter ou adapter un contrat interne explicite de session ouverte. Il doit
   porter l'identité Atelier, l'identité Codex et permettre d'attendre la sauvegarde.
2. Après `thread/start` ou `thread/resume`, sauvegarder ce lien avant `turn/start`.
   Un signal seulement envoyé dans une file sans accusé de persistance ne suffit pas.
3. Ne pas lancer un nouveau tour si cette sauvegarde échoue ; retourner une erreur
   actionnable et préserver le reçu/l'historique existant.
4. Couvrir les tours ordinaires, la reprise et les replis de steer concernés.
   Préserver les goals et empêcher une notification tardive d'une ancienne session
   de remplacer un lien plus récent.
5. Garder les providers non Codex compatibles via un comportement par défaut.

Réception : un faux provider ouvre une session puis attend avant toute réponse ;
la réouverture du store retrouve déjà son identifiant. Un échec de stockage
empêche `turn/start`. Une reprise réutilise cette session sans créer un second fil.

## Lot 2 — Journal fiable et sorties volumineuses

1. Remplacer la perte silencieuse par un résultat d'écriture exploitable.
2. Externaliser les gros événements/payloads dans un répertoire de données du
   journal, avec référence bornée, identité/intégrité et écriture atomique durable.
   Ne jamais écrire ces données dans le bundle ou les projets scientifiques.
3. Résoudre ces références dans les chemins de lecture/materialisation/rejeu,
   en gardant le contrat affiché et la compatibilité des anciens journaux.
4. Couvrir copie/fork, rewind, suppression et chemins mobiles qui lisent le même
   journal. Une référence absente ou corrompue doit produire un défaut explicite,
   jamais une réponse inventée ou silencieusement vide. Éviter les chemins libres,
   traversées de répertoire et lectures démesurées.
5. À l'échec de sauvegarde, ne pas présenter l'événement comme durablement acquis.
   Conserver ce qui peut l'être en mémoire avec une limite explicite et/ou arrêter
   proprement le tour avec un défaut de sauvegarde visible. Ne pas boucler en
   essayant de journaliser l'erreur dans le stockage déjà défaillant.
6. Réutiliser une voie d'erreur/UI existante si elle convient ; si un champ de
   protocole est nécessaire, mettre à jour les consommateurs et la parité.

Réception : événement >512 Kio relu exactement après réouverture ; payload manquant
et corrompu détectés ; défaut d'écriture/synchronisation injecté et visible ;
fork/replay sans perte ni doublon ; aucun accusé durable mensonger.

## Lot 3 — Silence, progression et interruption

1. Définir les états : activité récente, tour natif en cours mais silencieux,
   attente humaine, état natif terminal, transport indisponible/statut inconnu.
2. Réutiliser `codex_supervision` et les lectures bornées pour vérifier le bon
   couple session/tour lorsqu'un seuil de silence est atteint.
3. Un état terminal récupère la sortie avant de clore le tour. Un tour confirmé
   en cours reste actif, y compris pendant une commande longue sans sortie.
4. Une lecture en échec ne prouve pas que le calcul est mort : exposer l'incertitude
   avec un contrôle Stop disponible, et employer un backoff borné sans avalanche
   de requêtes. Ne pas relancer automatiquement le prompt.
5. Supprimer les interruptions fondées uniquement sur le temps silencieux dans
   les deux compteurs Codex. Garder les délais des RPC, la détection de processus
   mort et les interruptions explicitement demandées.
6. Préserver les pauses humaines, l'identité parent/enfant et les nettoyages après
   annulation. Une répétition d'alertes ne doit pas grossir le journal indéfiniment.

Réception : dépasser virtuellement les anciens seuils pendant un tour natif
`inProgress` ne produit aucun `turn/interrupt` ; lecture native indisponible
reste incertaine ; fin silencieuse récupérée une fois ; Stop termine de manière
bornée ; attente humaine et fin d'un enfant ne ferment pas le parent.

## Lot 4 — Revue et validation de durée

1. Sol exécute les tests ciblés de chaque lot et livre les contrats, commandes,
   résultats et limites. Il ne modifie pas les attentes pour masquer un défaut.
2. Le parent examine le diff indépendamment et exerce les cas de panne majeurs.
3. Exécuter les suites des crates touchées, les tests frontend/protocole réellement
   concernés et le typecheck si le client/contrat change. Examiner les échecs
   parallèles sans les déclarer automatiquement bénins.
4. Employer les fixtures de reprise existantes dans un profil temporaire isolé :
   arrêt/redémarrage du seul serveur fixture, perte de connexion, grosses sorties,
   événements tardifs et absence de double exécution. Aucun test de panne sur les
   chats ou les processus utilisateur.
5. Réaliser une endurance locale d'au moins dix minutes si la fixture disponible
   permet les nouveaux scénarios ; garder paramètres, durée, pertes/doublons et
   résultats dans un rapport. Les tests à délais raccourcis couvrent la logique
   des seuils de silence sans prétendre être une mesure d'endurance réelle.
6. Préparer le scénario natif de plusieurs heures : analyse en lecture seule sur
   corpus synthétique, checkpoints de contenu, compaction, reconnexion et reprise.
   Consigner ce qui a réellement été exécuté ; ne pas présenter un provider simulé
   ou un court smoke comme la preuve de ce scénario complet.
7. Appliquer `docs/agent-reference/atelier-runtime.md` pour construire/relancer le
   bundle. L'instance ouverte ne sera arrêtée qu'avec l'autorisation prévue par
   ce document. La revue source et les tests isolés continuent indépendamment.

## Portée volontairement séparée

Le chemin dégradé de changement de modèle/compaction mérite un contrôle de
non-régression, mais ce mandat n'inclut pas une réécriture du mécanisme Codex de
compaction. Les fichiers de résultats scientifiques ne sont pas modifiés.

## Suivi

- [x] Plan détaillé et critères de réception.
- [x] Implémentation Sol high : session anticipée.
- [x] Implémentation Sol high : journal et gros événements.
- [x] Implémentation Sol high : supervision du silence.
- [x] Revue indépendante et tests de réception ciblés.
- [x] Endurance isolée exécutée et rapport qualifié : historiques complets ; livraison systématique des notifications non établie.
- [x] Bundle reconstruit, chemin du processus et sidecar vérifiés, interface restaurée après autorisation explicite de relance.
