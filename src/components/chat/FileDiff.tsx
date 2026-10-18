// Corps du diff d'un fichier dans le fil (refonte 2026-10-18, maquette
// captures/fichiers-modifies-2026-10-18) : fond léger par ligne ajoutée ou
// retirée, signe + / −, mots changés seuls marqués, longues zones inchangées
// repliées. Un fichier CRÉÉ s'affiche comme du code ordinaire : tout est
// nouveau, le teinter en vert n'apporterait que du bruit.
import { useMemo, useState } from "react";
import { t } from "../../lib/i18n";
import { foldUnchanged, pairChangedLines, type DiffRow, type MarkRange } from "../../lib/chat/lineDiff";
import { markHtml, splitHighlightedLines } from "../../lib/chat/diffHtml";
import { escapeHtml, hasRegisteredLanguage, highlightCode } from "./md";
import { RowButton } from "../ui";

/** Au-delà, le reste du fichier s'ouvre dans l'éditeur : le fil n'est pas un
 * visualiseur de gros fichiers. */
const MAX_ROWS = 1500;

function languageOf(path: string): string {
  const name = path.split(/[/\\]/).pop() ?? path;
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return ext && hasRegisteredLanguage(ext) ? ext : "";
}

function highlightRows(rows: DiffRow[], path: string): string[] {
  const lang = languageOf(path);
  const render = (lines: string[]) => {
    const text = lines.join("\n");
    if (!lang) return text.split("\n").map(escapeHtml);
    return splitHighlightedLines(highlightCode(text, lang));
  };
  // chaque côté est coloré d'un seul tenant : une chaîne ouverte sur une
  // ligne garde sa couleur sur les suivantes
  const oldSide = render(rows.flatMap((row) => (row.kind === "ctx" || row.kind === "del" ? [row.text] : [])));
  const newSide = render(rows.flatMap((row) => (row.kind === "ctx" || row.kind === "add" ? [row.text] : [])));
  let oldIndex = 0;
  let newIndex = 0;
  return rows.map((row) => {
    if (row.kind === "hunk") return escapeHtml(row.text);
    if (row.kind === "del") return oldSide[oldIndex++] ?? "";
    if (row.kind === "add") return newSide[newIndex++] ?? "";
    oldIndex++;
    return newSide[newIndex++] ?? "";
  });
}

const UnfoldIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 5.5 8 2.5l3 3M5 10.5l3 3 3-3" />
  </svg>
);

export default function FileDiff({ rows, path, created = false, numbered = true }: {
  rows: DiffRow[];
  path: string;
  /** fichier neuf : code ordinaire, sans teinte ni signe */
  created?: boolean;
  /** faux pour un extrait (old_string/new_string d'un Edit) : ses numéros
   * seraient ceux de l'extrait, pas du fichier */
  numbered?: boolean;
}) {
  const shown = useMemo(() => (rows.length > MAX_ROWS ? rows.slice(0, MAX_ROWS) : rows), [rows]);
  const html = useMemo(() => highlightRows(shown, path), [shown, path]);
  const marks = useMemo(() => (created ? new Map<number, MarkRange[]>() : pairChangedLines(shown)), [shown, created]);
  const items = useMemo(() => {
    const indexed = shown.map((row, index) => ({ ...row, index }));
    return created ? indexed : foldUnchanged(indexed);
  }, [shown, created]);
  const [unfolded, setUnfolded] = useState<Set<number>>(() => new Set());

  const line = (row: DiffRow & { index: number }) => {
    if (row.kind === "hunk") {
      return (
        <div key={row.index} className="file-diff-line is-hunk">
          {numbered && <span className="file-diff-no" />}
          {!created && <span className="file-diff-sign" />}
          <span className="file-diff-text">{row.text || "⋯"}</span>
        </div>
      );
    }
    const kind = created ? "" : row.kind === "add" ? " is-add" : row.kind === "del" ? " is-del" : "";
    const content = markHtml(html[row.index], marks.get(row.index) ?? []);
    return (
      <div key={row.index} className={`file-diff-line${kind}`}>
        {numbered && <span className="file-diff-no">{row.newNo ?? row.oldNo}</span>}
        {!created && <span className="file-diff-sign">{row.kind === "add" ? "+" : row.kind === "del" ? "−" : ""}</span>}
        <span className="file-diff-text" dangerouslySetInnerHTML={{ __html: content || " " }} />
      </div>
    );
  };

  return (
    <div className={`file-diff${created ? " is-created" : ""}${numbered ? "" : " is-unnumbered"}`}>
      {items.map((item, position) => {
        if (item.kind !== "fold") return line(item);
        const folded = item.rows;
        const first = folded[0].index;
        if (unfolded.has(first)) return folded.map(line);
        const from = (folded[0] as { newNo?: number | null }).newNo;
        const to = (folded[folded.length - 1] as { newNo?: number | null }).newNo;
        return (
          <RowButton key={`fold-${position}`} className="file-diff-fold"
            onClick={() => setUnfolded((current) => new Set(current).add(first))}>
            <UnfoldIcon />
            <span>{numbered && from != null && to != null
              ? t("chat.diff-fold-range", { from, to })
              : t("chat.diff-fold-count", { count: folded.length })}</span>
          </RowButton>
        );
      })}
      {rows.length > MAX_ROWS && (
        <div className="file-diff-more">{t("chat.diff-more-lines", { count: rows.length - MAX_ROWS })}</div>
      )}
    </div>
  );
}
