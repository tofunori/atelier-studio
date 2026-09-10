"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/assistant-ui/primitives/tooltip";
import { cn } from "@/lib/utils";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type FC,
  type ReactNode,
} from "react";

export type TokenUsage = {
  totalTokens?: number | undefined;
  inputTokens?: number | undefined;
  cachedInputTokens?: number | undefined;
  outputTokens?: number | undefined;
  reasoningTokens?: number | undefined;
};

const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1_000_000)
    return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (tokens >= 1_000)
    return `${(tokens / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${tokens}`;
};

const getUsagePercent = (
  totalTokens: number | undefined,
  modelContextWindow: number,
): number => {
  if (!totalTokens) return 0;
  return Math.min((totalTokens / modelContextWindow) * 100, 100);
};

type UsageSeverity = "normal" | "warning" | "critical";

const getUsageSeverity = (percent: number): UsageSeverity => {
  if (percent > 85) return "critical";
  if (percent >= 65) return "warning";
  return "normal";
};

const getStrokeColor = (percent: number): string => {
  const severity = getUsageSeverity(percent);
  if (severity === "critical") return "tw:stroke-red-500";
  if (severity === "warning") return "tw:stroke-amber-500";
  return "tw:stroke-foreground";
};

const getBarColor = (percent: number): string => {
  const severity = getUsageSeverity(percent);
  if (severity === "critical") return "tw:bg-red-500";
  if (severity === "warning") return "tw:bg-amber-500";
  return "tw:bg-foreground";
};

const getPercentColor = (percent: number): string => {
  const severity = getUsageSeverity(percent);
  if (severity === "critical") return "tw:text-red-500";
  if (severity === "warning") return "tw:text-amber-500";
  return "tw:text-muted-foreground";
};
type ContextDisplayContextValue = {
  usage: TokenUsage | undefined;
  totalTokens: number;
  percent: number;
  modelContextWindow: number;
};

const ContextDisplayContext = createContext<ContextDisplayContextValue | null>(
  null,
);

function useContextDisplay(): ContextDisplayContextValue {
  const ctx = useContext(ContextDisplayContext);
  if (!ctx) {
    throw new Error("ContextDisplay.* must be used within ContextDisplay.Root");
  }
  return ctx;
}
export type PresetProps = {
  modelContextWindow: number;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  usage?: TokenUsage | undefined;
  resetKey?: string | undefined;
};

export type ContextDisplayRootProps = {
  modelContextWindow: number;
  children: ReactNode;
  usage?: TokenUsage | undefined;
  resetKey?: string | undefined;
};

function ContextDisplayRoot({
  modelContextWindow,
  children,
  usage,
  resetKey,
}: ContextDisplayRootProps) {
  const rawTokens = usage?.totalTokens ?? 0;
  const [tokenState, setTokenState] = useState({
    resetKey,
    totalTokens: rawTokens > 0 ? rawTokens : 0,
    usage,
  });

  if (
    tokenState.resetKey !== resetKey ||
    (rawTokens > 0 && rawTokens !== tokenState.totalTokens) ||
    usage !== tokenState.usage
  ) {
    setTokenState((prev) => {
      if (prev.resetKey !== resetKey) {
        return {
          resetKey,
          totalTokens: rawTokens > 0 ? rawTokens : 0,
          usage,
        };
      }
      if (rawTokens > 0 && rawTokens !== prev.totalTokens) {
        return { ...prev, totalTokens: rawTokens, usage };
      }
      if (usage !== prev.usage) {
        return { ...prev, usage };
      }
      return prev;
    });
  }

  const current =
    tokenState.resetKey === resetKey
      ? tokenState
      : { totalTokens: rawTokens > 0 ? rawTokens : 0, usage };
  const totalTokens = current.totalTokens;
  const percent = getUsagePercent(totalTokens, modelContextWindow);
  const hasUsage = current.usage !== undefined || totalTokens > 0;

  const contextValue = useMemo(
    () => ({
      usage: current.usage,
      totalTokens,
      percent,
      modelContextWindow,
    }),
    [current.usage, totalTokens, percent, modelContextWindow],
  );

  if (!hasUsage) return null;

  return (
    <ContextDisplayContext.Provider value={contextValue}>
      <TooltipProvider>
        <Tooltip>{children}</Tooltip>
      </TooltipProvider>
    </ContextDisplayContext.Provider>
  );
}
function ContextDisplayTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <TooltipTrigger
      render={
        <button
          type="button"
          data-slot="context-display-trigger"
          className={cn(
            "tw:inline-flex tw:items-center tw:rounded-md tw:transition-colors",
            className,
          )}
          {...props}
        />
      }
    >
      {children}
    </TooltipTrigger>
  );
}

