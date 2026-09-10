"use client";

import { type ComponentProps, useMemo } from "react";
import {
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  FileArchiveIcon,
  FileImageIcon,
  FileTextIcon,
  Loader2Icon,
  MicIcon,
  PlusIcon,
  SquareIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  field,
  floating,
  ghostButton,
  iconSwap,
  iconSwapIn,
  iconSwapOut,
  inkButton,
  mono,
  paper,
  ShimmerLabel,
} from "./surfaces";
import { clamp, pct } from "../utils/range";

export interface ComposerAttachment {
  name: string;
  meta: string;
  state: "uploading" | "done" | "error";
  progress?: number;
  kind?: "image" | "text" | "archive";
}

export interface ComposerCommand {
  name: string;
  description: string;
  icon: LucideIcon;
}

export interface ComposerPerson {
  name: string;
  role: "agent" | "human";
}

export interface ComposerModel {
  name: string;
  meta: string;
}

export interface ComposerUsage {
  system: number;
  tools: number;
  messages: number;
  total: number;
}

const ATTACHMENT_ICONS: Record<
  NonNullable<ComposerAttachment["kind"]>,
  LucideIcon
> = {
  image: FileImageIcon,
  text: FileTextIcon,
  archive: FileArchiveIcon,
};

const BARS = Array.from({ length: 14 }, (_, i) => i);

function barHeight(bar: number, tick: number): number {
  return 5 + Math.abs(Math.sin(bar * 1.35 + tick * 0.55)) * 13;
}

/** Commands whose name starts with the slash query, or none when not typing one. */
export function useSlashMatches(
  value: string,
  commands: readonly ComposerCommand[] | undefined,
): ComposerCommand[] {
  return useMemo(() => {
    if (!commands || !value.startsWith("/")) return [];
    const query = value.slice(1).toLowerCase();
    return commands.filter((command) => command.name.startsWith(query));
  }, [commands, value]);
}

/** People matching a trailing @mention, or none when the caret is not in one. */
export function useMentionMatches(
  value: string,
  people: readonly ComposerPerson[] | undefined,
): ComposerPerson[] {
  return useMemo(() => {
    if (!people) return [];
    const match = /@([\w]*)$/.exec(value);
    if (!match) return [];
    const query = match[1]?.toLowerCase() ?? "";
    return people.filter((person) =>
      person.name.toLowerCase().startsWith(query),
    );
  }, [people, value]);
}

/** Replaces the trailing @mention with the chosen name. */
export function applyMention(value: string, name: string): string {
  return value.replace(/@[\w]*$/, `@${name} `);
}

export function Composer({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer"
      className={cn("tw:relative tw:w-full tw:max-w-lg", className)}
      {...props}
    />
  );
}

export function ComposerBar({
  dragActive = false,
  className,
  ...props
}: ComponentProps<"div"> & { dragActive?: boolean }) {
  return (
    <div
      data-slot="composer-bar"
      data-drag-active={dragActive || undefined}
      className={cn(
        paper,
        "tw:flex tw:w-full tw:flex-col tw:gap-2 tw:rounded-[24px] tw:p-2.5 tw:transition-colors",
        dragActive && "tw:bg-blue-500/[0.04] tw:dark:bg-blue-500/10",
        className,
      )}
      {...props}
    />
  );
}

