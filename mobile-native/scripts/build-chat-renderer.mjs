import {build} from 'esbuild';
import {cp, copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const destination = path.join(root, 'mobile-native/Sources/AtelierUI/Resources/ChatRenderer');
await mkdir(destination, {recursive:true});
await build({entryPoints:[path.join(root,'mobile-native/Renderer/chat-renderer.js')],bundle:true,minify:true,platform:'browser',format:'iife',outfile:path.join(destination,'chat-renderer.js'),legalComments:'inline'});
await copyFile(path.join(root,'node_modules/katex/dist/katex.min.css'),path.join(destination,'katex.min.css'));
await cp(path.join(root,'node_modules/katex/dist/fonts'),path.join(destination,'fonts'),{recursive:true});
const licenses = [];
for (const pkg of ['katex','micromark','micromark-extension-gfm','micromark-extension-math','highlight.js']) {
  for (const name of ['license','LICENSE']) { try { licenses.push(pkg+'\n'+await readFile(path.join(root,'node_modules',pkg,name),'utf8')); break; } catch {} }
}
await writeFile(path.join(destination,'LICENSES.txt'),licenses.join('\n\n'));
