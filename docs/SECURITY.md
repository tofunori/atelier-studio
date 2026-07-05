1. Les iframes atelier sont traitees comme non fiables meme quand elles viennent du serveur local de galerie.
2. L'app n'accepte les `message` que depuis `http://127.0.0.1:<18790-19789>`.
3. Chaque session genere un `atelier_nonce`, injecte dans `#atelier_nonce`, puis exige au top-level de chaque payload IPC.
4. Les messages IPC autorises ont une forme fermee, des types stricts et des longueurs bornees.
5. Les reponses `postMessage` ciblent l'origin exacte de l'iframe, jamais `*`.
6. Le browser natif Tauri reste hors iframe web et ne doit pas devenir une source IPC implicite.
7. Le token sidecar protege l'API locale; le nonce IPC protege seulement le canal app <-> galerie.
8. CSP `default/script/font 'self'`: code et fontes fontsource packes avec l'app.
9. CSP `style 'unsafe-inline'`, `img data/blob/asset/http://127.0.0.1`: styles Vite/React, images collees et assets Tauri/galerie.
10. CSP `connect ws/http 127.0.0.1, ws localhost, ipc`, `frame 127.0.0.1`: sidecar, HMR dev, IPC Tauri et iframes galerie.