export function ComposerMenu({
  open,
  align = "start",
  className,
  ...props
}: ComponentProps<"div"> & { open: boolean; align?: "start" | "end" }) {
  return (
    <div
      data-slot="composer-menu"
      data-open={open || undefined}
      className={cn(
        floating,
        "tw:absolute tw:bottom-full tw:z-10 tw:mb-2 tw:flex tw:w-72 tw:flex-col tw:gap-0.5 tw:rounded-2xl tw:p-1.5",
        align === "start"
          ? "tw:start-0 tw:origin-bottom-left"
          : "tw:end-0 tw:origin-bottom-right",
        "tw:transition-[opacity,scale] tw:duration-200 tw:ease-[cubic-bezier(0.23,1,0.32,1)] tw:motion-reduce:transition-none",
        open
          ? "tw:scale-100 tw:opacity-100"
          : "tw:pointer-events-none tw:scale-[0.97] tw:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export function ComposerMenuItem({
  active = false,
  className,
  ...props
}: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      data-slot="composer-menu-item"
      data-active={active || undefined}
      className={cn(
        "tw:flex tw:w-full tw:items-center tw:gap-2.5 tw:rounded-[10px] tw:px-2.5 tw:py-2 tw:text-[13.5px] tw:transition-colors",
        active ? field : "tw:hover:bg-foreground/[0.04]",
        className,
      )}
      {...props}
    />
  );
}

export function ComposerCommandItem({
  command,
  active,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  command: ComposerCommand;
  active: boolean;
}) {
  return (
    <ComposerMenuItem active={active} {...props}>
      <command.icon className="tw:text-foreground/35 tw:size-3.5 tw:shrink-0" />
      <span className="tw:font-medium">/{command.name}</span>
      <span className="tw:text-foreground/45 tw:flex-1 tw:truncate tw:text-start tw:text-xs">
        {command.description}
      </span>
      {active && (
        <kbd className="tw:bg-foreground/[0.06] tw:text-foreground/45 tw:rounded tw:px-1 tw:font-mono tw:text-[10px]">
          ↵
        </kbd>
      )}
    </ComposerMenuItem>
  );
}

export function ComposerPersonItem({
  person,
  active,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  person: ComposerPerson;
  active: boolean;
}) {
  return (
    <ComposerMenuItem active={active} {...props}>
      <span className="tw:bg-foreground/[0.06] tw:text-foreground/45 tw:flex tw:size-5 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:text-[9px] tw:font-medium">
        {person.name[0]}
      </span>
      <span className="tw:flex-1 tw:truncate tw:text-start">{person.name}</span>
      <span className={cn(mono, "tw:text-foreground/35")}>{person.role}</span>
    </ComposerMenuItem>
  );
}

export function ComposerAttachments({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-attachments"
      className={cn("tw:flex tw:flex-wrap tw:gap-2", className)}
      {...props}
    />
  );
}

export function ComposerAttachmentChip({
  attachment,
  onRemove,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  attachment: ComposerAttachment;
  onRemove?: (name: string) => void;
}) {
  const Icon = ATTACHMENT_ICONS[attachment.kind ?? "text"];
  return (
    <div
      data-slot="composer-attachment"
      data-state={attachment.state}
      className={cn(
        field,
        "tw:relative tw:flex tw:items-center tw:gap-2.5 tw:overflow-hidden tw:rounded-[14px] tw:py-1.5 tw:ps-1.5 tw:pe-2.5",
        className,
      )}
      {...props}
    >
      <span className="tw:bg-background tw:text-foreground/45 tw:flex tw:size-8 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[10px] tw:dark:bg-white/10">
        <Icon className="tw:size-4" />
      </span>
      <span className="tw:flex tw:flex-col">
        <span className="tw:max-w-36 tw:truncate tw:text-xs tw:font-medium">
          {attachment.name}
        </span>
        <span
          className={cn(
            "tw:text-[11px]",
            attachment.state === "error"
              ? "tw:text-red-600/80 tw:dark:text-red-400/80"
              : "tw:text-foreground/40",
          )}
        >
          {attachment.meta}
        </span>
      </span>
      <span className="tw:ms-1 tw:flex tw:w-5 tw:items-center tw:justify-end">
        {attachment.state === "uploading" ? (
          <Loader2Icon className="tw:text-foreground/35 tw:size-3.5 tw:animate-spin tw:motion-reduce:animate-none" />
        ) : attachment.state === "done" && onRemove ? (
          <button
            type="button"
            aria-label={`Remove ${attachment.name}`}
            onClick={() => onRemove(attachment.name)}
            className={cn(ghostButton, "tw:size-5 tw:[&_svg]:size-3")}
          >
            <XIcon />
          </button>
        ) : attachment.state === "done" ? (
          <CheckIcon className="tw:size-3.5 tw:text-emerald-500" />
        ) : null}
      </span>
      {attachment.state === "uploading" && (
        <span
          aria-hidden
          className="tw:absolute tw:inset-x-0 tw:bottom-0 tw:h-0.5 tw:bg-blue-500/70 tw:transition-[width] tw:duration-300 tw:dark:bg-blue-400/70"
          style={{ width: `${pct(attachment.progress ?? 0, 100)}%` }}
        />
      )}
    </div>
  );
}

export function ComposerInput({
  onSubmit,
  onKeyDown,
  className,
  ...props
}: Omit<ComponentProps<"input">, "onSubmit"> & { onSubmit?: () => void }) {
  return (
    <input
      data-slot="composer-input"
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        onSubmit?.();
      }}
      className={cn(
        "tw:placeholder:text-foreground/35 tw:min-h-11 tw:w-full tw:bg-transparent tw:px-3 tw:text-[15px] tw:caret-blue-500 tw:outline-none tw:dark:caret-blue-400",
        className,
      )}
      {...props}
    />
  );
}

