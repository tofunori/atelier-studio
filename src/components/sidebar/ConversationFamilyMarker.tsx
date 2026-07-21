import { useEffect, useState } from "react";
import { Unlink2Icon } from "lucide-react";
import { t } from "../../lib/i18n";
import type {
  ConversationFamily,
  ContinuityTreeNode,
} from "../../lib/threadLinks";
import type { Thread } from "../../lib/ws";
import { ProviderIcon } from "../icons";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "../shadcn/popover";
import { Button, IconButton } from "../ui";

type FamilyRow = {
  node: ContinuityTreeNode;
  parent: Thread | null;
  depth: number;
};

function familyRows(root: ContinuityTreeNode): FamilyRow[] {
  const rows: FamilyRow[] = [];
  const visit = (
    node: ContinuityTreeNode,
    depth: number,
    parent: Thread | null,
  ) => {
    rows.push({ node, parent, depth });
    node.children.forEach((child) => visit(child, depth + 1, node.thread));
  };
  visit(root, 0, null);
  return rows;
}

function providerLabel(provider: string): string {
  if (provider === "opencode") return "OpenCode";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function title(thread: Thread): string {
  return thread.title?.trim() || "—";
}

function FamilyGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5.4 8h5.2" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="3.5" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="12.5" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

export function ConversationFamilyMarker(p: {
  family: ConversationFamily;
  currentThreadId: string;
  onOpenThread: (thread: Thread) => void;
  onUnlinkThread?: (childThreadId: string) => void;
  onPreviewChange: (familyId: string, previewed: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const rows = familyRows(p.family.root);
  const markerLabel = t("linkedConversation.markerLabel", {
    count: p.family.size,
  });

  useEffect(() => {
    p.onPreviewChange(p.family.id, hovered || open);
    return () => p.onPreviewChange(p.family.id, false);
  }, [hovered, open, p.family.id, p.onPreviewChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            className="pnav-family-marker"
            aria-label={markerLabel}
            title={markerLabel}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setHovered(true)}
            onBlur={() => setHovered(false)}
          >
            <FamilyGlyph />
          </Button>
        }
      />
      <PopoverContent side="right" align="start" className="pnav-family-popover">
        <PopoverHeader>
          <PopoverTitle>
            {t("linkedConversation.familyTitle")}
          </PopoverTitle>
          <PopoverDescription>
            {t("linkedConversation.familyHint")}
          </PopoverDescription>
        </PopoverHeader>
        <div
          className="pnav-family-tree"
          role="tree"
          aria-label={t("linkedConversation.treeLabel")}
        >
          {rows.map(({ node, parent, depth }) => {
            const thread = node.thread;
            const current = thread.id === p.currentThreadId;
            return (
              <div
                key={thread.id}
                className={`pnav-family-row${current ? " current" : ""}`}
                role="treeitem"
                aria-level={depth + 1}
                style={{ "--pnav-family-depth": depth } as React.CSSProperties}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="pnav-family-open"
                  onClick={() => p.onOpenThread(thread)}
                >
                  <span className="pnav-family-provider" aria-hidden="true">
                    <ProviderIcon provider={thread.provider} />
                  </span>
                  <span className="pnav-family-copy">
                    <span>{title(thread)}</span>
                    <span>{providerLabel(thread.provider)}</span>
                  </span>
                </Button>
                {parent && p.onUnlinkThread ? (
                  <IconButton
                    size="s"
                    className="pnav-family-unlink"
                    label={t("linkedConversation.unlinkFrom", {
                      title: title(parent),
                    })}
                    onClick={() => p.onUnlinkThread?.(thread.id)}
                  >
                    <Unlink2Icon aria-hidden="true" />
                  </IconButton>
                ) : null}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
