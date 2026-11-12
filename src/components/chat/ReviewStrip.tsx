// Barre de la revue un par un (maquette « chat-un-par-un », 2026-11-12) :
// au-dessus du compositeur, le commentaire en cours et trois gestes. Chaque
// geste part à l'éditeur LaTeX qui l'a envoyé (`atelier-review-action`) ;
// l'éditeur répond par le commentaire suivant. Chargée à la demande.
import { useEffect } from "react";
import { ArrowRightIcon, CheckIcon, FlagIcon } from "lucide-react";
import { t } from "../../lib/i18n";
import { setReviewSession, type ReviewSession } from "../../lib/reviewSession";
import { Button } from "../ui/Button";
import { CloseButton } from "../ui/CloseButton";
import "./ChatReview.css";

const NO_ANSWER_MS = 6000;

export default function ReviewStrip({ session }: { session: ReviewSession }) {
  const current = session.current;
  // L'éditeur fermé ne répond plus : le dire au lieu d'attendre.
  useEffect(() => {
    if (!session.pending) return;
    const timer = window.setTimeout(() => setReviewSession((s) => s && s.pending
      ? { ...s, pending: false, error: t("chat.review-no-editor") } : s), NO_ANSWER_MS);
    return () => window.clearTimeout(timer);
  }, [session.pending]);

  const act = (action: "done" | "agenda" | "next") => {
    if (!current || session.pending) return;
    try {
      session.source.postMessage({ type: "atelier-review-action", nonce: session.nonce, action, id: current.id,
        file: current.path, mode: session.mode }, session.origin);
      setReviewSession((s) => s && { ...s, pending: true, error: undefined });
    } catch {
      setReviewSession((s) => s && { ...s, error: t("chat.review-no-editor") });
    }
  };
  const first = (current?.author || "").trim().split(/\s+/)[0] || t("chat.review-reviewer");

  return (
    <div className="review-strip" role="group" aria-label={t("chat.review-label", { name: first })}>
      <span className="review-strip-label">
        {current ? (
          <>
            <span className="review-card-ring">{current.n}</span>
            <span>{t("chat.review-label", { name: first })} · {t("chat.review-position", { n: current.n, total: current.total })}</span>
          </>
        ) : (
          <span>{t("chat.review-finished")}</span>
        )}
        {session.error && <span className="review-strip-error">{session.error}</span>}
      </span>
      {current && (
        <>
          <Button variant="secondary" loading={session.pending} onClick={() => act("done")}>
            <CheckIcon size={12} aria-hidden="true" />{t("chat.review-done")}
          </Button>
          <Button variant="ghost" disabled={session.pending} onClick={() => act("agenda")}>
            <FlagIcon size={12} aria-hidden="true" />{t("chat.review-agenda")}
          </Button>
          <Button variant="ghost" disabled={session.pending} onClick={() => act("next")}>
            {t("chat.review-next")}<ArrowRightIcon size={12} aria-hidden="true" />
          </Button>
        </>
      )}
      <CloseButton label={t("chat.review-close")} onClick={() => setReviewSession(null)} />
    </div>
  );
}
