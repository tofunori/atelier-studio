"use client";

import type { ComponentProps } from "react";
import {
  FolderOpenIcon,
  Maximize2Icon,
  Minimize2Icon,
  NetworkIcon,
  PlusIcon,
  UnlinkIcon,
} from "lucide-react";
import { t } from "../lib/i18n";
import { Button } from "./assistant-ui/primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./assistant-ui/primitives/popover";
import { TooltipIconButton } from "./assistant-ui/elements/tooltip-icon-button";
import { cn } from "../lib/utils";

export type AssistantUiLinkedAgent = {
  id: string;
  provider: string;
  title: string;
  paused: boolean;
  direction: "parent" | "child";
};

export type AssistantUiThreadControlsProps = Omit<ComponentProps<"div">, "children"> & {
  /** The host's current thread title. Empty titles remain empty instead of inventing a label. */
  threadTitle?: string | null;
  onNewChat?: () => void;
  onOpenProject?: () => void;
  onToggleExpand?: () => void;
  /** Controls the native expand/collapse label; no local layout state is created. */
  expanded?: boolean;
  linkedAgents?: readonly AssistantUiLinkedAgent[];
  onOpenLinkedAgent?: (threadId: string) => void;
  onUnlinkLinkedAgent?: (threadId: string) => void;
};

const expandLabel = (expanded: boolean) => expanded ? "Réduire le panneau du chat" : "Agrandir le panneau du chat";

/**
 * Small host bridge for thread navigation around the official assistant-ui
 * thread. It intentionally has no transcript, date, or local navigation
 * state; all actions and linked-agent records come from the Atelier host.
 */
export function AssistantUiThreadControls({
  threadTitle,
  onNewChat,
  onOpenProject,
  onToggleExpand,
  expanded = false,
  linkedAgents = [],
  onOpenLinkedAgent,
  onUnlinkLinkedAgent,
  className,
  ...props
}: AssistantUiThreadControlsProps) {
  const parents = linkedAgents.filter((agent) => agent.direction === "parent");
  const children = linkedAgents.filter((agent) => agent.direction === "child");
  const renderGroup = (label: string, agents: readonly AssistantUiLinkedAgent[]) => {
    if (agents.length === 0) return null;
    return (
      <section aria-label={label} className="tw:flex tw:flex-col tw:gap-1">
        <p className="tw:px-2 tw:pt-1 tw:text-xs tw:font-medium tw:uppercase tw:tracking-[0.08em] tw:text-muted-foreground">
          {label}
        </p>
        {agents.map((agent) => (
          <div key={agent.id} className="tw:flex tw:items-center tw:gap-1">
            {onOpenLinkedAgent ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="tw:min-w-0 tw:flex-1 tw:justify-start"
                onClick={() => onOpenLinkedAgent(agent.id)}
              >
                <span className="tw:truncate" data-paused={agent.paused || undefined}>
                  {agent.provider} · {agent.title}
                </span>
              </Button>
            ) : (
              <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:px-2 tw:py-1 tw:text-sm" data-paused={agent.paused || undefined}>
                {agent.provider} · {agent.title}
              </span>
            )}
            {onUnlinkLinkedAgent ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("linkedConversation.unlinkNamed", { provider: agent.provider })}
                onClick={() => onUnlinkLinkedAgent(agent.id)}
              >
                <UnlinkIcon />
              </Button>
            ) : null}
          </div>
        ))}
      </section>
    );
  };

  return (
    <div
      data-slot="assistant-ui-thread-controls"
      className={cn("tw:flex tw:items-center tw:gap-1.5", className)}
      {...props}
    >
      {threadTitle ? (
        <h2 className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-sm tw:font-medium" title={threadTitle}>
          {threadTitle}
        </h2>
      ) : null}
      <div className="tw:ml-auto tw:flex tw:items-center tw:gap-0.5">
        {onNewChat ? (
          <TooltipIconButton tooltip={t("action.new-chat")} aria-label={t("action.new-chat")} onClick={onNewChat}>
            <PlusIcon />
          </TooltipIconButton>
        ) : null}
        {onOpenProject ? (
          <TooltipIconButton tooltip={t("action.open-project")} aria-label={t("action.open-project")} onClick={onOpenProject}>
            <FolderOpenIcon />
          </TooltipIconButton>
        ) : null}
        {onToggleExpand ? (
          <TooltipIconButton tooltip={expandLabel(expanded)} aria-label={expandLabel(expanded)} onClick={onToggleExpand}>
            {expanded ? <Minimize2Icon /> : <Maximize2Icon />}
          </TooltipIconButton>
        ) : null}
        {linkedAgents.length > 0 ? (
          <Popover>
            <PopoverTrigger
              render={
                <TooltipIconButton
                  tooltip={t("linkedConversation.title")}
                  aria-label={t("linkedConversation.title")}
                  aria-haspopup="dialog"
                />
              }
            >
              <NetworkIcon />
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" className="tw:w-72">
              <PopoverHeader>
                <PopoverTitle>{t("linkedConversation.title")}</PopoverTitle>
              </PopoverHeader>
              <div className="tw:flex tw:flex-col tw:gap-2">
                {renderGroup(t("linkedConversation.createdFrom"), parents)}
                {renderGroup(t("linkedConversation.continuesTo"), children)}
              </div>
              <p className="tw:pt-1 tw:text-xs tw:text-muted-foreground">
                {t("linkedConversation.unlinkKeepsChats")}
              </p>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
    </div>
  );
}

export const ASSISTANT_UI_THREAD_CONTROLS_LIMITATIONS = {
  transcript: "Transcript grouping and view modes remain owned by assistant-ui Thread; this bridge exposes no parallel renderer or local view state.",
  linkedAgents: "Opening and unlinking linked agents are host callbacks; this component does not synthesize status, dates, or thread records.",
} as const;