export function ComposerVoice({
  recording,
  seconds,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  recording: boolean;
  seconds: number;
}) {
  return (
    <div
      data-slot="composer-voice"
      data-recording={recording || undefined}
      className={cn("tw:flex tw:min-h-11 tw:items-center tw:gap-3 tw:ps-3", className)}
      {...props}
    >
      {recording && (
        <span
          aria-hidden
          className="tw:size-1.5 tw:animate-pulse tw:rounded-full tw:bg-blue-500 tw:dark:bg-blue-400"
        />
      )}
      <div className="tw:flex tw:h-6 tw:items-center tw:gap-[3px]" aria-hidden>
        {BARS.map((bar) => (
          <span
            key={bar}
            className={cn(
              "tw:w-0.5 tw:rounded-full tw:transition-[height,background-color] tw:duration-150 tw:motion-reduce:transition-none",
              recording ? "tw:bg-foreground/50" : "tw:bg-foreground/25",
            )}
            style={{ height: recording ? barHeight(bar, seconds * 10) : 3 }}
          />
        ))}
      </div>
      {recording ? (
        <span className={cn(mono, "tw:text-foreground/40 tw:tabular-nums")}>
          0:{String(seconds).padStart(2, "0")}
        </span>
      ) : (
        <ShimmerLabel className="tw:text-foreground/55 tw:relative tw:text-[13px]">
          Transcribing
        </ShimmerLabel>
      )}
    </div>
  );
}

export function ComposerToolbar({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-toolbar"
      className={cn("tw:flex tw:items-center tw:justify-between", className)}
      {...props}
    />
  );
}

export function ComposerActions({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-actions"
      className={cn("tw:flex tw:items-center tw:gap-1.5", className)}
      {...props}
    />
  );
}

export function ComposerAttachButton({
  className,
  ...props
}: Omit<ComponentProps<"button">, "children">) {
  return (
    <button
      type="button"
      aria-label="Add attachment"
      data-slot="composer-attach"
      disabled={!props.onClick}
      className={cn(
        ghostButton,
        "tw:size-8 tw:disabled:pointer-events-none tw:disabled:opacity-30",
        className,
      )}
      {...props}
    >
      <PlusIcon className="tw:size-4" />
    </button>
  );
}

export function ComposerModelTrigger({
  model,
  open,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  model: string;
  open: boolean;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      data-slot="composer-model-trigger"
      className={cn(
        "tw:text-foreground/55 tw:hover:bg-foreground/[0.06] tw:hover:text-foreground/90 tw:dark:hover:bg-foreground/[0.09] tw:flex tw:h-8 tw:items-center tw:gap-1.5 tw:rounded-full tw:px-3 tw:text-[12.5px] tw:transition-colors",
        className,
      )}
      {...props}
    >
      {model}
      <ChevronDownIcon className="tw:size-3 tw:opacity-60" />
    </button>
  );
}

export function ComposerModelItem({
  entry,
  selected,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  entry: ComposerModel;
  selected: boolean;
}) {
  return (
    <ComposerMenuItem active={selected} {...props}>
      <span className="tw:flex-1 tw:text-start">{entry.name}</span>
      <span className={cn(mono, "tw:text-foreground/35 tw:tabular-nums")}>
        {entry.meta}
      </span>
      <span className="tw:flex tw:w-4 tw:justify-end">
        {selected && (
          <CheckIcon className="tw:fade-in tw:zoom-in-90 tw:animate-in tw:size-3.5 tw:duration-200" />
        )}
      </span>
    </ComposerMenuItem>
  );
}

