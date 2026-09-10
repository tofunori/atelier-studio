"use client";

import { useState, type ComponentProps } from "react";
import { AgentStatus, type AgentState } from "./assistant-ui/elements/agent-status";
import { Button } from "./assistant-ui/primitives/button";
import { Input } from "./assistant-ui/primitives/input";
import { cn } from "@/lib/utils";

export type AssistantUiGoalStatus =
  | "active"
  | "paused"
  | "blocked"
  | "usageLimited"
  | "budgetLimited"
  | "complete";

export type AssistantUiGoal = {
  objective: string;
  status: AssistantUiGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
};

export type AssistantUiGoalAction =
  | { action: "set"; objective: string; status?: "active" | "paused" }
  | { action: "clear" };

export type AssistantUiGoalControlsProps = Omit<ComponentProps<"div">, "children"> & {
  goal?: AssistantUiGoal | null;
  onGoal?: (action: "set" | "clear", objective?: string, status?: "active" | "paused") => void;
  disabled?: boolean;
  /** Initial value for the official input when no goal is currently active. */
  initialObjective?: string;
};

/**
 * The upstream assistant-ui catalogue has no Goal primitive. This adapter
 * composes the official AgentStatus, Input and Button elements while keeping
 * goal transport in Atelier's existing `onGoal` callback.
 */
export const ASSISTANT_UI_GOAL_LIMITATIONS = {
  upstream: "assistant-ui exposes no goal set/pause/clear element; this adapter only composes its official status/input/button primitives.",
  transport: "Goal persistence and session preflight remain host-owned through onGoal.",
} as const;

function stateForGoal(status: AssistantUiGoalStatus): AgentState {
  if (status === "active") return "working";
  if (status === "complete") return "done";
  return "waiting";
}

function statusLabel(status: AssistantUiGoalStatus): string {
  switch (status) {
    case "active": return "Actif";
    case "paused": return "En pause";
    case "blocked": return "Bloqué";
    case "usageLimited": return "Limite d’utilisation";
    case "budgetLimited": return "Limite de budget";
    case "complete": return "Terminé";
  }
}

export function AssistantUiGoalControls({
  goal,
  onGoal,
  disabled = false,
  initialObjective = "",
  className,
  ...props
}: AssistantUiGoalControlsProps) {
  const [objective, setObjective] = useState(initialObjective);
  const [error, setError] = useState<string | null>(null);
  const currentObjective = goal?.objective.trim() || "";
  const setGoal = () => {
    const next = objective.trim();
    if (!next) {
      setError("Saisis un objectif.");
      return;
    }
    setError(null);
    onGoal?.("set", next, "active");
    setObjective("");
  };
  const updateStatus = (status: "active" | "paused") => {
    if (!currentObjective) return;
    onGoal?.("set", currentObjective, status);
  };

  return (
    <div
      data-slot="assistant-ui-goal-controls"
      className={cn("tw:flex tw:flex-col tw:gap-2", className)}
      {...props}
    >
      {goal ? (
        <div className="tw:flex tw:flex-col tw:gap-2">
          <AgentStatus
            data-slot="assistant-ui-goal-status"
            state={stateForGoal(goal.status)}
            label={goal.objective}
          />
          <span className="tw:text-muted-foreground tw:text-xs" data-goal-status={goal.status}>
            {statusLabel(goal.status)}
          </span>
          <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
            {goal.status === "active" ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={disabled || !onGoal}
                onClick={() => updateStatus("paused")}
              >
                Pause
              </Button>
            ) : goal.status === "paused" ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={disabled || !onGoal}
                onClick={() => updateStatus("active")}
              >
                Reprendre
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={disabled || !onGoal}
              onClick={() => onGoal?.("clear")}
            >
              Retirer
            </Button>
          </div>
        </div>
      ) : (
        <div className="tw:flex tw:items-start tw:gap-1.5">
          <Input
            className="tw:min-w-0 tw:flex-1"
            value={objective}
            aria-label="Objectif"
            placeholder="Définir un objectif"
            disabled={disabled || !onGoal}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setObjective(event.currentTarget.value);
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setGoal();
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || !onGoal}
            onClick={setGoal}
          >
            Définir
          </Button>
        </div>
      )}
      {error ? <span role="alert" className="tw:text-destructive tw:text-xs">{error}</span> : null}
    </div>
  );
}

