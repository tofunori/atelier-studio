import {build} from "esbuild";
import {readFile, writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const common = {
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  legalComments: "none",
  charset: "utf8",
  logLevel: "info",
};

await build({
  ...common,
  entryPoints: [`${root}/assets/cm6/studio_editor.mjs`],
  outfile: `${root}/assets/cm6/studio_cm6.bundle.js`,
  globalName: "AtelierStudioCM6",
});

await build({
  ...common,
  entryPoints: [`${root}/assets/cm6/latex_cm6_src.js`],
  outfile: `${root}/assets/cm6/latex_cm6.bundle.js`,
});

await build({
  ...common,
  entryPoints: [`${root}/assets/cm6/atelier_diff.mjs`],
  outfile: `${root}/assets/cm6/atelier_diff.bundle.js`,
  globalName: "AtelierCodeMirrorDiff",
});

// esbuild can preserve whitespace-only lines embedded in parser literals.
// Normalize them so generated bundles remain clean under `git diff --check`.
for (const name of ["studio_cm6.bundle.js", "latex_cm6.bundle.js", "atelier_diff.bundle.js"]) {
  const outfile = `${root}/assets/cm6/${name}`;
  const source = await readFile(outfile, "utf8");
  await writeFile(outfile, source.replace(/^[\t ]+$/gm, ""));
}
