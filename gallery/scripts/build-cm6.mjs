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

await build({
  ...common,
  entryPoints: [`${root}/src/studio/host/runtime.ts`],
  outfile: `${root}/assets/studio_runtime.bundle.js`,
  globalName: "AtelierStudioRuntime",
});

await build({
  ...common,
  entryPoints: [`${root}/src/studio/core/index.ts`],
  outfile: `${root}/assets/studio_core.bundle.js`,
  globalName: "AtelierStudioCore",
});

await build({
  ...common,
  entryPoints: [`${root}/src/studio/features/latex/index.ts`],
  outfile: `${root}/assets/latex_features.bundle.js`,
  globalName: "AtelierStudioLatex",
});

await build({
  ...common,
  entryPoints: [`${root}/src/studio/features/code/index.ts`],
  outfile: `${root}/assets/code_features.bundle.js`,
  globalName: "AtelierStudioCode",
});

await build({
  ...common,
  entryPoints: [`${root}/src/studio/features/markdown/index.ts`],
  outfile: `${root}/assets/markdown_features.bundle.js`,
  globalName: "AtelierStudioMarkdown",
});

await build({
  ...common,
  entryPoints: [`${root}/src/studio/surfaces/index.ts`],
  outfile: `${root}/assets/studio_surfaces.bundle.js`,
  globalName: "AtelierStudioSurfaces",
});

await build({
  ...common,
  minify: false,
  entryPoints: [`${root}/src/studio/core/editor_factory.ts`],
  outfile: `${root}/assets/editor_factory.js`,
});

// esbuild can preserve whitespace-only lines embedded in parser literals.
// Normalize them so generated bundles remain clean under `git diff --check`.
for (const name of [
  "assets/cm6/studio_cm6.bundle.js",
  "assets/cm6/latex_cm6.bundle.js",
  "assets/cm6/atelier_diff.bundle.js",
  "assets/studio_runtime.bundle.js",
  "assets/studio_core.bundle.js",
  "assets/latex_features.bundle.js",
  "assets/code_features.bundle.js",
  "assets/markdown_features.bundle.js",
  "assets/studio_surfaces.bundle.js",
  "assets/editor_factory.js",
]) {
  const outfile = `${root}/${name}`;
  const source = await readFile(outfile, "utf8");
  await writeFile(outfile, source.replace(/^[\t ]+$/gm, ""));
}
