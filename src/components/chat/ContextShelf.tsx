// ContextShelf : rangée de contexte UNIFIÉE (plan 050 P2) — chaque pièce
// jointe éphémère (citation, image, fichier, collage, capture…) est une
// pilule fine du même gabarit que les pilules KB. Comportements intacts :
// zoom image (dialog + navigation clavier), aperçu des collages, citations
// groupées en popover, aperçu riche Zotero, retrait unitaire.
import { useEffect, useState } from "react";
import {
  CameraIcon, ChevronLeftIcon, ChevronRightIcon, ClipboardIcon,
  FileTextIcon, FolderIcon, ImageIcon, QuoteIcon, XIcon,
} from "lucide-react";
import { t } from "../../lib/i18n";
import { Button } from "../shadcn/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "../shadcn/dialog";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentTitle,
} from "../shadcn/attachment";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "../shadcn/popover";
import { citeLabel } from "./turnParts";
import { IconButton, RowButton } from "../ui";

export type ShelfAttachment = {
  name: string;
  lines: string | null;
  text: string;
  imageUrl?: string;
  kind?: string;
  preview?: { title: string; rows: { label: string; value: string }[] };
};

function kindGlyph(kind?: string) {
  switch (kind) {
    case "quote": return <QuoteIcon className="context-pill-glyph" />;
    case "paste": return <ClipboardIcon className="context-pill-glyph" />;
    case "folder": return <FolderIcon className="context-pill-glyph" />;
    case "appsnap": return <CameraIcon className="context-pill-glyph" />;
    default: return <FileTextIcon className="context-pill-glyph" />;
  }
}

