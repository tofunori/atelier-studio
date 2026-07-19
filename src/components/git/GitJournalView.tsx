import { SearchIcon } from "lucide-react";
import { eventLabel, t } from "../../lib/i18n";
import { LedgerIcon } from "../icons";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../shadcn/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../shadcn/input-group";
import { ScrollArea } from "../shadcn/scroll-area";
import { Button } from "../ui/Button";
import { RowButton } from "../ui/RowButton";
import { formatCost, timeKey } from "./gitSurfaceModel";
import type { GitSurfaceController } from "./useGitSurfaceController";

export function GitJournalView({ controller }: { controller: GitSurfaceController }) {
  return (
    <div className="ledger-view">
      <div className="ledger-filter">
        <LedgerIcon />
        <InputGroup>
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput
            className="git-filter-input"
            value={controller.filter}
            onChange={(event) => controller.setFilter(event.target.value)}
            placeholder={t("git.filter-placeholder")}
            aria-label={t("git.filter-placeholder")}
          />
        </InputGroup>
      </div>
      <ScrollArea className="ledger-scroll">
        {controller.groupedEntries.length === 0 ? (
          <Empty className="git-journal-empty">
            <EmptyHeader>
              <EmptyMedia variant="icon"><LedgerIcon /></EmptyMedia>
              <EmptyTitle>{t("git.entries-empty")}</EmptyTitle>
              <EmptyDescription>{t("git.journal-empty-help")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : controller.groupedEntries.map(([day, entries]) => (
          <div key={day} className="ledger-day">
            <div className="ledger-day-title">{day}</div>
            {entries.map((entry) => {
              const rowId = `${entry.ts}:${entry.threadId}`;
              const open = controller.expanded === rowId;
              return (
                <div key={rowId} className="ledger-entry">
                  <RowButton className="ledger-row" onClick={() => controller.setExpanded(open ? null : rowId)} aria-expanded={open}>
                    <span className="ledger-time">{timeKey(entry.ts)}</span>
                    <span>{entry.provider ?? t("common.agent")}</span>
                    <span className="ledger-prompt">{entry.promptExcerpt || entry.threadTitle || t("git.agent-turn")}</span>
                    <span>{formatCost(entry.usage?.cost)}</span>
                    <span>{t("git.files-count", { count: entry.filesChanged?.length ?? 0 })}</span>
                  </RowButton>
                  {open && (
                    <div className="ledger-detail">
                      <div className="ledger-detail-row"><span>{t("git.files-label")}</span><span>{entry.filesChanged?.join(", ") || "—"}</span></div>
                      <div className="ledger-detail-row">
                        <span>{t("git.tools")}</span>
                        <span>{entry.tools?.flatMap((tool) => tool.name ? [eventLabel(tool.name)] : []).join(", ") || "—"}</span>
                      </div>
                      <Button variant="ghost" className="ghost" onClick={() => window.dispatchEvent(new CustomEvent("open-thread", { detail: { threadId: entry.threadId } }))}>
                        {t("action.open-chat")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}
