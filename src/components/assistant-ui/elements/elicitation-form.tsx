// Official assistant-ui element source, adapted only with the Atelier tw: prefix.
"use client";

import type { ComponentProps, InputHTMLAttributes, ReactNode } from "react";
import { CheckIcon, PlugIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, inkButton, mono, paper } from "./surfaces";

export type ElicitationState = "request" | "accepted" | "declined";

export type ElicitationOption = string | { label: string; value?: string };

export interface ElicitationField {
  name: string;
  label: string;
  value: string;
  kind: "text" | "choice" | "toggle";
  /** Labels plus optional opaque values from the provider. */
  options?: readonly ElicitationOption[];
  required?: boolean;
  /** Optional input type for provider fields that carry a secret or URL. */
  inputType?: InputHTMLAttributes<HTMLInputElement>["type"];
  placeholder?: string;
}

const optionLabel = (option: ElicitationOption) =>
  typeof option === "string" ? option : option.label;

const optionValue = (option: ElicitationOption) =>
  typeof option === "string" ? option : option.value ?? option.label;

export function ElicitationForm({
  server,
  message,
  fields,
  state,
  onAccept,
  onDecline,
  onFieldChange,
  renderField,
  validationError,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "server"
  | "message"
  | "fields"
  | "state"
  | "onAccept"
  | "onDecline"
  | "onFieldChange"
  | "renderField"
  | "validationError"
> & {
  server: string;
  message: string;
  fields: readonly ElicitationField[];
  state: ElicitationState;
  onAccept?: () => void;
  onDecline?: () => void;
  /**
   * Optional controlled-field seam for the MCP elicitation adapter. When it
   * is absent the official read-only presentation is preserved.
   */
  onFieldChange?: (name: string, value: string) => void;
  /** Escape hatch for provider-specific field widgets; it does not replace
   * the surrounding assistant-ui card or action bar. */
  renderField?: (field: ElicitationField) => ReactNode;
  /** Optional host validation message announced before the action row. */
  validationError?: string;
}) {
  return (
    <div
      data-slot="elicitation-form"
      className={cn(
        paper,
        "tw:flex tw:w-full tw:max-w-sm tw:flex-col tw:gap-3.5 tw:rounded-[20px] tw:p-4",
        className,
      )}

      {...props}
    >
      <div className="tw:flex tw:items-center tw:gap-2.5">
        <span className="tw:bg-foreground/[0.05] tw:text-foreground/45 tw:flex tw:size-7 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg">
          <PlugIcon className="tw:size-3.5" />
        </span>
        <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-[13.5px] tw:font-medium">
          {server}
        </span>
        <span className={cn(mono, "tw:text-foreground/30 tw:shrink-0")}>
          needs input
        </span>
      </div>

      <p className="tw:text-foreground/55 tw:text-xs tw:leading-relaxed">{message}</p>

      <div className="tw:flex tw:flex-col tw:gap-2.5">
        {fields.map((item) => (
          <div key={item.name} className="tw:flex tw:flex-col tw:gap-1">
            <span className={cn(mono, "tw:text-foreground/35")}>
              {item.label}
              {item.required && <span className="tw:text-foreground/25"> *</span>}
            </span>
            {renderField ? (
              renderField(item)
            ) : item.kind === "choice" && onFieldChange ? (
              <select
                aria-label={item.label}
                value={item.value}
                onChange={(event) => onFieldChange(item.name, event.currentTarget.value)}
                className={cn(
                  field,
                  "tw:text-foreground/80 tw:rounded-lg tw:px-2.5 tw:py-1.5 tw:text-xs tw:outline-none",
                )}
              >
                {item.options?.map((option) => {
                  const value = optionValue(option);
                  return <option key={value} value={value}>{optionLabel(option)}</option>;
                })}
              </select>
            ) : item.kind === "toggle" && onFieldChange ? (
              <label className="tw:flex tw:items-center tw:gap-2 tw:text-xs">
                <input
                  type="checkbox"
                  aria-label={item.label}
                  checked={item.value === "true"}
                  onChange={(event) => onFieldChange(item.name, String(event.currentTarget.checked))}
                  className="tw:size-3.5"
                />
                <span className="tw:text-foreground/55">
                  {item.value === "true" ? "On" : "Off"}
                </span>
              </label>
            ) : item.kind === "text" && onFieldChange ? (
              <input
                type={item.inputType ?? "text"}
                aria-label={item.label}
                value={item.value}
                placeholder={item.placeholder}
                required={item.required}
                onChange={(event) => onFieldChange(item.name, event.currentTarget.value)}
                className={cn(
                  field,
                  "tw:text-foreground/80 tw:rounded-lg tw:px-2.5 tw:py-1.5 tw:text-xs tw:outline-none",
                )}
              />
            ) : item.kind === "choice" ? (
              <div className="tw:flex tw:flex-wrap tw:gap-1.5">
                {item.options?.map((option) => (
                  <span
                    key={optionValue(option)}
                    className={cn(
                      "tw:rounded-full tw:px-2.5 tw:py-1 tw:text-xs tw:transition-colors",
                      optionValue(option) === item.value
                        ? "tw:bg-foreground tw:text-background"
                        : cn(field, "tw:text-foreground/55"),
                    )}
                  >
                    {optionLabel(option)}
                  </span>
                ))}
              </div>
            ) : item.kind === "toggle" ? (
              <span className="tw:flex tw:items-center tw:gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "tw:flex tw:h-4 tw:w-7 tw:items-center tw:rounded-full tw:p-0.5 tw:transition-colors tw:duration-200",
                    item.value === "true"
                      ? "tw:bg-foreground/80"
                      : "tw:bg-foreground/15",
                  )}
                >
                  <span
                    className={cn(
                      "tw:bg-background tw:size-3 tw:rounded-full tw:transition-transform tw:duration-200 tw:motion-reduce:transition-none",
                      item.value === "true" && "tw:translate-x-3",
                    )}
                  />
                </span>
                <span className="tw:text-foreground/55 tw:text-xs">
                  {item.value === "true" ? "On" : "Off"}
                </span>
              </span>
            ) : (
              <span
                className={cn(
                  field,
                  "tw:text-foreground/80 tw:rounded-lg tw:px-2.5 tw:py-1.5 tw:text-xs",
                )}
              >
                {item.value}
              </span>
            )}
          </div>
        ))}
      </div>

      {validationError ? (
        <p role="alert" className="tw:text-destructive tw:text-xs" data-slot="elicitation-error">
          {validationError}
        </p>
      ) : null}

      <div className="tw:flex tw:h-8 tw:items-center tw:justify-end tw:gap-2">
        {state === "request" ? (
          <>
            <button
              type="button"
              onClick={onDecline}
              className="tw:text-foreground/55 tw:hover:bg-foreground/[0.06] tw:hover:text-foreground/90 tw:h-8 tw:rounded-full tw:px-3.5 tw:text-xs tw:font-medium tw:transition-[background-color,color,scale] tw:duration-150 tw:active:scale-[0.96]"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={onAccept}
              className={cn(
                inkButton,
                "tw:flex tw:h-8 tw:items-center tw:rounded-full tw:px-3.5 tw:text-xs tw:font-medium",
              )}
            >
              Send
            </button>
          </>
        ) : (
          <span
            key={state}
            className="tw:fade-in tw:animate-in tw:text-foreground/55 tw:flex tw:items-center tw:gap-2 tw:text-xs tw:duration-300"
          >
            {state === "accepted" ? (
              <>
                <CheckIcon className="tw:size-3.5 tw:text-emerald-500" />
                Sent to {server}
              </>
            ) : (
              <>
                <XIcon className="tw:text-foreground/45 tw:size-3.5" />
                Declined
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
