# Client navigateur des MCP Apps (vendorisé)

`app-with-deps.js` est le fichier `dist/src/app-with-deps.js` du paquet npm
`@modelcontextprotocol/ext-apps` **1.7.5**, copié tel quel (licence dans
`LICENSE`). C'est la moitié « navigateur » du SDK des MCP Apps : la classe
`App` qui parle à Claude depuis la vue (`connect`, `callServerTool`,
`sendMessage`, thème de l'hôte).

Il est inclus dans la page de la vue par `src/app_view.rs` (`include_str!`),
qui remplace son `export{…}` final par `globalThis.AtelierExtApps = {…}` :
la vue n'a donc aucune dépendance réseau (pas de CDN), ce qu'exige un serveur
MCP local.

- Source : https://registry.npmjs.org/@modelcontextprotocol/ext-apps/-/ext-apps-1.7.5.tgz
- SHA-256 : `5bc0452b9994217df506cb505af20e97e766700513afb7d0b45d255785bb051f`
  (le test `app_view::tests::vendored_bundle_is_pinned` en vérifie la taille)

Mise à jour : `npm pack @modelcontextprotocol/ext-apps@<version>`, recopier
`package/dist/src/app-with-deps.js` et `package/LICENSE`, mettre à jour la
version et l'empreinte ici et dans le test.
