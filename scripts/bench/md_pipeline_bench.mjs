// Micro-banc du pipeline Markdown du bloc actif (hors React DOM) : ce que
// coûte UNE publication du typewriter — durcissement du bloc partiel, parse
// remark (+gfm, +math), remark→rehype, katex, rehypeWordFade, puis
// conversion en éléments React. Bundlé par esbuild et exécuté dans jsc
// (JavaScriptCore système, moteur de WKWebView) et dans node (V8) :
//   npx esbuild scripts/bench/md_pipeline_bench.mjs --bundle --format=iife --platform=browser \
//     --define:process.env.NODE_ENV='"production"' \
//     --alias:decode-named-character-reference=./node_modules/decode-named-character-reference/index.js \
//     --alias:hast-util-from-html-isomorphic=./node_modules/hast-util-from-html-isomorphic/lib/index.js \
//     --outfile=/tmp/md_bench.js \
//   && /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc /tmp/md_bench.js && node /tmp/md_bench.js
// (les deux alias remplacent les variantes DOM par les variantes pures : jsc n'a ni document ni DOMParser)
//
// Mesuré le 2026-09-15 (bloc de 60 mots) : JSC 0,21 ms / publication, V8 0,14 —
// soit 0,5 % d'un cœur à 25 publications/s. Le parsing n'est PAS un levier ;
// le coût du bloc actif est dans son rendu (nœuds React + spans inline).
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import rehypeWordFade from "../../src/lib/rehypeWordFade";
import { hardenPartialMarkdown } from "../../src/lib/markdown";

const out = typeof print === "function" ? print : console.log;
const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

// texte d'un bloc de queue réaliste : 60 mots de prose, révélés mot à mot
const words = "Les nuages naissent quand l'air humide se refroidit sous son point de rosée et que la vapeur se condense sur des noyaux ; la convection, le relief et les fronts fournissent l'ascendance nécessaire. ".split(" ");
const block = Array.from({ length: 60 }, (_, i) => words[i % words.length]).join(" ");

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm, { singleTilde: false })
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex, { throwOnError: false })
  .use(rehypeWordFade);

function publish(text) {
  const hardened = hardenPartialMarkdown(text);
  const mdast = processor.parse(hardened);
  const hast = processor.runSync(mdast);
  return toJsxRuntime(hast, { Fragment, jsx, jsxs, passNode: false });
}
function step(label, fn, iters) {
  fn(block); fn(block); // chauffe
  const t0 = now(); for (let i = 0; i < iters; i++) fn(block); const ms = (now() - t0) / iters;
  out(`${label.padEnd(34)} ${ms.toFixed(3)} ms/publication`);
  return ms;
}
out(`bloc : ${block.length} caractères, ${block.split(" ").length} mots`);
const total = step("pipeline complet", publish, 400);
step("  hardenPartialMarkdown seul", (t) => hardenPartialMarkdown(t), 2000);
step("  parse remark(+gfm,+math) seul", (t) => processor.parse(t), 400);
step("  parse + rehype (katex, wordFade)", (t) => processor.runSync(processor.parse(t)), 400);
const sansFade = unified().use(remarkParse).use(remarkGfm, { singleTilde: false }).use(remarkMath).use(remarkRehype).use(rehypeKatex, { throwOnError: false });
step("  parse + rehype SANS wordFade", (t) => sansFade.runSync(sansFade.parse(t)), 400);
const sansMath = unified().use(remarkParse).use(remarkGfm, { singleTilde: false }).use(remarkRehype).use(rehypeWordFade);
step("  parse + rehype SANS math/katex", (t) => sansMath.runSync(sansMath.parse(t)), 400);
out(`à 25 publications/s : ${(total * 25 / 10).toFixed(1)} % d'un cœur`);
