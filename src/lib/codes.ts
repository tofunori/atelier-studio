// Codage qualitatif : calculs sur le livre de codes (arbre, effectifs), partagés
// par la vue Codes du panneau Annotations et ses tests.
import type { PdfAnnot } from "../components/AnnotationsPanel";

export type Code = {
  id: string;
  name: string;
  parent: string | null;
  memo?: string;
  order?: number;
  depth: number;
  path: string;
};

export type Passage = { rel: string; a: PdfAnnot; ids: string[] };

/** Ids d'un code et de tous ses sous-codes (les chiffres d'un code les comptent). */
export function codeFamily(codes: Code[], id: string): string[] {
  const out = [id];
  const seen = new Set(out);
  for (let i = 0; i < out.length; i++) {
    for (const c of codes) if (c.parent === out[i] && !seen.has(c.id)) { seen.add(c.id); out.push(c.id); }
  }
  return out;
}

const idsOf = (a: PdfAnnot, key: "codes" | "suggested") =>
  Array.isArray(a[key]) ? (a[key] as unknown[]).map(String) : [];

/** Passages gardés et proposés d'un code (sous-codes compris). */
export function codePassages(lib: Record<string, PdfAnnot[]>, family: string[]) {
  const kept: Passage[] = [];
  const pending: Passage[] = [];
  const inFamily = new Set(family);
  for (const [rel, list] of Object.entries(lib)) {
    for (const a of Array.isArray(list) ? list : []) {
      const k = idsOf(a, "codes").filter((id) => inFamily.has(id));
      const s = idsOf(a, "suggested").filter((id) => inFamily.has(id));
      if (k.length) kept.push({ rel, a, ids: k });
      if (s.length) pending.push({ rel, a, ids: s });
    }
  }
  const byPage = (x: Passage, y: Passage) => x.rel.localeCompare(y.rel) || +x.a.page - +y.a.page;
  return { kept: kept.sort(byPage), pending: pending.sort(byPage) };
}