export function ComposerContext({
  usage,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & { usage: ComposerUsage }) {
  const used = usage.system + usage.tools + usage.messages;
  const fraction = usage.total === 0 ? 0 : used / usage.total;
  const warn = fraction > 0.85;
  const circumference = 2 * Math.PI * 6;
  const segments = [
    { label: "System", value: usage.system, className: "tw:bg-foreground/25" },
    { label: "Tools", value: usage.tools, className: "tw:bg-foreground/45" },
    { label: "Messages", value: usage.messages, className: "tw:bg-foreground/80" },
  ];

  return (
    <div
      data-slot="composer-context"
      className={cn("tw:group/ctx tw:relative", className)}
      {...props}
    >
      <div
        className={cn(
          floating,
          "tw:absolute tw:end-0 tw:bottom-full tw:z-10 tw:mb-2 tw:flex tw:w-60 tw:origin-bottom-right tw:flex-col tw:gap-3.5 tw:rounded-2xl tw:p-4",
          "tw:transition-[opacity,scale] tw:duration-200 tw:ease-[cubic-bezier(0.23,1,0.32,1)] tw:motion-reduce:transition-none",
          "tw:pointer-events-none tw:scale-[0.97] tw:opacity-0",
          "tw:group-hover/ctx:pointer-events-auto tw:group-hover/ctx:scale-100 tw:group-hover/ctx:opacity-100",
          "tw:group-focus-within/ctx:pointer-events-auto tw:group-focus-within/ctx:scale-100 tw:group-focus-within/ctx:opacity-100",
        )}
      >
        <div className="tw:flex tw:items-baseline tw:justify-between">
          <p className="tw:text-[13.5px] tw:font-medium">Context</p>
          <p
            className={cn(
              mono,
              "tw:tabular-nums",
              warn ? "tw:text-red-500 tw:dark:text-red-400" : "tw:text-foreground/35",
            )}
          >
            {Math.round(fraction * 100)}%
          </p>
        </div>
        <div className="tw:bg-foreground/[0.06] tw:flex tw:h-[5px] tw:w-full tw:gap-px tw:overflow-hidden tw:rounded-full">
          {segments.map((segment) => (
            <span
              key={segment.label}
              className={cn(
                "tw:h-full tw:transition-[width] tw:duration-700 tw:motion-reduce:transition-none",
                segment.className,
              )}
              style={{ width: `${pct(segment.value, usage.total)}%` }}
            />
          ))}
        </div>
        <div className="tw:flex tw:flex-col tw:gap-2">
          {segments.map((segment) => (
            <div
              key={segment.label}
              className="tw:text-foreground/55 tw:flex tw:items-center tw:gap-2.5 tw:text-[13px]"
            >
              <span
                aria-hidden
                className={cn("tw:size-1.5 tw:rounded-full", segment.className)}
              />
              <span className="tw:flex-1">{segment.label}</span>
              <span className={cn(mono, "tw:text-foreground/40 tw:tabular-nums")}>
                {segment.value}k
              </span>
            </div>
          ))}
        </div>
        <div className="tw:bg-foreground/[0.06] tw:h-px" />
        <div className="tw:text-foreground/55 tw:flex tw:items-center tw:justify-between tw:text-[13px]">
          <span>Total</span>
          <span className={cn(mono, "tw:text-foreground/40 tw:tabular-nums")}>
            {used}k / {usage.total}k
          </span>
        </div>
      </div>
      <button
        type="button"
        aria-label="Context usage"
        className={cn(
          ghostButton,
          "tw:size-8",
          warn && "tw:text-red-500 tw:dark:text-red-400",
        )}
      >
        <svg viewBox="0 0 16 16" className="tw:size-4 tw:-rotate-90" aria-hidden>
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            strokeWidth="2.5"
            className="tw:stroke-foreground/10"
          />
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="tw:stroke-current tw:transition-[stroke-dashoffset] tw:duration-700 tw:motion-reduce:transition-none"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamp(fraction, 0, 1))}
          />
        </svg>
      </button>
    </div>
  );
}

export function ComposerVoiceButton({
  active,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-label={active ? "Stop recording" : "Start voice input"}
      data-slot="composer-voice-button"
      className={cn(
        active
          ? cn(
              inkButton,
              "tw:flex tw:size-8 tw:items-center tw:justify-center tw:rounded-full",
            )
          : cn(ghostButton, "tw:size-8"),
        className,
      )}
      {...props}
    >
      {active ? (
        <SquareIcon className="tw:size-3 tw:fill-current" />
      ) : (
        <MicIcon className="tw:size-4" />
      )}
    </button>
  );
}

export function ComposerSend({
  streaming,
  idle,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  streaming: boolean;
  idle: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={streaming ? "Stop generating" : "Send message"}
      data-slot="composer-send"
      className={cn(
        "tw:grid tw:size-8 tw:place-items-center tw:rounded-full",
        streaming || !idle
          ? inkButton
          : "tw:bg-foreground/[0.06] tw:text-foreground/30 tw:dark:bg-foreground/[0.09] tw:transition-colors",
        className,
      )}
      {...props}
    >
      <ArrowUpIcon
        className={cn(iconSwap, "tw:size-4", streaming ? iconSwapOut : iconSwapIn)}
      />
      <SquareIcon
        className={cn(
          iconSwap,
          "tw:size-3 tw:fill-current",
          streaming ? iconSwapIn : iconSwapOut,
        )}
      />
    </button>
  );
}
