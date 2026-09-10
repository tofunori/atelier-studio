"use client";

import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
  AttachmentRemovalContext,
} from "@/components/assistant-ui/elements/attachment.aui";
import { File } from "@/components/assistant-ui/elements/file";
import { Image } from "@/components/assistant-ui/elements/image";
import { MarkdownText } from "@/components/assistant-ui/elements/markdown-text";
import {
  ComposerQuotePreview,
  QuoteBlock,
  SelectionToolbar,
} from "@/components/assistant-ui/elements/quote.aui";
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "@/components/assistant-ui/elements/reasoning.aui";
import { ConversationMapAui } from "./conversation-map.aui";
import { ToolFallback } from "@/components/assistant-ui/elements/tool-fallback.aui";
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from "@/components/assistant-ui/elements/tool-group.aui";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { Button } from "@/components/assistant-ui/primitives/button";
import { Skeleton } from "@/components/assistant-ui/primitives/skeleton";
import { cn } from "@/lib/utils";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  type AssistantState,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  groupPartByType,
  MessagePrimitive,
  SuggestionPrimitive,
  ThreadPrimitive,
  type FileMessagePartComponent,
  type ImageMessagePartComponent,
  type ToolCallMessagePartComponent,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  MicIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import {
  createContext,
  useContext,
  type ComponentType,
  type FC,
  type PropsWithChildren,
  type ReactNode,
} from "react";

export type ThreadGroupPart = MessagePrimitive.GroupedParts.GroupPart;

/**
 * Optional component overrides for the thread. `AssistantMessage` and
 * `Welcome` replace whole sections; the remaining slots override how the
 * assistant message renders tool calls and part groups. Tool UIs registered
 * by name (toolkit `render`, `useAssistantDataUI`) take precedence over
 * `ToolFallback`.
 */
export type ThreadComponents = {
  AssistantMessage?: ComponentType | undefined;
  Welcome?: ComponentType | undefined;
  ToolFallback?: ToolCallMessagePartComponent | undefined;
  ToolGroup?:
    | ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>>
    | undefined;
  ReasoningGroup?:
    | ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>>
    | undefined;
};

export type ThreadProps = {
  components?: ThreadComponents | undefined;
  autoFocus?: boolean | undefined;
  /** Extra controls rendered beside the official send/cancel controls. */
  composerControls?: ReactNode;
  /** Controls appended to the assistant action bar. */
  messageActions?: ReactNode;
  /** Controls appended to the official user action bar (edit/revert/pin). */
  userMessageActions?: ReactNode;
  /** Optional queue/status content rendered immediately before the composer. */
  queue?: ReactNode;
  /** Alias for integrations that call the queue slot `composerBefore`. */
  composerBefore?: ReactNode;
  /** Remove a restored complete attachment from the host draft by stable id. */
  onRemoveAttachment?: (id: string) => void | Promise<void>;
};

export type ThreadSlots = Pick<
  ThreadProps,
  | "composerControls"
  | "messageActions"
  | "userMessageActions"
  | "queue"
  | "composerBefore"
>;

const EMPTY_COMPONENTS: ThreadComponents = {};

const ThreadComponentsContext =
  createContext<ThreadComponents>(EMPTY_COMPONENTS);
const ThreadSlotsContext = createContext<ThreadSlots>({});

// Startup exposes a loading placeholder thread; treat it as a new chat so
// the composer mounts centered. Loads after startup keep the docked layout.
const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  (!s.thread.isLoading || s.threads.isLoading);

// A switched thread that is still fetching its history: skeleton, not welcome.
const isHistoryLoadingView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  s.thread.isLoading &&
  !s.thread.isDisabled &&
  !s.threads.isLoading;

