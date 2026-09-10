"use client";

import { memo, type ComponentProps, type FC } from "react";
import type { QuoteMessagePartComponent } from "@assistant-ui/react";
import {
  ComposerPrimitive,
  SelectionToolbarPrimitive,
} from "@assistant-ui/react";
import { QuoteIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function QuoteBlockRoot({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="quote-block"
      className={cn("tw:mb-2 tw:flex tw:items-start tw:gap-1.5", className)}
      {...props}
    />
  );
}

function QuoteBlockIcon({
  className,
  ...props
}: ComponentProps<typeof QuoteIcon>) {
  return (
    <QuoteIcon
      data-slot="quote-block-icon"
      className={cn(
        "tw:text-muted-foreground/60 tw:mt-0.5 tw:size-3 tw:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function QuoteBlockText({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="quote-block-text"
      className={cn(
        "tw:text-muted-foreground/80 tw:line-clamp-2 tw:min-w-0 tw:text-sm tw:italic",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Renders quoted text in user messages.
 *
 * Pass this to `MessagePrimitive.Parts` as the `Quote` renderer.
 *
 * @example
 * ```tsx
 * <MessagePrimitive.Quote>
 *   {(quote) => <QuoteBlock {...quote} />}
 * </MessagePrimitive.Quote>
 * ```
 */
const QuoteBlockImpl: QuoteMessagePartComponent = ({ text }) => {
  return (
    <QuoteBlockRoot>
      <QuoteBlockIcon />
      <QuoteBlockText>{text}</QuoteBlockText>
    </QuoteBlockRoot>
  );
};

const QuoteBlock = memo(
  QuoteBlockImpl,
) as unknown as QuoteMessagePartComponent & {
  Root: typeof QuoteBlockRoot;
  Icon: typeof QuoteBlockIcon;
  Text: typeof QuoteBlockText;
};

QuoteBlock.displayName = "QuoteBlock";
QuoteBlock.Root = QuoteBlockRoot;
QuoteBlock.Icon = QuoteBlockIcon;
QuoteBlock.Text = QuoteBlockText;

function SelectionToolbarRoot({
  className,
  ...props
}: ComponentProps<typeof SelectionToolbarPrimitive.Root>) {
  return (
    <SelectionToolbarPrimitive.Root
      data-slot="selection-toolbar"
      data-assistant-ui-portal="selection-toolbar"
      className={cn(
        "tw:bg-popover tw:flex tw:items-center tw:gap-1 tw:rounded-lg tw:border tw:px-1 tw:py-1",
        className,
      )}
      {...props}
    />
  );
}

function SelectionToolbarQuote({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectionToolbarPrimitive.Quote>) {
  return (
    <SelectionToolbarPrimitive.Quote
      data-slot="selection-toolbar-quote"
      className={cn(
        "tw:text-popover-foreground tw:hover:bg-accent tw:flex tw:items-center tw:gap-1.5 tw:rounded-md tw:px-2.5 tw:py-1 tw:text-sm tw:transition-colors",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <QuoteIcon className="tw:size-3.5" />
          Quote
        </>
      )}
    </SelectionToolbarPrimitive.Quote>
  );
}

/**
 * Floating toolbar that appears when text is selected in a message.
 *
 * Render anywhere inside `ThreadPrimitive.Root` (or any `AssistantRuntimeProvider` scope).
 *
 * @example
 * ```tsx
 * <ThreadPrimitive.Root>
 *   <ThreadPrimitive.Viewport>...</ThreadPrimitive.Viewport>
 *   <SelectionToolbar />
 * </ThreadPrimitive.Root>
 * ```
 */
const SelectionToolbarImpl: FC<ComponentProps<typeof SelectionToolbarRoot>> = ({
  className,
  ...props
}) => {
  return (
    <SelectionToolbarRoot className={className} {...props}>
      <SelectionToolbarQuote />
    </SelectionToolbarRoot>
  );
};

const SelectionToolbar = memo(
  SelectionToolbarImpl,
) as unknown as typeof SelectionToolbarImpl & {
  Root: typeof SelectionToolbarRoot;
  Quote: typeof SelectionToolbarQuote;
};

SelectionToolbar.displayName = "SelectionToolbar";
SelectionToolbar.Root = SelectionToolbarRoot;
SelectionToolbar.Quote = SelectionToolbarQuote;

function ComposerQuotePreviewRoot({
  className,
  ...props
}: ComponentProps<typeof ComposerPrimitive.Quote>) {
  return (
    <ComposerPrimitive.Quote
      data-slot="composer-quote"
      className={cn(
        "tw:bg-muted/60 tw:mx-3 tw:mt-2 tw:flex tw:items-start tw:gap-2 tw:rounded-lg tw:px-3 tw:py-2",
        className,
      )}
      {...props}
    />
  );
}

function ComposerQuotePreviewIcon({
  className,
  ...props
}: ComponentProps<typeof QuoteIcon>) {
  return (
    <QuoteIcon
      data-slot="composer-quote-icon"
      className={cn(
        "tw:text-muted-foreground/70 tw:mt-0.5 tw:size-3.5 tw:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function ComposerQuotePreviewText({
  className,
  ...props
}: ComponentProps<typeof ComposerPrimitive.QuoteText>) {
  return (
    <ComposerPrimitive.QuoteText
      data-slot="composer-quote-text"
      className={cn(
        "tw:text-muted-foreground tw:line-clamp-2 tw:min-w-0 tw:flex-1 tw:text-sm",
        className,
      )}
      {...props}
    />
  );
}

function ComposerQuotePreviewDismiss({
  className,
  children,
  ...props
}: ComponentProps<typeof ComposerPrimitive.QuoteDismiss>) {
  const defaultClassName =
    "tw:shrink-0 tw:rounded-sm tw:p-0.5 tw:text-muted-foreground/70 tw:transition-colors tw:hover:bg-accent tw:hover:text-foreground";

  return (
    <ComposerPrimitive.QuoteDismiss
      data-slot="composer-quote-dismiss"
      asChild
      className={children ? className : undefined}
      {...props}
    >
      {children ?? (
        <button
          type="button"
          aria-label="Dismiss quote"
          className={cn(defaultClassName, className)}
        >
          <XIcon className="tw:size-3.5" />
        </button>
      )}
    </ComposerPrimitive.QuoteDismiss>
  );
}

/**
 * Quote preview inside the composer. Only renders when a quote is set.
 *
 * Place inside `ComposerPrimitive.Root`.
 *
 * @example
 * ```tsx
 * <ComposerPrimitive.Root>
 *   <ComposerQuotePreview />
 *   <ComposerPrimitive.Input />
 *   <ComposerPrimitive.Send />
 * </ComposerPrimitive.Root>
 * ```
 */
const ComposerQuotePreviewImpl: FC<
  ComponentProps<typeof ComposerQuotePreviewRoot>
> = ({ className, ...props }) => {
  return (
    <ComposerQuotePreviewRoot className={className} {...props}>
      <ComposerQuotePreviewIcon />
      <ComposerQuotePreviewText />
      <ComposerQuotePreviewDismiss />
    </ComposerQuotePreviewRoot>
  );
};

const ComposerQuotePreview = memo(
  ComposerQuotePreviewImpl,
) as unknown as typeof ComposerQuotePreviewImpl & {
  Root: typeof ComposerQuotePreviewRoot;
  Icon: typeof ComposerQuotePreviewIcon;
  Text: typeof ComposerQuotePreviewText;
  Dismiss: typeof ComposerQuotePreviewDismiss;
};

ComposerQuotePreview.displayName = "ComposerQuotePreview";
ComposerQuotePreview.Root = ComposerQuotePreviewRoot;
ComposerQuotePreview.Icon = ComposerQuotePreviewIcon;
ComposerQuotePreview.Text = ComposerQuotePreviewText;
ComposerQuotePreview.Dismiss = ComposerQuotePreviewDismiss;

export {
  QuoteBlock,
  QuoteBlockRoot,
  QuoteBlockIcon,
  QuoteBlockText,
  SelectionToolbar,
  SelectionToolbarRoot,
  SelectionToolbarQuote,
  ComposerQuotePreview,
  ComposerQuotePreviewRoot,
  ComposerQuotePreviewIcon,
  ComposerQuotePreviewText,
  ComposerQuotePreviewDismiss,
};
