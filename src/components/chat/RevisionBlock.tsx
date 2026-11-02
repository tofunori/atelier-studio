// Passage révisé (variante E « diff monochrome », choisie le 2026-11-01) :
// un bloc ```revision de l'agent (« --- avant » puis « +++ après ») se lit
// comme la citation habituelle du chat, le nouveau souligné d'un trait fin,
// le retiré barré en gris éteint. Ni couleur ni carte. Chargé à la demande
// (md.tsx, lazy) : le budget d'entrée JS est plein.
import { Fragment, useMemo, useState } from "react";
import { diffWords, parseRevision, revisionStats, texPieces, type WordSegment } from "../../lib/chat/revisionDiff";
import { t } from "../../lib/i18n";
import { CopyIcon } from "../icons";
import { IconButton } from "../ui";
import "./RevisionBlock.css";

const PARAGRAPH_BREAK = /(\n[ \t]*\n\s*)/;

/** LaTeX lisible (citations éteintes, ~ insécable) ; une ligne vide reste un
 * changement de paragraphe, un simple saut de ligne du .tex une espace. */
function Tex({ text }: { text: string }) {
  return (
    <>
      {text.split(PARAGRAPH_BREAK).map((part, i) => i % 2 === 1
        ? <span key={i} className="md-revision-break" />
        : texPieces(part).map((piece, k) => {
          if (piece.kind === "cite") return <span key={`${i}-${k}`} className="md-revision-cite">{piece.text}</span>;
          if (piece.kind === "em") return <em key={`${i}-${k}`}>{piece.text}</em>;
          if (piece.kind === "strong") return <strong key={`${i}-${k}`}>{piece.text}</strong>;
          return <Fragment key={`${i}-${k}`}>{piece.text}</Fragment>;
        }))}
    </>
  );
}

function Segment({ seg }: { seg: WordSegment }) {
  if (seg.kind === "add") return <ins className="md-revision-add"><Tex text={seg.text} /></ins>;
  if (seg.kind === "del") return <del className="md-revision-del"><Tex text={seg.text} /></del>;
  return <Tex text={seg.text} />;
}

function summary(changes: number, removals: number): string {
  if (changes === 0) return t("revision.none");
  const c = changes === 1 ? t("revision.changes-one") : t("revision.changes", { n: changes });
  if (removals === 0) return c;
  return `${c} · ${removals === 1 ? t("revision.removals-one") : t("revision.removals", { n: removals })}`;
}

export default function RevisionBlock({ source }: { source: string }) {
  const [copied, setCopied] = useState(false);
  const parts = useMemo(() => parseRevision(source), [source]);
  const segments = useMemo(
    () => (parts.complete ? diffWords(parts.before, parts.after) : [{ kind: "same" as const, text: parts.after }]),
    [parts],
  );
  const stats = useMemo(() => revisionStats(segments), [segments]);
  const copyLabel = copied ? t("revision.copied") : t("revision.copy");
  return (
    <div className="md-revision not-typeset" role="group" aria-label={t("revision.label")}>
      <div className="md-revision-text"><p>{segments.map((seg, i) => (
        <Fragment key={i}>
          <Segment seg={seg} />
          {/* « ancien nouveau » : une espace entre le barré et le souligné */}
          {seg.kind === "del" && segments[i + 1]?.kind === "add" ? " " : null}
        </Fragment>
      ))}</p></div>
      {parts.complete && (
        <div className="md-revision-meta">
          <span>{summary(stats.changes, stats.removals)}</span>
          <IconButton
            className="md-revision-copy"
            label={copyLabel}
            title={copyLabel}
            onClick={() => {
              void navigator.clipboard.writeText(parts.after).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
            }}
          >
            <CopyIcon size={13} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
