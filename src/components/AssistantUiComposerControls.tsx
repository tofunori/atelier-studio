"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/assistant-ui/primitives/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import {
  ContextDisplay,
  type TokenUsage,
} from "@/components/assistant-ui/elements/context-display";
import {
  PermissionGrant,
  type GrantScope,
} from "@/components/assistant-ui/elements/permission-grant";
import {
  PromptLibrary,
  type SavedPrompt,
} from "@/components/assistant-ui/elements/prompt-library";
import {
  ReasoningEffort,
  type EffortLevel,
} from "@/components/assistant-ui/elements/reasoning-effort";
import { cn } from "@/lib/utils";
import { codexSupportsFastMode } from "@/lib/modelCatalog";

/** The selection already owned by Chat and persisted by the host. */
export type AssistantUiComposerSelection = {
  provider: string;
  model: string;
  effort: string;
  permissionMode: string;
  fastMode: boolean;
};

/** The public usage shape passed by Chat. */
export type AssistantUiChatUsage = {
  context: number;
  output: number;
  cost: number | null;
  turns: number | null;
  window?: number | null;
};

/** A pending capability grant can be rendered by the official element. */
export type AssistantUiPermissionGrant = {
  capability: string;
  requester: string;
  reach: readonly string[];
  scope: GrantScope | "pending";
  onGrant?: (scope: GrantScope) => void;
};

/** Host-provided permission policy choices rendered by the shared Base UI Select. */
export type AssistantUiPermissionModeOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

/**
 * Capabilities that do not have an equivalent assistant-ui composer element.
 *
 * `PermissionGrant` is intentionally not used as a permission-mode picker:
 * Atelier's `bypassPermissions`/`acceptEdits`/`default`/`plan` values select
 * a turn policy, while `PermissionGrant` answers one pending capability
 * request. The controlled mode selector below uses the shared Base UI Select
 * primitive and leaves the option list and wire values to the host.
 */
export const ASSISTANT_UI_COMPOSER_LIMITATIONS = {
  permissionMode:
    "assistant-ui has no semantics-specific permission-mode element. This adapter uses the shared Base UI Select with host-provided options; PermissionGrant only answers a pending capability request.",
  effortSpent:
    "Chat usage does not expose provider reasoning-token consumption; pass reasoningSpent from a provider signal when available, otherwise the element marks usage unavailable without a progress meter.",
  contextWindow:
    "ContextDisplay requires a real model context window. The adapter renders it only when modelContextWindow or usage.window is supplied; it does not guess a window from the model id.",
} as const;

export type AssistantUiComposerControlsProps = Omit<
  ComponentProps<"div">,
  "children"
> & {
  /** Controlled Chat selection. This component never owns or persists it. */
  selection: AssistantUiComposerSelection;
  onSelectionChange: (next: AssistantUiComposerSelection) => void;

  /** Native ReasoningEffort props. Omit the panel when no provider levels exist. */
  effortLevels?: readonly EffortLevel[];
  /** Provider-reported reasoning-token usage. Omit when no truthful signal exists. */
  reasoningSpent?: number;

  /** Native ContextDisplay inputs. */
  usage?: AssistantUiChatUsage | null;
  modelContextWindow?: number | null;
  contextResetKey?: string;

  /** Native PromptLibrary inputs. Omit the panel when Chat has no prompt catalog. */
  prompts?: readonly SavedPrompt[];
  promptQuery?: string;
  selectedPromptId?: string;
  onPromptQueryChange?: (query: string) => void;
  onPromptSelect?: (id: string) => void;
  onPromptInsert?: (id: string) => void;

  /** Controlled permission policy options; values are sent unchanged by Chat. */
  permissionModes?: readonly AssistantUiPermissionModeOption[];
  permissionModeLabel?: string;
  permissionModeDisabled?: boolean;

  /**
   * Fast is a Codex service tier, not an effort. The host may pass the
   * catalog result explicitly; otherwise this uses the existing pure model
   * capability helper. `showFastMode` hides the control for other providers.
   */
  fastModeSupported?: boolean;
  showFastMode?: boolean;
  fastModeLabel?: string;
  fastModeUnsupportedLabel?: string;

  /** Optional official pending capability grant, separate from permissionMode. */
  permissionGrant?: AssistantUiPermissionGrant;
};

