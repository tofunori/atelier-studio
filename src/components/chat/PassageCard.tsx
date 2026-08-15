// Carte passage Zotero dans le chat (plan Preuves, tâche 5) — un lien
// #atelier-zotero-passage SEUL dans son paragraphe (cf. lonePassageRef,
// md.tsx) se rend ici : repliée sur une ligne, dépliable au clic, épinglable
// via WS (pinPassage/unpinPassage, contrat tâche 2).
import { useSyncExternalStore, useState } from "react";
import { t } from "../../lib/i18n";
import { wsSend } from "../../lib/wsBus";
import { evidencePinsSnapshot, isPinned, subscribeEvidencePins } from "../../lib/evidencePins";
import { citeLabel } from "./turnParts";
import { Tick } from "./toolPresentation";
import { Button, IconButton, RowButton } from "../ui";
import { openZoteroPassage, type ZoteroPassageRef } from "./md";

function PinIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.6 2.6h2.8l-.4 4.2 2.4 2.4H4.6l2.4-2.4z" />
      <path d="M8 9.2v4.2" />
    </svg>
  );
}

export function PassageCard({ refData }: { refData: ZoteroPassageRef }) {
  const [open, setOpen] = useState(false);
  const store = useSyncExternalStore(subscribeEvidencePins, evidencePinsSnapshot);
  const pin = isPinned(refData.pdfKey, refData.page, refData.quote);
  const label = citeLabel(refData.pdfFile);

  const togglePin = () => {
    const { projectRoot } = store;
    if (!projectRoot) return;
    if (pin) {
      wsSend({ type: "unpinPassage", projectRoot, pinId: pin.id });
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

  if (!open) {
    return (
      <div className="passage-card">
        <RowButton
          className="passage-card-row"
          aria-label={t("passage.expand")}
          onClick={() => setOpen(true)}
        >
          <span className="passage-card-quote">{refData.quote}</span>
          <span className="passage-card-meta">{label} · p. {refData.page}</span>
          <Tick open={false} />
        </RowButton>
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
      <div className="passage-card-meta">{label} · p. {refData.page}</div>
      <div className="passage-card-actions">
        <Button variant="secondary" onClick={() => openZoteroPassage(refData)}>
          {t("passage.open-pdf", { page: refData.page })}
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
