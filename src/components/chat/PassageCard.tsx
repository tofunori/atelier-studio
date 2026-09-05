// Carte passage dans le chat (plan Preuves, tâche 5 + 6) — un lien
// #atelier-zotero-passage OU #atelier-gbrain-passage SEUL dans son
// paragraphe (cf. lonePassageRef, md.tsx) se rend ici : source en tête,
// extrait sélectionnable, épinglable via WS (pinPassage/unpinPassage,
// contrat tâche 2). Deux sources, même carte : Zotero ouvre le PDF à la
// page citée ; gbrain ouvre le SourceReader défilé/surligné sur la citation.
import { useMemo, useSyncExternalStore, useState } from "react";
import ReactMarkdown from "react-markdown";
import { normalizeMathDelimiters } from "../../lib/markdown";
import { t } from "../../lib/i18n";
import { wsSend } from "../../lib/wsBus";
import { evidencePinsSnapshot, isPinned, subscribeEvidencePins } from "../../lib/evidencePins";
import { citeLabel } from "./turnParts";
import { IconButton, RowButton, Tooltip } from "../ui";
import { gbrainCiteLabel, humanizeGbrainSlug, openGbrainPassage, openZoteroPassage, useMdPlugins, type PassageRef } from "./md";

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
  const plugins = useMdPlugins();
  const quote = useMemo(() => normalizeMathDelimiters(refData.quote), [refData.quote]);
  const hasQuote = Boolean(refData.quote.trim());
  const isLong = refData.quote.length > 420;
  const store = useSyncExternalStore(subscribeEvidencePins, evidencePinsSnapshot);
  const isGbrain = refData.kind === "gbrain";
  // Deux libellés : le COURT tient dans la ligne méta (« Stroeve 2006 »), le
  // long reste au survol — la carte cite, elle ne catalogue pas.
  const label = isGbrain ? gbrainCiteLabel(refData.slug) : citeLabel(refData.pdfFile);
  const fullLabel = isGbrain ? humanizeGbrainSlug(refData.slug) : refData.pdfFile;
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

  return (
    <div className={`passage-card${open ? " open" : ""}${pin ? " has-pin" : ""}`}>
      <div className="passage-card-meta">
        <RowButton className="passage-card-source" onClick={openPassage} title={fullLabel}>
          <DocIcon />
          <span className="evidence-meta-src" title={fullLabel}>{label}</span>
        </RowButton>
        {!isGbrain && <span className="evidence-meta-page">p. {refData.page}</span>}
        <Tooltip label={pin ? t("passage.unpin") : t("passage.pin")}>
          <IconButton
            className={pin ? "passage-card-pin is-pinned" : "passage-card-pin"}
            label={pin ? t("passage.unpin") : t("passage.pin")}
            aria-pressed={Boolean(pin)}
            onClick={togglePin}
          >
            <PinIcon size={15} />
          </IconButton>
        </Tooltip>
      </div>
      {hasQuote ? (
        <div className={`passage-card-quote${isLong && !open ? " is-clamped" : ""}`}>
          {/* Isolated prose renderer: a quoted link must not become a nested
              PassageCard or an executable file/source action. */}
          <ReactMarkdown remarkPlugins={plugins.remark} rehypePlugins={plugins.rehype}
            components={{ a: ({ children }) => <span>{children}</span> }}>
            {quote}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="passage-card-quote is-absent">{t("passage.no-excerpt")}</p>
      )}
      <div className="passage-card-actions">
        <RowButton className="passage-card-open" onClick={openPassage} title={openLabel}>
          {t("passage.open-source")}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </RowButton>
        {isLong && (
          <RowButton className="passage-card-collapse" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? t("passage.collapse") : t("passage.expand")}
          </RowButton>
        )}
      </div>
    </div>
  );
}