/**
 * Resolve Fast availability with the same provider/model rule as Chat's
 * submit path. An explicit catalog value wins so a live sidecar can override
 * the built-in compatibility list without this component inventing policy.
 */
export function assistantUiFastModeAvailable(
  selection: Pick<AssistantUiComposerSelection, "provider" | "model">,
  explicit?: boolean,
): boolean {
  if (explicit !== undefined) return explicit;
  return selection.provider === "codex" && codexSupportsFastMode(selection.model);
}

function toTokenUsage(usage: AssistantUiChatUsage): TokenUsage {
  // The Atelier `context` counter is the provider's total context usage. The
  // official element can still show provider output as a segment when it is
  // supplied, without presenting a homemade breakdown of the context count.
  return {
    totalTokens: usage.context,
    outputTokens: usage.output,
  };
}

export function AssistantUiComposerControls({
  selection,
  onSelectionChange,
  effortLevels,
  reasoningSpent,
  usage,
  modelContextWindow,
  contextResetKey,
  prompts,
  promptQuery = "",
  selectedPromptId = "",
  onPromptQueryChange,
  onPromptSelect,
  onPromptInsert,
  permissionModes,
  permissionModeLabel = "Permission mode",
  permissionModeDisabled,
  fastModeSupported,
  showFastMode,
  fastModeLabel = "Fast",
  fastModeUnsupportedLabel = "Fast is unavailable for this model",
  permissionGrant,
  className,
  ...props
}: AssistantUiComposerControlsProps) {
  const fastAvailable = assistantUiFastModeAvailable(
    selection,
    fastModeSupported,
  );
  const renderFast = showFastMode ?? selection.provider === "codex";
  const contextWindow = modelContextWindow ?? usage?.window ?? null;
  const tokenUsage = usage ? toTokenUsage(usage) : undefined;

  return (
    <div
      data-slot="assistant-ui-composer-controls"
      className={cn(
        "tw:flex tw:flex-wrap tw:items-center tw:gap-3",
        className,
      )}
      {...props}
    >
      {effortLevels && effortLevels.length > 1 && (
        <ReasoningEffort
          levels={effortLevels}
          selectedKey={selection.effort}
          spent={reasoningSpent}
          onSelect={(effort) =>
            onSelectionChange({ ...selection, effort })
          }
        />
      )}

      {contextWindow !== null && contextWindow > 0 && tokenUsage && (
        <ContextDisplay.Ring
          modelContextWindow={contextWindow}
          usage={tokenUsage}
          resetKey={contextResetKey}
        />
      )}

      {prompts !== undefined && (
        <PromptLibrary
          prompts={prompts}
          query={promptQuery}
          selectedId={selectedPromptId}
          onQueryChange={onPromptQueryChange}
          onSelect={onPromptSelect}
          onInsert={onPromptInsert}
        />
      )}

      {permissionModes && permissionModes.length > 0 && (
        <Select
          value={selection.permissionMode}
          items={permissionModes.map(({ value, label }) => ({ value, label }))}
          onValueChange={(permissionMode) => {
            if (typeof permissionMode !== "string") return;
            onSelectionChange({ ...selection, permissionMode });
          }}
          disabled={permissionModeDisabled}
        >
          <SelectTrigger
            size="sm"
            aria-label={permissionModeLabel}
            data-slot="assistant-ui-permission-mode"
          >
            <SelectValue placeholder={permissionModeLabel} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
            {permissionModes.map((mode) => (
              <SelectItem key={mode.value} value={mode.value} disabled={mode.disabled}>
                {mode.label}
              </SelectItem>
            ))}
          </SelectGroup>
          </SelectContent>
        </Select>
      )}

      {renderFast && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-slot="assistant-ui-fast-mode"
          aria-label={fastModeLabel}
          aria-pressed={selection.fastMode && fastAvailable}
          disabled={!fastAvailable}
          title={fastAvailable ? fastModeLabel : fastModeUnsupportedLabel}
          onClick={() => {
            if (!fastAvailable) return;
            onSelectionChange({
              ...selection,
              fastMode: !selection.fastMode,
            });
          }}
        >
          {fastModeLabel}
        </Button>
      )}

      {permissionGrant && <PermissionGrant {...permissionGrant} />}
    </div>
  );
}
