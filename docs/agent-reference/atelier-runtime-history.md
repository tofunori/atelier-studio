# Atelier Studio — historique runtime

Cette page conserve des diagnostics d’anciens runtimes. Elle ne fait pas partie
de la procédure courante et ses commandes ne doivent pas être appliquées à un
bundle actuel sans avoir d’abord confirmé que l’ancien runtime est réellement en
cause.

## Sidecar Node et TCC

Avant le retrait du fallback Node, certains bundles lançaient
`Resources/sidecar/index.mjs`. Un `chmodSync` exécuté à l’import dans le bundle
déclenchait une consultation TCC « App Management » suffisamment longue pour que
le budget de démarrage expire. Le sidecar était alors remplacé en boucle et
l’interface restait déconnectée.

Le correctif durable reste pertinent: aucune écriture dans le bundle au
chargement. Les permissions et fichiers exécutables sont préparés au staging;
le runtime ne fait que des contrôles en lecture dans le bundle.

Le backend chat de production actuel est Rust. Les recherches de
`Resources/sidecar/index.mjs`, les échantillons contenant `node::fs_` et les
seuils historiques de convergence ne constituent donc plus un diagnostic courant.
Consulter `docs/soak/033-COMPLETE.md` pour la transition et vérifier le code actif
avant de réutiliser un élément de cette histoire.
