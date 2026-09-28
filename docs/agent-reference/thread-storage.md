# Stockage des discussions et des reçus

`atelier-store` conserve les chemins habituels dans le répertoire de données
(`~/Library/Application Support/atelier-studio` sur macOS) : `threads.json`
et `chat-receipts.json`. Chaque magasin possède désormais des fichiers voisins :

- `.baseline` : checkpoint versionné faisant autorité, avec les suppressions
  et les identifiants modifiés par le nouveau stockage ;
- `.journal` : transactions JSONL incrémentales, synchronisées avant acquittement ;
- `.lock` : verrou entre processus durant lecture de changements, mutation et export ;
- `.owners` pour les reçus : verrou de durée de vie qui distingue un redémarrage
  d'une seconde instance encore active.

La première mutation crée le checkpoint à partir du JSON existant. Une opération
ordinaire ajoute uniquement ses enregistrements au journal. Les lectures utilisent
un snapshot en mémoire ; une mutation recharge les changements d'autres instances
sous verrou. Le cache externe doit comparer `ThreadStore::storage_revision(path)`
avant et après ouverture : cette empreinte couvre JSON, baseline et journal.

Le JSON historique est un **export périodique**, pas la source de vérité courante.
La compaction le met à jour avant la mutation suivante lorsque le journal atteint
1 024 transactions ou dépasse 16 Mio. Les transactions partielles finales après
un crash sont ignorées puis tronquées avant écriture ; une ligne complète invalide
bloque les mutations. Les suppressions restent conservées après compaction.

## Export avant retour à une ancienne version

1. Arrêter **tous** les processus Atelier utilisant ces données, y compris les
   sidecars, le gateway et les anciennes versions. La commande ne les arrête pas
   et le drapeau ci-dessous constitue une confirmation, pas une détection automatique.
2. Sauvegarder le répertoire de données complet pendant cet arrêt.
3. Depuis le dépôt de la nouvelle version, exporter explicitement le bon répertoire :

```sh
cargo run --manifest-path rust/Cargo.toml -p atelier-store --example export_legacy -- \
  --app-dir "$HOME/Library/Application Support/atelier-studio" \
  --all-processes-stopped
```

Aucun chemin de production n'est choisi automatiquement. Le programme appelle
les deux API `export_legacy`, écrit les JSON complets par remplacement durable,
met à jour les baselines et vide les journaux. Ouvrir les reçus transforme les
envois précédemment en cours en `uncertain`, comme un redémarrage normal.
Si l'export des reçus échoue, le message précise que les discussions sont déjà
exportées ; corriger le problème et relancer avant d'utiliser l'ancienne version.

4. Ne démarrer l'ancienne version qu'après la réussite de l'export. Conserver
   **ensemble** les JSON, leurs `.baseline` et `.journal` dans les sauvegardes et
   lors du retour à la nouvelle version. Ne supprimer aucun fichier auxiliaire
   pour forcer une migration.

Les anciennes versions ne lisent pas le journal : toute modification ultérieure
par une nouvelle version demande un nouvel export avant un autre retour en arrière.
Au retour vers la nouvelle version, les ajouts legacy et les changements portant
sur des enregistrements jamais modifiés par le journal sont importés. Les éditions
legacy d'identifiants déjà modifiés par le nouveau stockage sont ignorées pour
éviter qu'un vieux snapshot écrase une discussion récente ou ressuscite une
suppression. Ces éditions ne sont **pas fusionnées automatiquement** ; conserver
la sauvegarde pour une récupération manuelle. Une compaction ou un nouvel export
remplace ensuite le JSON legacy par l'état faisant autorité.

Les tests utilisent uniquement des répertoires temporaires :

```sh
RUSTC_WRAPPER= cargo test --manifest-path rust/Cargo.toml -p atelier-store --lib
RUSTC_WRAPPER= cargo test --manifest-path rust/Cargo.toml -p atelier-store --example export_legacy
```
