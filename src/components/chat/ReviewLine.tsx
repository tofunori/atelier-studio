// Ligne « Relecture » sous le message d'un tour relu (variante B choisie sur
// maquette, 2026-11-10). Repliée : une ligne, « Relecture » puis le décompte.
// Dépliée : un seul bloc, une rangée par affirmation, le détail d'UNE rangée
// ouvert à la fois (phrase citée, preuve, Corriger / Écarter / Ouvrir la
// cellule). Chargée à la demande (React.lazy dans ChatTimeline) : rien de ce
// fichier n'entre dans le chunk d'entrée.
import { useState, type ReactNode } from "react";
import { t, type I18nKey } from "../../lib/i18n";
import { openKernelCell } from "../../lib/kernel";
import { Button, RowButton, Spinner } from "../ui";
import type { Review, ReviewClaim } from "./useReviews";

const svg = (size: number, paths: ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>
);
const REVIEW = svg(14, <><circle cx="7" cy="7" r="4.6" /><path d="m10.4 10.4 3.1 3.1M5.1 7.1l1.3 1.3 2.4-2.7" /></>);
const CELL = svg(13, <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M5 6.5 6.8 8 5 9.5M8.5 9.8h2.5" /></>);
const CHEVRON = {
  down: svg(12, <path d="M4.5 6.2 8 9.7l3.5-3.5" />),
  up: svg(12, <path d="M4.5 9.8 8 6.3l3.5 3.5" />),
  right: svg(12, <path d="M6.2 4.5 9.7 8l-3.5 3.5" />),
};
const STATE: Record<string, ReactNode> = {
  failed: svg(16, <><circle cx="8" cy="8" r="5.8" /><path d="M6 6l4 4M10 6l-4 4" /></>),
  inconclusive: svg(16, <><circle cx="8" cy="8" r="5.8" /><path d="M8 5v3.4M8 10.8v.1" /></>),
  passed: svg(16, <><circle cx="8" cy="8" r="5.8" /><path d="M5.4 8.2l1.8 1.8 3.4-3.8" /></>),
};

const FAMILIES = new Set(["number", "computed", "citation", "figure", "conclusion"]);
/** `passed`, `failed`, sinon `inconclusive` : un résultat inconnu n'est jamais
 *  compté comme vérifié. */
const outcomeOf = (claim: ReviewClaim) =>
  claim.outcome === "passed" || claim.outcome === "failed" ? claim.outcome : "inconclusive";

/** Titre court d'une rangée : la famille de l'affirmation et son issue. */
function titleOf(claim: ReviewClaim, mode?: string): string {
  const family = mode === "git" ? "git" : claim.category && FAMILIES.has(claim.category) ? claim.category : "other";
  return t(`review.title.${family}.${outcomeOf(claim)}` as I18nKey);
}

/** Sources lisibles d'une preuve : fichiers et articles lus par le relecteur.
 *  La cellule a sa propre étiquette ; `tool-3` ou `turn-activity` ne disent
 *  rien à l'écran. */
function sourcesOf(claim: ReviewClaim): string[] {
  return claim.evidenceIds.flatMap((id) => {
    const source = /^(?:file|article):(.+)$/.exec(id)?.[1].trim();
    return source ? [source] : [];
  });
}

/** Ce que la ligne a de déplié, gardé hors du composant : la liste du chat
 *  est virtualisée, une rangée sortie de l'écran est démontée puis remontée. */
type Fold = { open: boolean; row: string | null; more: boolean; asked: Set<string> };
const folds = new Map<string, Fold>();

function useFold(key: string): [Fold, (patch: Partial<Fold>) => void] {
  const [, render] = useState(0);
  let fold = folds.get(key);
  if (!fold) folds.set(key, fold = { open: false, row: null, more: false, asked: new Set() });
  const current = fold;
  return [current, (patch) => { Object.assign(current, patch); render((n) => n + 1); }];
}

export default function ReviewLine({ review, onDismiss }: {
  review: Review;
  onDismiss: (review: Review, claimId?: string) => void;
}) {
  const [fold, setFold] = useFold(`${review.threadId}:${review.reviewId}`);
  const running = review.status === "running";
  const claims = review.claims ?? [];
  const failed = claims.filter((claim) => outcomeOf(claim) === "failed");
  const unsure = claims.filter((claim) => outcomeOf(claim) === "inconclusive");
  const passed = claims.filter((claim) => outcomeOf(claim) === "passed");
  // « bonjour » : rien à vérifier n'est pas une alerte.
  const nothing = !claims.length && review.limitations?.includes("no-verifiable-claim") === true;

  const counts = [
    failed.length ? t("review.n-failed", { n: failed.length }) : "",
    unsure.length ? t("review.n-warn", { n: unsure.length }) : "",
    passed.length ? t("review.n-passed", { n: passed.length }) : "",
    // Tout ce qui est listé est vérifié, mais la relecture n'a pas conclu
    // (sortie coupée, vérification exigée manquante) : le dire.
    claims.length && !failed.length && !unsure.length && review.verdict !== "ok" && review.verdict !== "issues"
      ? t("review.partial") : "",
  ].filter(Boolean).join(", ");
  const summary = running ? t("review.running")
    : nothing ? t("review.nothing")
    : counts || (review.verdict === "ok" ? t("review.ok-bar") : t("review.inconclusive"));

  // Notes sous les rangées : périmètre d'une revue Git, erreur, raisons d'un
  // « non concluant ». « Rien à vérifier » se suffit.
  const reasons = [
    ...(review.error ? [review.error] : []),
    ...(review.text?.trim() ? review.text.trim().split("\n") : []),
  ];
  if (!claims.length && !reasons.length && review.verdict !== "ok") reasons.push(t("review.inconclusive-detail"));
  const notes = nothing ? [] : [
    ...(review.mode === "git" ? [t("review.git-native"), t("review.git-scope")] : []),
    ...reasons,
  ];
  const expandable = !running && (claims.length > 0 || notes.length > 0);
  const open = expandable && fold.open;

  // Les vérifiées en trop sont regroupées : on en montre une, le reste se
  // déplie d'un clic.
  const grouped = passed.length > 2 ? passed.slice(1) : [];
  const shown = [...failed, ...unsure, ...(grouped.length ? passed.slice(0, 1) : passed)];

  const row = (claim: ReviewClaim) => {
    const outcome = outcomeOf(claim);
    const isOpen = fold.row === claim.id;
    const sources = sourcesOf(claim);
    const asked = fold.asked.has(claim.id);
    return (
      <div className="rv-row" key={claim.id}>
        <RowButton className="rv-row-head" aria-expanded={isOpen}
          onClick={() => setFold({ row: isOpen ? null : claim.id })}>
          <span className="rv-state" data-outcome={outcome} role="img"
            aria-label={t(`review.state.${outcome}` as I18nKey)}>{STATE[outcome]}</span>
          <span className="rv-title">{titleOf(claim, review.mode)}</span>
          {!isOpen && claim.proof ? <span className="rv-find">{claim.proof}</span> : null}
          <span className="rv-chev">{isOpen ? CHEVRON.down : CHEVRON.right}</span>
        </RowButton>
        {isOpen ? (
          <div className="rv-detail">
            {claim.claim.trim() ? <div className="rv-quote">« {claim.claim.trim()} »</div> : null}
            {claim.proof || claim.cell != null || sources.length ? (
              <div className="rv-proof">
                {claim.cell != null || sources.length ? (
                  <div className="rv-proof-head">
                    {claim.cell != null ? <><span className="rv-proof-n">[{claim.cell}]</span><span>{t("review.proof-cell")}</span></> : null}
                    {sources.map((source) => <span className="rv-proof-src" key={source}>{source}</span>)}
                  </div>
                ) : null}
                {claim.proof ? <div className="rv-proof-text">{claim.proof}</div> : null}
              </div>
            ) : null}
            {outcome !== "passed" || claim.cell != null ? (
              <div className="rv-actions">
                {outcome !== "passed" ? (
                  <>
                    <Button variant="primary" size="sm" disabled={asked} onClick={() => {
                      setFold({ asked: new Set(fold.asked).add(claim.id) });
                      window.dispatchEvent(new CustomEvent("correct-issues", { detail: {
                        threadId: review.threadId,
                        issues: [{ claim: claim.claim, problem: claim.proof ?? titleOf(claim, review.mode), severity: "review" }],
                      } }));
                    }}>{asked ? t("review.corrected") : t("review.correct")}</Button>
                    <Button variant="ghost" size="sm" onClick={() => onDismiss(review, claim.id)}>{t("review.dismiss")}</Button>
                  </>
                ) : null}
                {claim.cell != null ? (
                  <Button variant="ghost" size="sm" className="rv-open-cell" onClick={() => openKernelCell(claim.cell!)}>
                    {CELL}{t("kernel.cite-open", { n: claim.cell })}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const head = (
    <>
      <span className="rv-ico">{REVIEW}</span>
      <span className="rv-name">{t("review.name")}</span>
      {running ? <Spinner className="rv-wait" size={10} aria-hidden="true" /> : null}
      <span className="rv-sum">{summary}</span>
    </>
  );
  return (
    <div className="rv" data-open={open || undefined} data-running={running || undefined}>
      {expandable ? (
        <RowButton className="rv-head" aria-expanded={open} onClick={() => setFold({
          open: !open,
          // premier dépli : le détail du premier échec est déjà ouvert
          row: !open && fold.row == null ? failed[0]?.id ?? null : fold.row,
        })}>
          {head}
          <span className="rv-chev">{open ? CHEVRON.up : CHEVRON.down}</span>
        </RowButton>
      ) : <div className="rv-head" role="status">{head}</div>}
      {open ? (
        <div className="rv-body">
          {shown.map(row)}
          {grouped.length ? (
            <div className="rv-row">
              <RowButton className="rv-row-head" aria-expanded={fold.more} onClick={() => setFold({ more: !fold.more })}>
                <span className="rv-state" data-outcome="passed">{STATE.passed}</span>
                <span className="rv-title">{t("review.more-passed", { n: grouped.length })}</span>
                <span className="rv-chev">{fold.more ? CHEVRON.down : CHEVRON.right}</span>
              </RowButton>
            </div>
          ) : null}
          {fold.more ? grouped.map(row) : null}
          {notes.length ? (
            <div className="rv-notes">
              {notes.map((note, index) => <p key={index}>{note}</p>)}
              {claims.length ? null : (
                <div className="rv-actions">
                  <Button variant="ghost" size="sm" onClick={() => onDismiss(review)}>{t("review.dismiss")}</Button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
