import {build} from "esbuild";
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