type ContextSegment = {
  label: string;
  tokens: number;
};

// Whether a provider counts cached tokens inside inputTokens, or reasoning
// inside outputTokens, differs by provider: OpenAI reports cached_tokens as a
// subset of prompt_tokens, while Anthropic documents input_tokens as excluding
// cache_read_input_tokens. Nothing in the usage contract says which is in hand,
// so these are reported as the counts they are and none of them is given a
// share of the bar, which stays the one reading that always holds: the
// provider's own total against the window.
const getContextSegments = (
  usage: TokenUsage | undefined,
): ContextSegment[] => {
  if (!usage) return [];
  return [
    { label: "Input", tokens: usage.inputTokens ?? 0 },
    { label: "Cached input", tokens: usage.cachedInputTokens ?? 0 },
    { label: "Output", tokens: usage.outputTokens ?? 0 },
    { label: "Reasoning", tokens: usage.reasoningTokens ?? 0 },
  ].filter((segment) => segment.tokens > 0);
};

function ContextDisplayContent({
  side = "top",
  className,
}: {
  side?: "top" | "bottom" | "left" | "right" | undefined;
  className?: string;
}) {
  const { usage, totalTokens, percent, modelContextWindow } =
    useContextDisplay();
  const segments = getContextSegments(usage);

  return (
    <TooltipContent
      side={side}
      sideOffset={8}
      data-slot="context-display-popover"
      className={cn(
        "tw:bg-popover tw:text-popover-foreground tw:block tw:w-56 border tw:p-3 tw:text-left tw:[&_[data-slot=tooltip-arrow]]:hidden",
        className,
      )}
    >
      <div className="tw:text-xs">
        <div className="tw:flex tw:items-baseline tw:justify-between tw:gap-6 tw:whitespace-nowrap">
          <span className={getPercentColor(percent)}>
            {Math.round(percent)}% full
          </span>
          <span className="tw:font-mono tw:tabular-nums">
            {formatTokenCount(Math.min(totalTokens, modelContextWindow))} /{" "}
            {formatTokenCount(modelContextWindow)}
          </span>
        </div>
        <div className="tw:bg-muted tw:mt-2.5 tw:h-1 tw:overflow-hidden tw:rounded-full">
          <div
            className={cn(
              "tw:h-full tw:w-(--usage-width) tw:rounded-full tw:transition-[width] tw:duration-300",
              totalTokens > 0 && "tw:min-w-1",
              getBarColor(percent),
            )}
            style={{ "--usage-width": `${percent}%` } as React.CSSProperties}
          />
        </div>
        {segments.length > 0 && (
          <div className="tw:mt-3 tw:grid tw:gap-1.5">
            {segments.map((segment) => (
              <div
                key={segment.label}
                className="tw:flex tw:items-baseline tw:justify-between tw:gap-6"
              >
                <span className="tw:text-muted-foreground">{segment.label}</span>
                <span className="tw:font-mono tw:tabular-nums">
                  {formatTokenCount(segment.tokens)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </TooltipContent>
  );
}

const RING_SIZE = 18;
const RING_STROKE = 2.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function RingVisual() {
  const { percent } = useContextDisplay();

  return (
    <svg
      aria-hidden="true"
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      className="tw:-rotate-90"
    >
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        strokeWidth={RING_STROKE}
        className="tw:stroke-muted"
      />
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={
          RING_CIRCUMFERENCE - (percent / 100) * RING_CIRCUMFERENCE
        }
        className={cn(
          "tw:transition-[stroke-dashoffset,stroke] tw:duration-300",
          getStrokeColor(percent),
        )}
      />
    </svg>
  );
}

function RingPercentLabel() {
  const { percent } = useContextDisplay();
  return <span className="tw:font-mono tw:tabular-nums">{Math.round(percent)}%</span>;
}
const ContextDisplayRing: FC<PresetProps> = ({
  modelContextWindow,
  className,
  side,
  usage,
  resetKey,
}) => (
  <ContextDisplayRoot
    modelContextWindow={modelContextWindow}
    usage={usage}
    resetKey={resetKey}
  >
    <ContextDisplayTrigger
      className={cn(
        "tw:text-muted-foreground tw:hover:text-foreground tw:gap-1.5 tw:px-1.5 tw:py-1 tw:text-xs",
        className,
      )}
      aria-label="Context usage"
    >
      <RingVisual />
      <RingPercentLabel />
    </ContextDisplayTrigger>
    <ContextDisplayContent side={side} />
  </ContextDisplayRoot>
);

function BarVisual() {
  const { percent, totalTokens } = useContextDisplay();

  return (
    <div className="tw:flex tw:items-center tw:gap-2">
      <div className="tw:bg-muted tw:h-1.5 tw:w-16 tw:overflow-hidden tw:rounded-full">
        <div
          className={cn(
            "tw:h-full tw:rounded-full tw:transition-all tw:duration-300",
            getBarColor(percent),
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="tw:text-muted-foreground tw:text-[10px] tw:tabular-nums">
        {formatTokenCount(totalTokens)} ({Math.round(percent)}%)
      </span>
    </div>
  );
}

const ContextDisplayBar: FC<PresetProps> = ({
  modelContextWindow,
  className,
  side,
  usage,
  resetKey,
}) => (
  <ContextDisplayRoot
    modelContextWindow={modelContextWindow}
    usage={usage}
    resetKey={resetKey}
  >
    <ContextDisplayTrigger
      className={cn("tw:px-2 tw:py-1", className)}
      aria-label="Context usage"
    >
      <BarVisual />
    </ContextDisplayTrigger>
    <ContextDisplayContent side={side} />
  </ContextDisplayRoot>
);

function TextVisual() {
  const { totalTokens, modelContextWindow } = useContextDisplay();

  return (
    <>
      {formatTokenCount(totalTokens)} / {formatTokenCount(modelContextWindow)}
    </>
  );
}

const ContextDisplayText: FC<PresetProps> = ({
  modelContextWindow,
  className,
  side,
  usage,
  resetKey,
}) => (
  <ContextDisplayRoot
    modelContextWindow={modelContextWindow}
    usage={usage}
    resetKey={resetKey}
  >
    <ContextDisplayTrigger
      aria-label="Context usage"
      className={cn(
        "tw:text-muted-foreground tw:hover:bg-accent tw:hover:text-accent-foreground tw:px-2 tw:py-1 tw:font-mono tw:text-xs tw:tabular-nums",
        className,
      )}
    >
      <TextVisual />
    </ContextDisplayTrigger>
    <ContextDisplayContent side={side} />
  </ContextDisplayRoot>
);

const ContextDisplay = {} as {
  Root: typeof ContextDisplayRoot;
  Trigger: typeof ContextDisplayTrigger;
  Content: typeof ContextDisplayContent;
  Ring: typeof ContextDisplayRing;
  Bar: typeof ContextDisplayBar;
  Text: typeof ContextDisplayText;
};

ContextDisplay.Root = ContextDisplayRoot;
ContextDisplay.Trigger = ContextDisplayTrigger;
ContextDisplay.Content = ContextDisplayContent;
ContextDisplay.Ring = ContextDisplayRing;
ContextDisplay.Bar = ContextDisplayBar;
ContextDisplay.Text = ContextDisplayText;

export {
  ContextDisplay,
  ContextDisplayRoot,
  ContextDisplayTrigger,
  ContextDisplayContent,
  ContextDisplayRing,
  ContextDisplayBar,
  ContextDisplayText,
};
