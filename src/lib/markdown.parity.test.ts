// Test de parité pour la réécriture de splitCodeSegments (task 24, plan perf
// 2026-08-28) : l'ancienne implémentation (copie verbatim ci-dessous, `buf +=
// text[i]` caractère par caractère) sert d'arbitre sémantique. La nouvelle
// implémentation (src/lib/markdown.ts, par indexOf/slice) doit produire EXACTEMENT
// les mêmes segments sur toutes les fixtures ci-dessous.
import { describe, expect, it } from "vitest";
import { splitCodeSegments } from "./markdown";

type Segment = { code: boolean; value: string };

// Copie VERBATIM de l'ancienne implémentation de splitCodeSegments (avant task 24).
function splitCodeSegmentsReference(text: string): Segment[] {
  const segments: Segment[] = [];
  let buf = "";
  let i = 0;

  const flush = () => {
    if (buf) {
      segments.push({ code: false, value: buf });
      buf = "";
    }
  };

  while (i < text.length) {
    if (text.startsWith("```", i)) {
      const end = text.indexOf("```", i + 3);
      flush();
      if (end === -1) {
        // fence jamais refermée : le reste du texte est du code, jamais touché
        segments.push({ code: true, value: text.slice(i) });
        break;
      }
      segments.push({ code: true, value: text.slice(i, end + 3) });
      i = end + 3;
      continue;
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end === -1) {
        // backtick isolé, jamais refermé : caractère littéral, on reste en prose
        buf += text[i];
        i += 1;
        continue;
      }
      flush();
      segments.push({ code: true, value: text.slice(i, end + 1) });
      i = end + 1;
      continue;
    }
    buf += text[i];
    i += 1;
  }
  flush();
  return segments;
}

// Une fixture par branche/état de l'automate original :
// - chaîne vide (aucune itération)
// - texte pur (jamais de backtick)
// - inline code fermé, au milieu / au début / à la fin
// - fence ``` fermée, avec et sans langage
// - fence jamais refermée (le "break" de l'original)
// - fence non refermée dès le premier caractère
// - inline code jamais refermé (backtick littéral qui reste en prose)
// - backtick isolé en tout début / toute fin de texte
// - double backtick consécutif => code vide "``"
// - fence puis inline puis fence non refermée (alternance d'états)
// - backslash devant un backtick : PAS un échappement dans cet automate (le
//   backslash reste un caractère littéral de prose, le backtick suivant ouvre
//   quand même un inline code)
// - fences imbriquées visuellement (``` à l'intérieur d'un inline en cours —
//   l'original priorise toujours le test triple-backtick en premier)
// - gros volume (50k caractères) pour vérifier perf + parité sur run long,
//   avec prose avant/après, fence au milieu et fence non refermée à la fin
const FIXTURES = [
  "",
  "du texte simple",
  "avant `inline` après",
  "`inline au début",
  "inline à la fin`",
  "```py\nprint(1)\n```",
  "```\nsans langue\n```",
  "texte ```js\nlet a=1;\n``` suite ```non fermé",
  "```jamais fermée dès le début du texte",
  "backtick seul ` au milieu",
  "`",
  "texte avant `",
  "` texte après",
  "`` double `` et ```\nfence sans langue\n```",
  "``",
  "```` quatre backticks au début",
  "\\`échappé` selon la sémantique de l'original",
  "avant `un` milieu `deux` puis ```trois\ncode\n``` fin",
  "```a\ncode1\n``` texte `inline` puis ```b\ncode2\n``` fin",
  "fence ```x\ny\n``` puis inline `z` puis fence non fermée ```reste",
  "un seul backtick suivi direct de fence ` puis ```py\ncode\n```",
  "long " + "x".repeat(50_000) + " ```c\nint x;\n``` fin",
  "avant " + "y".repeat(50_000) + "```rust\nfn main() {}\n```" + "z".repeat(50_000) + " après",
  "prose ".repeat(10_000) + "```non fermée jusqu'à la fin " + "w".repeat(20_000),
];

describe("splitCodeSegments — parité ancienne/nouvelle implémentation", () => {
  for (const [i, fixture] of FIXTURES.entries()) {
    it(`fixture ${i} (len=${fixture.length})`, () => {
      expect(splitCodeSegments(fixture)).toEqual(splitCodeSegmentsReference(fixture));
    });
  }
});
