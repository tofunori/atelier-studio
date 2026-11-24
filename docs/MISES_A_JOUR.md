# Mises à jour intégrées

Depuis la 2.5.0, Atelier se met à jour tout seul (Mac, AppImage et `.deb`).

## Comment ça marche

1. Au lancement (après 15 s), puis toutes les 6 heures, l'app lit
   `https://github.com/tofunori/atelier-studio/releases/latest/download/latest.json`
   (`src-tauri/src/updater.rs`, `tauri-plugin-updater`). Seuls les builds de
   `release.yml` (`ATELIER_RELEASE_BUILD=1`) vérifient d'eux-mêmes ; un build
   local (relance depuis `main`) ne le fait que par Réglages › Général ›
   Mises à jour › Rechercher, ou avec `ATELIER_UPDATE_CHECK=1`.
2. Nouvelle version : carte en bas à droite (`src/components/update/`),
   notification système si la fenêtre est en arrière-plan. « Plus tard »
   la cache 24 h pour cette version.
3. « Mettre à jour » : documents modifiés confirmés comme pour Quitter,
   téléchargement, **vérification de la signature** contre la clé publique
   de `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`), installation
   (Mac : remplace `Atelier.app` ; AppImage : se réécrit ; `.deb` :
   `pkexec dpkg -i`, mot de passe demandé), redémarrage.

## Publication

`release.yml` signe chaque paquet (`createUpdaterArtifacts`), publie les
`.sig` à côté des paquets, puis le job `updater-manifest` assemble
`latest.json` avec `scripts/updater-manifest.sh` et l'ajoute à la release.

## La clé

- Privée : `~/.tauri/atelier-updater.key` sur le Mac de Thierry, et le
  secret GitHub `TAURI_SIGNING_PRIVATE_KEY` (sans mot de passe). Sans ce
  secret, `release.yml` s'arrête avant le build.
- Publique : `plugins.updater.pubkey` dans `src-tauri/tauri.conf.json`.
- **Perdre la clé privée** = plus aucune mise à jour possible pour les
  versions installées : il faudrait une nouvelle clé et une réinstallation
  à la main partout. La garder sauvegardée hors du Mac.

Remettre le secret (même clé) :

```
gh secret set TAURI_SIGNING_PRIVATE_KEY -R tofunori/atelier-studio < ~/.tauri/atelier-updater.key
```

## Essai sans publier

`ATELIER_UPDATE_ENDPOINT=<url de latest.json>` remplace l'adresse du
manifeste ; la signature reste vérifiée contre la clé compilée. Un build de
release refuse une adresse `http://` (seul `https` passe).