const ThreadHistorySkeleton: FC = () => (
  <div
    data-slot="aui_thread-history-skeleton"
    role="status"
    className="tw:animate-in tw:fade-in tw:fill-mode-both tw:flex tw:flex-col tw:gap-y-6 tw:[animation-delay:150ms] tw:[animation-duration:200ms]"
  >
    <span className="tw:sr-only">Loading conversation</span>
    <Skeleton className="tw:ml-auto tw:h-9 tw:w-2/5 tw:rounded-xl tw:motion-reduce:animate-none" />
    <div className="tw:flex tw:flex-col tw:gap-y-2">
      <Skeleton className="tw:h-4 tw:w-11/12 tw:motion-reduce:animate-none" />
      <Skeleton className="tw:h-4 tw:w-4/5 tw:motion-reduce:animate-none" />
      <Skeleton className="tw:h-4 tw:w-3/5 tw:motion-reduce:animate-none" />
    </div>
    <Skeleton className="tw:ml-auto tw:h-9 tw:w-1/3 tw:rounded-xl tw:motion-reduce:animate-none" />
    <div className="tw:flex tw:flex-col tw:gap-y-2">
      <Skeleton className="tw:h-4 tw:w-10/12 tw:motion-reduce:animate-none" />
      <Skeleton className="tw:h-4 tw:w-2/3 tw:motion-reduce:animate-none" />
    </div>
  </div>
);

export const Thread: FC<ThreadProps> = ({
  components = EMPTY_COMPONENTS,
  autoFocus = true,
  composerControls,
  messageActions,
  userMessageActions,
  queue,
  composerBefore,
  onRemoveAttachment,
}) => {
  const isEmpty = useAuiState(isNewChatView);

  return (
    <ThreadComponentsContext.Provider value={components}>
      <ThreadSlotsContext.Provider
        value={{ composerControls, messageActions, userMessageActions, queue, composerBefore }}
      >
        <AttachmentRemovalContext.Provider value={{ onRemoveAttachment }}>
          <ThreadRoot isEmpty={isEmpty} autoFocus={autoFocus} />
        </AttachmentRemovalContext.Provider>
      </ThreadSlotsContext.Provider>
    </ThreadComponentsContext.Provider>
  );
};

const ThreadRoot: FC<{ isEmpty: boolean; autoFocus: boolean }> = ({
  isEmpty,
  autoFocus,
}) => {
  const { Welcome = ThreadWelcome } = useContext(ThreadComponentsContext);
  const { queue, composerBefore } = useContext(ThreadSlotsContext);
  const beforeComposer = queue ?? composerBefore;

  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root tw:bg-background tw:@container tw:flex tw:h-full tw:flex-col"
      style={{
        // Claude's reference keeps the transcript and composer on one quiet
        // reading rail.  Keep the Atelier palette/font while using the same
        // 3xl content measure and flat 2xl composer surface.
        ["--thread-max-width" as string]: "48rem",
        ["--composer-bg" as string]: "var(--color-card)",
        ["--composer-radius" as string]: "1rem",
      }}
    >
      <ThreadPrimitive.Viewport
        // Ancrage en bas (comportement chat classique, comme l'ancien
        // ChatTimeline) : `turnAnchor="top"` fait insérer par assistant-ui un
        // espaceur de la hauteur du viewport sous le dernier tour et coupe le
        // suivi automatique du streaming — le fil finissait au tiers de l'écran.
        turnAnchor="bottom"
        data-slot="aui_thread-viewport"
        className="aui-mapped-viewport tw:relative tw:flex tw:flex-1 tw:flex-col tw:overflow-x-hidden tw:overflow-y-auto tw:scroll-smooth"
      >
        <ConversationMapAui className="aui-conversation-map" />
        <div
          className={cn(
            "aui-message-column tw:mx-auto tw:flex tw:w-full tw:max-w-(--thread-max-width) tw:flex-1 tw:flex-col tw:px-4 tw:pt-8",
            isEmpty && "tw:justify-center",
          )}
        >
          <AuiIf condition={isNewChatView}>
            <Welcome />
          </AuiIf>
          <AuiIf condition={isHistoryLoadingView}>
            <ThreadHistorySkeleton />
          </AuiIf>

          <div
            data-slot="aui_message-group"
            className="tw:mb-14 tw:flex tw:flex-col tw:gap-y-6 tw:empty:hidden"
          >
            <ThreadPrimitive.Messages>
              {() => <ThreadMessage />}
            </ThreadPrimitive.Messages>
          </div>

          <SelectionToolbar />

          <ThreadPrimitive.ViewportFooter
            className={cn(
              "aui-thread-viewport-footer tw:mx-auto tw:flex tw:w-full tw:max-w-(--thread-max-width) tw:flex-col tw:gap-4 tw:overflow-visible tw:pt-4 tw:pb-2",
              !isEmpty &&
                "tw:sticky tw:bottom-0 tw:mt-auto tw:rounded-t-(--composer-radius)",
            )}
          >
            <ThreadScrollToBottom />
            {beforeComposer}
            <Composer autoFocus={autoFocus} />
            <AuiIf condition={(s) => isNewChatView(s) && s.composer.isEmpty}>
              <ThreadSuggestions />
            </AuiIf>
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadMessage: FC = () => {
  const { AssistantMessage: AssistantMessageComponent = AssistantMessage } =
    useContext(ThreadComponentsContext);
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);

  if (isEditing) return <EditComposer />;
  if (role === "user") return <UserMessage />;
  return <AssistantMessageComponent />;
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom render={<TooltipIconButton tooltip="Scroll to bottom" variant="outline" className="aui-thread-scroll-to-bottom tw:dark:border-border tw:dark:bg-background tw:dark:hover:bg-accent tw:absolute tw:-top-12 tw:z-10 tw:self-center tw:rounded-full tw:p-4 tw:disabled:invisible" />}><ArrowDownIcon /></ThreadPrimitive.ScrollToBottom>
  );
};

