// Carte passage dans le chat (plan Preuves, tâche 5 + 6) — un lien
// #atelier-zotero-passage OU #atelier-gbrain-passage SEUL dans son
// paragraphe (cf. lonePassageRef, md.tsx) se rend ici : repliée sur une
// ligne, dépliable au clic, épinglable via WS (pinPassage/unpinPassage,
// contrat tâche 2). Deux sources, même carte : Zotero ouvre le PDF à la
// page citée ; gbrain ouvre le SourceReader défilé/surligné sur la citation.
import { useSyncExternalStore, useState } from "react";
import { t } from "../../lib/i18n";
import { wsSend } from "../../lib/wsBus";
import { evidencePinsSnapshot, isPinned, subscribeEvidencePins } from "../../lib/evidencePins";
import { citeLabel } from "./turnParts";
import { Tick } from "./toolPresentation";
import { IconButton, RowButton, Tooltip } from "../ui";
import { humanizeGbrainSlug, openGbrainPassage, openZoteroPassage, type PassageRef } from "./md";

function DocIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 1.8h7l3 3v9.4H3z" />
      <path d="M10 1.8v3h3M5.2 8h5.6M5.2 10.5h4" />
    </svg>
  );
}

function PinIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.6 2.6h2.8l-.4 4.2 2.4 2.4H4.6l2.4-2.4z" />
      <path d="M8 9.2v4.2" />
    </svg>
  );
}

export function PassageCard({ refData }: { refData: PassageRef }) {
  const [open, setOpen] = useState(false);
  const store = useSyncExternalStore(subscribeEvidencePins, evidencePinsSnapshot);
  const isGbrain = refData.kind === "gbrain";
  const label = isGbrain ? humanizeGbrainSlug(refData.slug) : citeLabel(refData.pdfFile);
  const pin = isGbrain
    ? isPinned({ gbrainSlug: refData.slug, quote: refData.quote })
    : isPinned({ pdfKey: refData.pdfKey, page: refData.page, quote: refData.quote });

  const togglePin = () => {
    const { projectRoot } = store;
    if (!projectRoot) return;
    if (pin) {
      wsSend({ type: "unpinPassage", projectRoot, pinId: pin.id });
    } else if (isGbrain) {
      wsSend({
        type: "pinPassage",
        projectRoot,
        pin: {
          source: "gbrain",
          quote: refData.quote,
          gbrainSlug: refData.slug,
          citeLabel: label,
        },
      });
    } else {
      wsSend({
        type: "pinPassage",
        projectRoot,
        pin: {
          quote: refData.quote,
          zoteroKey: refData.key,
          pdfKey: refData.pdfKey,
          pdfFile: refData.pdfFile,
          page: refData.page,
          citeLabel: label,
        },
      });
    }
  };

  const openPassage = () => (isGbrain ? openGbrainPassage(refData) : openZoteroPassage(refData));
  const openLabel = isGbrain ? t("passage.open-gbrain") : t("passage.open-pdf", { page: refData.page });

  if (!open) {
    const hasQuote = Boolean(refData.quote.trim());
    return (
      <div className="passage-card">
        <RowButton
          className="passage-card-row"
          aria-label={t("passage.expand")}
          onClick={() => setOpen(true)}
        >
          <span className={hasQuote ? "passage-card-quote" : "passage-card-quote is-absent"}>
            {hasQuote ? refData.quote : t("preuves.open-source", { source: label })}
          </span>
          <span className="passage-card-meta">
            <span
              className={isGbrain ? "evidence-meta-kind is-gbrain" : "evidence-meta-kind"}
              aria-hidden="true"
            />
            <span className="evidence-meta-src">{label}</span>
            {!isGbrain && <span className="evidence-meta-page">p. {refData.page}</span>}
          </span>
        </RowButton>
        <Tick open={false} />
        <IconButton
          className={pin ? "passage-card-pin is-pinned" : "passage-card-pin"}
          label={pin ? t("passage.unpin") : t("passage.pin")}
          aria-pressed={Boolean(pin)}
          onClick={togglePin}
        >
          <PinIcon />
        </IconButton>
      </div>
    );
  }

  return (
    <div className="passage-card open">
      <p className="passage-card-quote-full">{refData.quote}</p>
      <div className="passage-card-meta">{isGbrain ? label : `${label} · p. ${refData.page}`}</div>
      <div className="passage-card-actions">
        <Button variant="secondary" onClick={openPassage}>
          {openLabel}
        </Button>
        <Button
          variant="secondary"
          className={pin ? "is-pinned" : undefined}
          onClick={togglePin}
        >
          {pin ? t("passage.unpin") : t("passage.pin")}
        </Button>
        <IconButton
          className="passage-card-collapse"
          label={t("passage.collapse")}
          onClick={() => setOpen(false)}
        >
          <Tick open />
        </IconButton>
      </div>
    </div>
  );
}
