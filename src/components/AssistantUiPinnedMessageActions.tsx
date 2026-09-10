"use client";

import type { ComponentProps } from "react";
import { useState } from "react";
import { PinIcon, Settings2Icon } from "lucide-react";
import type { Pin } from "../lib/pins";
import { cn } from "../lib/utils";
import { TooltipIconButton } from "./assistant-ui/elements/tooltip-icon-button";
import { Button } from "./assistant-ui/primitives/button";
import { Input } from "./assistant-ui/primitives/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./assistant-ui/primitives/popover";

const PIN_LABEL_LIMIT = 120;

/** The persisted Pin contract used by the host's style callback. */
export type AssistantUiPinStyle = {
  label?: string;
  color?: string;
  style?: string;
};

export type AssistantUiPinnedMessageActionsProps = Omit<
  ComponentProps<"div">,
  "children"
> & {
  sourceIndex: number | null | undefined;
  text: string;
  pins: readonly Pin[];
  onTogglePin: (index: number, label: string) => void;
  onStylePin: (index: number, patch: AssistantUiPinStyle) => void;
};

/** Keep the same plain-text anchor shape as the old timeline pin action. */
export function derivePinLabel(text: string): string {
  const normalized = text
    .replace(/[#*>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, 80) || "Chapitre";
}

export function isValidPinLabel(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= PIN_LABEL_LIMIT;
}

const trimForStorage = (value: string, limit: number) => value.trim().slice(0, limit);

/**
 * Native assistant-ui actions for a message's chapter pin.  The host remains
 * the source of truth: this component only derives the active pin and forwards
 * the two existing callbacks.
 */
export function AssistantUiPinnedMessageActions({
  sourceIndex,
  text,
  pins,
  onTogglePin,
  onStylePin,
  className,
  ...props
}: AssistantUiPinnedMessageActionsProps) {
  const pin = sourceIndex == null
    ? undefined
    : pins.find((candidate) => candidate.index === sourceIndex);
  const pinned = pin != null;
  const fallbackLabel = derivePinLabel(text);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");

  if (sourceIndex == null) return null;

  const beginEdit = (nextOpen: boolean) => {
    if (nextOpen && pin) {
      setLabel(pin.label);
    }
    setOpen(nextOpen);
  };

  const save = () => {
    if (!pin) return;
    const patch: AssistantUiPinStyle = {};
    const nextLabel = trimForStorage(label, PIN_LABEL_LIMIT);

    if (isValidPinLabel(nextLabel) && nextLabel !== pin.label) {
      patch.label = nextLabel;
    }

    if (Object.keys(patch).length > 0) {
      onStylePin(sourceIndex, patch);
    }
    setOpen(false);
  };

  return (
    <div
      data-slot="assistant-ui-pinned-message-actions"
      data-pinned={pinned ? "true" : "false"}
      className={cn("tw:flex tw:items-center tw:gap-0.5", className)}
      {...props}
    >
      <TooltipIconButton
        tooltip={pinned ? "Désépingler le chapitre" : "Épingler comme chapitre"}
        aria-label={pinned ? "Désépingler le chapitre" : "Épingler comme chapitre"}
        aria-pressed={pinned}
        data-pinned={pinned ? "true" : "false"}
        variant={pinned ? "secondary" : "ghost"}
        onClick={() => onTogglePin(sourceIndex, pin?.label || fallbackLabel)}
      >
        <PinIcon fill={pinned ? "currentColor" : "none"} />
      </TooltipIconButton>

      {pinned ? (
        <Popover open={open} onOpenChange={beginEdit}>
          <PopoverTrigger
            render={
              <TooltipIconButton
                tooltip="Modifier l’épingle"
                aria-label="Modifier l’épingle"
                aria-haspopup="dialog"
              />
            }
          >
            <Settings2Icon />
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" className="tw:w-80">
            <PopoverHeader>
              <PopoverTitle>Modifier l’épingle</PopoverTitle>
            </PopoverHeader>
            <div className="tw:flex tw:flex-col tw:gap-2">
              <label className="tw:flex tw:flex-col tw:gap-1 tw:text-xs tw:text-muted-foreground">
                Libellé
                <Input
                  aria-label="Libellé de l’épingle"
                  value={label}
                  maxLength={PIN_LABEL_LIMIT}
                  onChange={(event) => setLabel(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      save();
                    }
                  }}
                />
              </label>
              <div className="tw:flex tw:justify-end tw:gap-1.5 tw:pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onTogglePin(sourceIndex, pin.label);
                    setOpen(false);
                  }}
                >
                  Désépingler
                </Button>
                <Button type="button" size="sm" onClick={save}>
                  Enregistrer
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