export const ThreadWelcome: FC<{ title?: ReactNode }> = ({ title = "How can I help you today?" }) => {
  return (
    <div className="aui-thread-welcome-root tw:mb-6 tw:flex tw:flex-col tw:items-center tw:px-4 tw:text-center">
      <h1 className="aui-thread-welcome-message-inner tw:fade-in tw:slide-in-from-bottom-1 tw:animate-in tw:fill-mode-both tw:text-2xl tw:font-medium tw:tracking-tight tw:duration-200">
        {title}
      </h1>
    </div>
  );
};

const ThreadSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions tw:flex tw:w-full tw:flex-wrap tw:items-center tw:justify-center tw:gap-2 tw:px-4">
      <ThreadPrimitive.Suggestions>
        {() => <ThreadSuggestionItem />}
      </ThreadPrimitive.Suggestions>
    </div>
  );
};

const ThreadSuggestionItem: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestion-display tw:fade-in tw:slide-in-from-bottom-2 tw:animate-in tw:fill-mode-both tw:duration-200">
      <SuggestionPrimitive.Trigger send render={<Button variant="ghost" className="aui-thread-welcome-suggestion tw:text-foreground tw:hover:bg-muted tw:border-border/60 tw:h-auto tw:gap-1.5 tw:rounded-full tw:border tw:px-3.5 tw:py-1.5 tw:text-sm tw:font-normal tw:whitespace-nowrap tw:transition-colors" />}><SuggestionPrimitive.Title className="aui-thread-welcome-suggestion-text-1" /><SuggestionPrimitive.Description className="aui-thread-welcome-suggestion-text-2 tw:empty:hidden" /></SuggestionPrimitive.Trigger>
    </div>
  );
};