export function ContextShelf(p: {
  attachments: ShelfAttachment[];
  onRemoveAttachment: (index: number) => void;
  onOpenPaste: (paste: { name: string; text: string }) => void;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [expandedImageIndex, setExpandedImageIndex] = useState<number | null>(null);
  const imageAttachments = p.attachments.flatMap((attachment, attachmentIndex) =>
    attachment.imageUrl ? [{ attachment, attachmentIndex }] : [],
  );
  const expandedImage = expandedImageIndex === null ? null : imageAttachments[expandedImageIndex] ?? null;

  useEffect(() => {
    if (expandedImageIndex !== null && expandedImageIndex >= imageAttachments.length) {
      setExpandedImageIndex(null);
    }
  }, [expandedImageIndex, imageAttachments.length]);

  useEffect(() => {
    if (expandedImageIndex === null || imageAttachments.length < 2) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      setExpandedImageIndex((current) => current === null
        ? null
        : (current + direction + imageAttachments.length) % imageAttachments.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedImageIndex, imageAttachments.length]);

  if (p.attachments.length === 0) return null;

  const removeLabel = (name: string, suffix = "") =>
    `${t("action.remove")} ${name}${suffix}`;

  return (
    <div className="chips-row context-pills" aria-label={t("context.attachments")}>
      {p.attachments.map((attachment, index) => attachment.imageUrl ? (
        <span key={`image-${index}`} className="chip context-pill" title={attachment.name}>
          <RowButton
            className="context-pill-main"
            aria-label={t("context.preview-image", { name: attachment.name })}
            onClick={() => setExpandedImageIndex(
              imageAttachments.findIndex((candidate) => candidate.attachmentIndex === index),
            )}
          >
            <ImageIcon className="context-pill-glyph" />
            <span className="chip-label">{citeLabel(attachment.name)}</span>
          </RowButton>
          <IconButton
            size="s"
            className="ghost"
            label={removeLabel(attachment.name)}
            title={removeLabel(attachment.name)}
            onClick={() => p.onRemoveAttachment(index)}
          >
            <XIcon className="context-pill-glyph" />
          </IconButton>
        </span>
      ) : null)}

      <Dialog
        open={expandedImage !== null}
        onOpenChange={(open) => { if (!open) setExpandedImageIndex(null); }}
      >
        {expandedImage && (
          <DialogContent
            showCloseButton={false}
            aria-label={t("context.expanded-image-preview")}
            overlayClassName="tw:bg-black/75 tw:backdrop-blur-none"
            className="tw:inset-0 tw:top-0 tw:left-0 tw:isolate tw:flex tw:h-dvh tw:w-dvw tw:max-w-none tw:translate-x-0 tw:translate-y-0 tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-none tw:bg-transparent tw:p-4 tw:ring-0 tw:shadow-none"
            style={{ inset: 0, top: 0, left: 0, width: "100dvw", height: "100dvh", maxWidth: "none", transform: "none", translate: "none" }}
          >
            <DialogTitle className="tw:sr-only">{t("context.expanded-image-preview")}</DialogTitle>
            <DialogClose
              className="tw:absolute tw:inset-0 tw:z-0 tw:cursor-default tw:border-0 tw:bg-transparent tw:p-0"
              aria-hidden="true"
              tabIndex={-1}
            />
            <DialogClose
              render={(
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="tw:absolute tw:top-2 tw:right-2 tw:z-20 tw:bg-black/35 tw:text-white tw:hover:bg-black/55 tw:hover:text-white"
                />
              )}
            >
              <XIcon />
              <span className="tw:sr-only">{t("context.close-image-preview")}</span>
            </DialogClose>
            <div className="tw:pointer-events-none tw:relative tw:z-10 tw:flex tw:max-h-full tw:max-w-full tw:flex-col tw:items-center tw:justify-center tw:gap-2">
              <img
                src={expandedImage.attachment.imageUrl}
                alt={expandedImage.attachment.name}
                className="tw:max-h-[86vh] tw:max-w-[92vw] tw:select-none tw:rounded-lg tw:border tw:border-border tw:bg-popover tw:object-contain tw:shadow-2xl"
                draggable={false}
              />
              <p className="tw:m-0 tw:max-w-[92vw] tw:truncate tw:text-center tw:text-xs tw:text-white/75">
                {expandedImage.attachment.name}
                {imageAttachments.length > 1 ? ` (${expandedImageIndex! + 1}/${imageAttachments.length})` : ""}
              </p>
            </div>
            {imageAttachments.length > 1 && (
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="tw:fixed tw:left-2 tw:top-1/2 tw:z-[calc(var(--z-modal)+1)] tw:-translate-y-1/2 tw:text-white/90 tw:hover:bg-white/10 tw:hover:text-white tw:sm:left-6"
                  aria-label={t("context.previous-image")}
                  onClick={() => setExpandedImageIndex((expandedImageIndex! - 1 + imageAttachments.length) % imageAttachments.length)}
                >
                  <ChevronLeftIcon />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="tw:fixed tw:right-2 tw:top-1/2 tw:z-[calc(var(--z-modal)+1)] tw:-translate-y-1/2 tw:text-white/90 tw:hover:bg-white/10 tw:hover:text-white tw:sm:right-6"
                  aria-label={t("context.next-image")}
                  onClick={() => setExpandedImageIndex((expandedImageIndex! + 1) % imageAttachments.length)}
                >
                  <ChevronRightIcon />
                </Button>
              </>
            )}
          </DialogContent>
        )}
      </Dialog>

      {(() => {
        const groups: { name: string; indexes: number[]; first: ShelfAttachment }[] = [];
        p.attachments.forEach((attachment, index) => {
          if (attachment.imageUrl) return;
          const group = groups.find((candidate) => candidate.name === attachment.name);
          if (group) group.indexes.push(index);
          else groups.push({ name: attachment.name, indexes: [index], first: attachment });
        });

        return groups.map((group) => {
          const attachment = group.first;
          const grouped = group.indexes.length > 1;
          const pillBody = (
            <>
              {kindGlyph(grouped ? "quote" : attachment.kind)}
              <span className="chip-label">{citeLabel(group.name)}</span>
              {grouped
                ? <span className="context-pill-count">{group.indexes.length}</span>
                : attachment.lines
                  ? <span className="chip-lines">{attachment.lines}</span>
                  : null}
            </>
          );
          const pill = (
            <span key={group.name} className="chip context-pill" title={attachment.text || attachment.name}>
              {grouped ? (
                <PopoverTrigger
                  render={
                    <RowButton
                      className="context-pill-main"
                      aria-label={t("action.open-file", { ref: group.name })}
                    >
                      {pillBody}
                    </RowButton>
                  }
                />
              ) : (
                <RowButton
                  className="context-pill-main"
                  aria-label={t("action.open-file", { ref: group.name })}
                  onClick={() => p.onOpenPaste({ name: attachment.name, text: attachment.text })}
                >
                  {pillBody}
                </RowButton>
              )}
              {attachment.preview && (
                <span className="chip-preview" role="tooltip">
                  <strong>{attachment.preview.title}</strong>
                  {attachment.preview.rows.map((row, rowIndex) => (
                    <span key={rowIndex} className="chip-preview-row">
                      <em>{row.label}</em>
                      <span>{row.value}</span>
                    </span>
                  ))}
                </span>
              )}
              <IconButton
                size="s"
                className="ghost"
                label={removeLabel(group.name)}
                title={removeLabel(group.name)}
                onClick={() => {
                  [...group.indexes].sort((left, right) => right - left)
                    .forEach((index) => p.onRemoveAttachment(index));
                  setOpenGroup(null);
                }}
              >
                <XIcon className="context-pill-glyph" />
              </IconButton>
            </span>
          );

          if (!grouped) return pill;

          return (
            <Popover
              key={group.name}
              open={openGroup === group.name}
              onOpenChange={(open) => setOpenGroup(open ? group.name : null)}
            >
              {pill}
              <PopoverContent align="start" side="top" className="tw:w-80">
                <PopoverHeader>
                  <PopoverTitle>{citeLabel(group.name)}</PopoverTitle>
                  <PopoverDescription>
                    {group.indexes.length} {t("context.kind-quote")}
                  </PopoverDescription>
                </PopoverHeader>
                <AttachmentGroup className="tw:flex-col tw:overflow-visible tw:py-0">
                  {group.indexes.map((index, quoteIndex) => {
                    const item = p.attachments[index];
                    return (
                      <Attachment key={index} size="xs" className="tw:w-full">
                        <AttachmentContent>
                          <AttachmentTitle>
                            {item.lines ? t("chat.lines", { lines: item.lines }) : `#${quoteIndex + 1}`}
                          </AttachmentTitle>
                          <AttachmentDescription>
                            {(item.text || "").replace(/\s+/g, " ").slice(0, 90)}
                          </AttachmentDescription>
                        </AttachmentContent>
                        <AttachmentActions>
                          <AttachmentAction
                            type="button"
                            aria-label={removeLabel(group.name, ` ${quoteIndex + 1}`)}
                            onClick={() => p.onRemoveAttachment(index)}
                          >
                            <XIcon />
                          </AttachmentAction>
                        </AttachmentActions>
                      </Attachment>
                    );
                  })}
                </AttachmentGroup>
              </PopoverContent>
            </Popover>
          );
        });
      })()}
    </div>
  );
}
