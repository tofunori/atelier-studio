/** Compile standalone browser scripts without changing their classic-script scope. */
import { readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
interface Asset { source: string; output: string }
interface InlineScript extends Asset { slot: number }
const manifest = JSON.parse(await readFile(resolve(root, 'scripts/typescript-sources.json'), 'utf8')) as {
  browserAssets: Asset[]; inlineScripts: InlineScript[];
};
const generated = (source: string) => {
  const sourceLines = source.split('\n');
  return stripTypeScriptTypes(source, { mode: 'strip' }).split('\n').map((line, index) => {
    // Strip mode pads erased types with spaces. Only trim suffixes it changed;
    // untouched whitespace may belong to a multiline string or template literal.
    return line.trimEnd().length < sourceLines[index].trimEnd().length ? line.trimEnd() : line;
  }).join('\n').trimEnd() + '\n';
};
for (const {source, output} of manifest.browserAssets) {
  const text = await readFile(resolve(root, source), 'utf8');
  await writeFile(resolve(root, output), `// Generated from ${source}; edit the TypeScript source.\n${generated(text)}`);
}
const pages = new Map<string, InlineScript[]>();
for (const entry of manifest.inlineScripts) {
  const entries = pages.get(entry.output) ?? [];
  entries.push(entry); pages.set(entry.output, entries);
}
for (const [output, entries] of pages) {
  const filename = resolve(root, output);
  let html = await readFile(filename, 'utf8');
  for (const {source} of entries) {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const slot = new RegExp(`(<script\\b[^>]*data-atelier-source="${escaped}"[^>]*>)[\\s\\S]*?(<\\/script>)`);
    if (!slot.test(html)) throw new Error(`Missing TypeScript script slot: ${source} in ${output}`);
    const js = generated(await readFile(resolve(root, source), 'utf8'));
    html = html.replace(slot, (_match, open: string, close: string) => open + js + close);
  }
  await writeFile(filename, html);
}
console.log(`Compiled ${manifest.browserAssets.length} browser assets and ${manifest.inlineScripts.length} inline scripts.`);