export const Composer: FC<{ autoFocus: boolean }> = ({ autoFocus }) => {
  return (
    <ComposerPrimitive.Root className="aui-composer-root tw:relative tw:flex tw:w-full tw:flex-col">
      <ComposerQuotePreview />
      <ComposerPrimitive.AttachmentDropzone render={<div data-slot="aui_composer-shell" className="tw:border-border/60 tw:data-[dragging=true]:border-ring tw:focus-within:border-border tw:dark:border-muted-foreground/15 tw:dark:focus-within:border-muted-foreground/30 tw:flex tw:w-full tw:cursor-text tw:flex-col tw:gap-2 tw:rounded-2xl tw:border tw:bg-(--composer-bg) tw:px-3.5 tw:pt-3 tw:pb-2.5 tw:shadow-none tw:transition-[border-color] tw:data-[dragging=true]:border-dashed tw:data-[dragging=true]:bg-[color-mix(in_oklab,var(--color-accent)_50%,var(--color-background))]" />}><ComposerAttachments /><ComposerPrimitive.Input
                      placeholder="Send a message..."
                      className="aui-composer-input tw:caret-primary tw:placeholder:text-muted-foreground/60 tw:max-h-48 tw:min-h-10 tw:w-full tw:resize-none tw:bg-transparent tw:px-2.5 tw:py-1 tw:text-base tw:leading-6 tw:outline-none"
                      rows={1}
                      autoFocus={autoFocus}
                      enterKeyHint="send"
                      aria-label="Message input"
                    /><ComposerAction /></ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC = () => {
  const { composerControls } = useContext(ThreadSlotsContext);

  return (
    <div className="aui-composer-action-wrapper tw:relative tw:flex tw:items-center tw:justify-between">
      <ComposerAddAttachment />
      <div className="tw:flex tw:items-center tw:gap-1.5">
        <AuiIf condition={(s) => s.thread.capabilities.dictation}>
          <AuiIf condition={(s) => s.composer.dictation == null}>
            <ComposerPrimitive.Dictate render={<TooltipIconButton tooltip="Voice input" side="bottom" type="button" variant="ghost" size="icon" className="aui-composer-dictate tw:text-muted-foreground tw:hover:text-foreground tw:size-7 tw:rounded-full" aria-label="Start voice input" />}><MicIcon className="aui-composer-dictate-icon tw:size-4" /></ComposerPrimitive.Dictate>
          </AuiIf>
          <AuiIf condition={(s) => s.composer.dictation != null}>
            <ComposerPrimitive.StopDictation render={<TooltipIconButton tooltip="Stop dictation" side="bottom" type="button" variant="ghost" size="icon" className="aui-composer-stop-dictation tw:text-destructive tw:size-7 tw:rounded-full" aria-label="Stop voice input" />}><SquareIcon className="aui-composer-stop-dictation-icon tw:size-3.5 tw:animate-pulse tw:fill-current" /></ComposerPrimitive.StopDictation>
          </AuiIf>
          </AuiIf>
        {composerControls}
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send render={<TooltipIconButton tooltip="Send message" side="bottom" type="button" variant="default" size="icon" className="aui-composer-send tw:size-7 tw:rounded-full" aria-label="Send message" />}><ArrowUpIcon className="aui-composer-send-icon tw:size-4" /></ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel render={<Button type="button" variant="default" size="icon" className="aui-composer-cancel tw:size-7 tw:rounded-full" aria-label="Stop generating" />}><SquareIcon className="aui-composer-cancel-icon tw:size-3.5 tw:fill-current" /></ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root tw:border-destructive tw:bg-destructive/10 tw:text-destructive tw:dark:bg-destructive/5 tw:mt-2 tw:rounded-md tw:border tw:p-3 tw:text-sm tw:dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message tw:line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantMessage: FC = () => {
  const {
    ToolFallback: ToolFallbackComponent = ToolFallback,
    ToolGroup,
    ReasoningGroup,
  } = useContext(ThreadComponentsContext);

  const ACTION_BAR_PT = "tw:pt-1.5";
  // Keep the action bar inside the contained root's paint box, then cancel its reserved space in flow.
  const ACTION_BAR_HEIGHT = `tw:min-h-7.5 ${ACTION_BAR_PT}`;

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className="tw:group/message tw:fade-in tw:slide-in-from-bottom-1 tw:animate-in tw:relative tw:-mb-7.5 tw:pb-7.5 tw:duration-150 tw:[contain-intrinsic-size:auto_200px] tw:[content-visibility:auto]"
    >
      <div
        data-slot="aui_assistant-message-content"
        className="tw:text-foreground tw:px-2 tw:leading-[1.65rem] tw:wrap-break-word"
      >
        <MessagePrimitive.GroupedParts
          groupBy={groupPartByType({
            reasoning: ["group-chainOfThought", "group-reasoning"],
            "tool-call": ["group-chainOfThought", "group-tool"],
            "standalone-tool-call": [],
          })}
        >
          {({ part, children }) => {
            switch (part.type) {
              case "group-chainOfThought":
                return <div data-slot="aui_chain-of-thought">{children}</div>;
              case "group-tool": {
                if (ToolGroup) {
                  return <ToolGroup group={part}>{children}</ToolGroup>;
                }
                // A pending approval is actionable content, not history. Keep
                // its native card mounted and visible until the runtime moves
                // the group out of `requires-action`; completed tool groups
                // retain the compact closed default.
                const requiresAction = part.status.type === "requires-action";
                return (
                  <ToolGroupRoot variant="ghost" open={requiresAction ? true : undefined}>
                    <ToolGroupTrigger
                      count={part.indices.length}
                      active={part.status.type === "running"}
                    />
                    <ToolGroupContent>{children}</ToolGroupContent>
                  </ToolGroupRoot>
                );
              }
              case "group-reasoning": {
                if (ReasoningGroup) {
                  return (
                    <ReasoningGroup group={part}>{children}</ReasoningGroup>
                  );
                }
                const running = part.status.type === "running";
                return (
                  <ReasoningRoot variant="ghost" streaming={running}>
                    <ReasoningTrigger active={running} />
                    <ReasoningContent aria-busy={running}>
                      <ReasoningText>{children}</ReasoningText>
                    </ReasoningContent>
                  </ReasoningRoot>
                );
              }
              case "text":
                return <MarkdownText />;
              case "reasoning":
                return <Reasoning {...part} />;
              case "tool-call":
                return part.toolUI ?? <ToolFallbackComponent {...part} />;
              case "data":
                return part.dataRendererUI;
              case "file":
                return (
                  <div data-slot="aui_assistant-message-file" className="tw:py-1">
                    <File {...part} />
                  </div>
                );
              case "image":
                return (
                  <div data-slot="aui_assistant-message-image" className="tw:py-1">
                    <Image {...part} />
                  </div>
                );
              case "indicator":
                return (
                  <span
                    data-slot="aui_assistant-message-indicator"
                    className="tw:animate-pulse tw:font-sans"
                    aria-label="Assistant is working"
                  >
                    {"●"}
                  </span>
                );
              default:
                return null;
            }
          }}
        </MessagePrimitive.GroupedParts>
        <MessageError />
      </div>

      <div
        data-slot="aui_assistant-message-footer"
        className={cn("tw:ms-2 tw:flex tw:items-center", ACTION_BAR_HEIGHT)}
      >
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  const { messageActions } = useContext(ThreadSlotsContext);

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root tw:text-muted-foreground tw:col-start-3 tw:row-start-2 tw:-ms-1 tw:flex tw:gap-1 tw:opacity-0 tw:transition-opacity tw:duration-200 tw:group-hover/message:opacity-100 tw:group-focus-within/message:opacity-100"
    >
      <ActionBarPrimitive.Copy render={<TooltipIconButton tooltip="Copy" />}><AuiIf condition={(s) => s.message.isCopied}>
                      <CheckIcon className="tw:animate-in tw:zoom-in-50 tw:fade-in tw:duration-200 tw:ease-out" />
                    </AuiIf><AuiIf condition={(s) => !s.message.isCopied}>
                      <CopyIcon className="tw:animate-in tw:zoom-in-75 tw:fade-in tw:duration-150" />
                    </AuiIf></ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload render={<TooltipIconButton tooltip="Refresh" />}><RefreshCwIcon /></ActionBarPrimitive.Reload>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger render={<TooltipIconButton tooltip="More" className="tw:data-[state=open]:bg-accent" />}><MoreHorizontalIcon /></ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="aui-action-bar-more-content tw:bg-popover tw:text-popover-foreground tw:data-[state=open]:fade-in-0 tw:data-[state=open]:zoom-in-95 tw:data-[state=open]:animate-in tw:data-[state=closed]:fade-out-0 tw:data-[state=closed]:zoom-out-95 tw:data-[state=closed]:animate-out tw:data-[side=bottom]:slide-in-from-top-2 tw:data-[side=left]:slide-in-from-right-2 tw:data-[side=right]:slide-in-from-left-2 tw:data-[side=top]:slide-in-from-bottom-2 tw:z-50 tw:min-w-[8rem] tw:overflow-hidden tw:rounded-xl tw:border tw:p-1.5"
        >
          <ActionBarPrimitive.ExportMarkdown render={<ActionBarMorePrimitive.Item className="aui-action-bar-more-item tw:hover:bg-accent tw:hover:text-accent-foreground tw:focus:bg-accent tw:focus:text-accent-foreground tw:flex tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-lg tw:px-2.5 tw:py-1.5 tw:text-sm tw:outline-none tw:select-none" />}><DownloadIcon className="tw:size-4" />Export as Markdown
                              </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
      {messageActions}
    </ActionBarPrimitive.Root>
  );
};

const UserFilePart: FileMessagePartComponent = (part) => (
  <div data-slot="aui_user-message-file" className="tw:py-1">
    <File {...part} />
  </div>
);

const UserImagePart: ImageMessagePartComponent = (part) => (
  <div data-slot="aui_user-message-image" className="tw:py-1">
    <Image {...part} />
  </div>
);

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      className="tw:group/message tw:fade-in tw:slide-in-from-bottom-1 tw:animate-in tw:grid tw:auto-rows-auto tw:grid-cols-[minmax(72px,1fr)_auto] tw:content-start tw:gap-y-2 tw:px-2 tw:duration-150 tw:[contain-intrinsic-size:auto_200px] tw:[content-visibility:auto] tw:[&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />

      <div className="aui-user-message-content-wrapper tw:relative tw:col-start-2 tw:min-w-0">
          <div className="aui-user-message-content tw:peer tw:bg-muted tw:text-foreground tw:rounded-2xl tw:px-4 tw:py-2.5 tw:wrap-break-word tw:empty:hidden">
          <MessagePrimitive.Parts
            components={{ File: UserFilePart, Image: UserImagePart, Quote: QuoteBlock }}
          />
        </div>
        <div className="aui-user-action-bar-wrapper tw:absolute tw:start-0 tw:top-1/2 tw:-translate-x-full tw:-translate-y-1/2 tw:pe-2 tw:opacity-0 tw:transition-opacity tw:duration-200 tw:group-hover/message:opacity-100 tw:group-focus-within/message:opacity-100 tw:peer-empty:hidden tw:rtl:translate-x-full">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker
        data-slot="aui_user-branch-picker"
        className="tw:col-span-full tw:col-start-1 tw:row-start-3 tw:-me-1 tw:justify-end"
      />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  const { userMessageActions } = useContext(ThreadSlotsContext);

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root tw:flex tw:flex-col tw:items-end"
    >
      <ActionBarPrimitive.Edit render={<TooltipIconButton tooltip="Edit" className="aui-user-action-edit" />}><PencilIcon /></ActionBarPrimitive.Edit>
      {userMessageActions}
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="tw:flex tw:flex-col tw:px-2 tw:[contain-intrinsic-size:auto_200px] tw:[content-visibility:auto]"
    >
      <ComposerPrimitive.Root className="aui-edit-composer-root tw:border-border/60 tw:dark:border-muted-foreground/15 tw:ms-auto tw:flex tw:w-full tw:max-w-[85%] tw:cursor-text tw:flex-col tw:rounded-2xl tw:border tw:bg-(--composer-bg) tw:shadow-none">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input tw:text-foreground tw:min-h-14 tw:w-full tw:resize-none tw:bg-transparent tw:px-4 tw:pt-3 tw:pb-1 tw:text-base tw:outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer tw:mx-2.5 tw:mb-2.5 tw:flex tw:items-center tw:gap-1.5 tw:self-end">
          <ComposerPrimitive.Cancel render={<Button variant="ghost" size="sm" className="tw:h-8 tw:rounded-full tw:px-3.5" />}>Cancel
                              </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send render={<Button size="sm" className="tw:h-8 tw:rounded-full tw:px-3.5" />}>Update
                              </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root tw:text-muted-foreground tw:-ms-2 tw:me-2 tw:inline-flex tw:items-center tw:text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous render={<TooltipIconButton tooltip="Previous" />}><ChevronLeftIcon /></BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state tw:font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next render={<TooltipIconButton tooltip="Next" />}><ChevronRightIcon /></BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
