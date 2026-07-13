// ContextShelf : composition produit au-dessus de la primitive Attachment
// officielle shadcn. Les comportements métier Atelier restent intacts :
// images, textes collés, citations groupées, lignes, aperçu riche et retrait
// unitaire sans mutation de la source.
import { useState } from "react";
import { ClipboardIcon, FilesIcon, FileTextIcon, XIcon } from "lucide-react";
import { t } from "../../lib/i18n";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
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

export type ShelfAttachment = {
  name: string;
  lines: string | null;
  text: string;
  imageUrl?: string;
  kind?: string;
  preview?: { title: string; rows: { label: string; value: string }[] };
};

function attachmentKindLabel(kind?: string) {
  switch (kind) {
    case "folder":
      return t("context.kind-folder");
    case "zotero":
      return t("context.kind-zotero");
    case "image":
      return t("context.kind-image");
    case "quote":
      return t("context.kind-quote");
    case "paste":
      return t("context.kind-paste");
    default:
      return t("context.kind-file");
  }
}

export function ContextShelf(p: {
  attachments: ShelfAttachment[];
  onRemoveAttachment: (index: number) => void;
  onOpenPaste: (paste: { name: string; text: string }) => void;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  if (p.attachments.length === 0) return null;

  const removeLabel = (name: string, suffix = "") =>
    `${t("action.remove")} ${name}${suffix}`;

  return (
    <AttachmentGroup className="chips-row" aria-label={t("context.attachments")}>
      {p.attachments.map((attachment, index) => attachment.imageUrl ? (
        <Attachment key={index} size="xs" orientation="vertical" className="context-attachment-image">
          <AttachmentMedia variant="image">
            <img src={attachment.imageUrl} alt={attachment.name} />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle title={attachment.name}>{citeLabel(attachment.name)}</AttachmentTitle>
            <AttachmentDescription>{t("context.kind-image")}</AttachmentDescription>
          </AttachmentContent>
          <AttachmentActions>
            <AttachmentAction
              type="button"
              aria-label={removeLabel(attachment.name)}
              onClick={() => p.onRemoveAttachment(index)}
            >
              <XIcon />
            </AttachmentAction>
          </AttachmentActions>
        </Attachment>
      ) : null)}

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
          const pasted = attachment.kind === "paste";
          const card = (
            <Attachment key={group.name} size="xs" className="context-attachment" title={attachment.text || attachment.name}>
              {grouped ? (
                <PopoverTrigger
                  render={<AttachmentTrigger aria-label={t("action.open-file", { ref: attachment.name })} />}
                />
              ) : pasted ? (
                <AttachmentTrigger
                  aria-label={t("action.open-file", { ref: attachment.name })}
                  onClick={() => p.onOpenPaste({ name: attachment.name, text: attachment.text })}
                />
              ) : null}
              <AttachmentMedia>
                {grouped ? <FilesIcon /> : pasted ? <ClipboardIcon /> : <FileTextIcon />}
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle title={attachment.name}>{citeLabel(attachment.name)}</AttachmentTitle>
                <AttachmentDescription>
                  {grouped
                    ? `${group.indexes.length} ${t("context.kind-quote")}`
                    : attachment.lines
                      ? t("chat.lines", { lines: attachment.lines })
                      : attachmentKindLabel(attachment.kind)}
                </AttachmentDescription>
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
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction
                  type="button"
                  aria-label={removeLabel(group.name)}
                  onClick={() => {
                    [...group.indexes].sort((left, right) => right - left)
                      .forEach((index) => p.onRemoveAttachment(index));
                    setOpenGroup(null);
                  }}
                >
                  <XIcon />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          );

          if (!grouped) return card;

          return (
            <Popover
              key={group.name}
              open={openGroup === group.name}
              onOpenChange={(open) => setOpenGroup(open ? group.name : null)}
            >
              {card}
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
    </AttachmentGroup>
  );
}
