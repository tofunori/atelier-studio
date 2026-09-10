"use client";

import {
  createContext,
  useContext,
  type PropsWithChildren,
  useState,
  type FC,
  isValidElement,
} from "react";
import {
  XIcon,
  PlusIcon,
  FileText,
  Loader2Icon,
  AlertCircleIcon,
} from "lucide-react";
import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAuiState,
  useAui,
} from "@assistant-ui/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/assistant-ui/primitives/tooltip";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogTrigger,
} from "@/components/assistant-ui/primitives/dialog";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/assistant-ui/primitives/avatar";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { useAttachmentSrc } from "@/hooks/use-attachment-src";
import { cn } from "@/lib/utils";

type AttachmentPreviewProps = {
  src: string;
};

/**
 * The assistant-ui adapter owns pending uploads. Restored complete
 * attachments can be inserted with `composer.addAttachment` and therefore do
 * not pass through that adapter's remove method; the host uses this seam to
 * remove the corresponding Atelier draft by its stable attachment id.
 */
export type AttachmentRemovalContextValue = {
  onRemoveAttachment?: (id: string) => void | Promise<void>;
};

export const AttachmentRemovalContext =
  createContext<AttachmentRemovalContextValue>({});

const AttachmentPreview: FC<AttachmentPreviewProps> = ({ src }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <img
      src={src}
      alt="Attachment preview"
      className={cn(
        "tw:block tw:h-auto tw:max-h-[80vh] tw:w-auto tw:max-w-full tw:rounded-sm tw:object-contain tw:transition-opacity tw:duration-300 tw:motion-reduce:transition-none",
        isLoaded
          ? "aui-attachment-preview-image-loaded tw:opacity-100"
          : "aui-attachment-preview-image-loading tw:opacity-0",
      )}
      onLoad={() => setIsLoaded(true)}
    />
  );
};

const AttachmentPreviewDialog: FC<PropsWithChildren> = ({ children }) => {
  const src = useAttachmentSrc();

  if (!src) return children;

  return (
    <Dialog>
      <DialogTrigger
        className="aui-attachment-preview-trigger tw:cursor-zoom-in"
      >
        {isValidElement(children) ? (
          children
        ) : (
          <button type="button">{children}</button>
        )}
      </DialogTrigger>
      <DialogContent className="aui-attachment-preview-dialog-content tw:[&>button]:bg-foreground/60 tw:[&>button]:hover:bg-foreground/80 tw:[&_svg]:text-background tw:p-2 tw:sm:max-w-3xl tw:[&>button]:rounded-full tw:[&>button]:p-1 tw:[&>button]:opacity-100 tw:[&>button]:ring-0!">
        <DialogTitle className="aui-sr-only tw:sr-only">
          Image Attachment Preview
        </DialogTitle>
        <div className="aui-attachment-preview tw:bg-background tw:relative tw:mx-auto tw:flex tw:max-h-[80dvh] tw:w-full tw:items-center tw:justify-center tw:overflow-hidden tw:rounded-sm">
          <AttachmentPreview src={src} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AttachmentThumb: FC = () => {
  const src = useAttachmentSrc();

  return (
    <Avatar className="aui-attachment-tile-avatar tw:h-full tw:w-full tw:rounded-none">
      <AvatarImage
        src={src}
        alt="Attachment preview"
        className="aui-attachment-tile-image tw:rounded-none tw:object-cover"
      />
      <AvatarFallback>
        <FileText className="aui-attachment-tile-fallback-icon tw:text-muted-foreground/80 tw:size-6 tw:stroke-[1.5]" />
      </AvatarFallback>
    </Avatar>
  );
};

const AttachmentUI: FC = () => {
  const aui = useAui();
  const isComposer = aui.attachment.source !== "message";

  const isImage = useAuiState((s) => s.attachment.type === "image");
  const typeLabel = useAuiState((s) => {
    const type = s.attachment.type;
    switch (type) {
      case "image":
        return "Image";
      case "document":
        return "Document";
      case "file":
        return "File";
      default:
        return type;
    }
  });

  const uploadState = useAuiState((s) =>
    s.attachment.status.type === "running"
      ? "uploading"
      : s.attachment.status.type === "incomplete" &&
          s.attachment.status.reason === "error"
        ? "error"
        : undefined,
  );
  const isUploading = uploadState === "uploading";
  const isError = uploadState === "error";

  const errorMessage = useAuiState((s) =>
    s.attachment.status.type === "incomplete" &&
    s.attachment.status.reason === "error"
      ? (s.attachment.status.message ?? "Upload failed")
      : undefined,
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <AttachmentPrimitive.Root
          className={cn(
            "aui-attachment-root tw:relative",
            isComposer &&
              "tw:animate-in tw:fade-in-0 tw:zoom-in-95 tw:duration-200 tw:motion-reduce:animate-none",
            isImage &&
              !isComposer &&
              "aui-attachment-root-message tw:only:*:first:size-24",
          )}
        >
          <AttachmentPreviewDialog>
            <TooltipTrigger render={<div className={cn(
                                        "aui-attachment-tile tw:bg-muted tw:hover:after:bg-foreground/10 tw:focus-visible:ring-ring/50 tw:relative tw:size-14 tw:cursor-pointer tw:overflow-hidden tw:rounded-[calc(var(--composer-radius,1.5rem)-var(--composer-padding,8px))] tw:transition-transform tw:outline-none tw:after:pointer-events-none tw:after:absolute tw:after:inset-0 tw:after:rounded-[inherit] tw:after:ring-1 tw:after:ring-black/10 tw:after:transition-colors tw:after:ring-inset tw:focus-visible:ring-1 tw:active:scale-[0.96] tw:motion-reduce:transition-none tw:dark:after:ring-white/10",
                                        isError &&
                                          "tw:after:ring-destructive/60 tw:dark:after:ring-destructive/60",
                                      )} role="button" tabIndex={0} onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          e.currentTarget.click();
                                        } else if (e.key === " ") {
                                          e.preventDefault();
                                        }
                                      }} onKeyUp={(e) => {
                                        if (e.key === " ") e.currentTarget.click();
                                      }} aria-label={`${typeLabel} attachment${
                                        isError ? ", upload failed" : isUploading ? ", uploading" : ""
                                      }`} />}><AttachmentThumb />{isUploading && (
                                        <div
                                          aria-hidden="true"
                                          className="aui-attachment-tile-uploading tw:bg-background/60 tw:animate-in tw:fade-in-0 tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:backdrop-blur-[2px] tw:motion-reduce:animate-none"
                                        >
                                          <Loader2Icon className="tw:text-muted-foreground tw:size-4 tw:animate-spin" />
                                        </div>
                                      )}{isError && (
                                        <div
                                          aria-hidden="true"
                                          className="aui-attachment-tile-error tw:bg-background/70 tw:animate-in tw:fade-in-0 tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:backdrop-blur-[2px] tw:motion-reduce:animate-none"
                                        >
                                          <AlertCircleIcon className="tw:text-destructive tw:size-4" />
                                        </div>
                                      )}</TooltipTrigger>
          </AttachmentPreviewDialog>
          {isComposer && <AttachmentRemove />}
        </AttachmentPrimitive.Root>
        <TooltipContent side="top">
          <AttachmentPrimitive.Name />
          {errorMessage && (
            <p className="aui-attachment-error-message">{errorMessage}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const AttachmentRemove: FC = () => {
  const { onRemoveAttachment } = useContext(AttachmentRemovalContext);
  const attachmentId = useAuiState((s) => s.attachment.id);
  const isComplete = useAuiState((s) => s.attachment.status.type === "complete");

  return (
    <AttachmentPrimitive.Remove render={<TooltipIconButton tooltip="Remove file" onClick={() => {
      if (isComplete) void onRemoveAttachment?.(attachmentId);
    }} className="aui-attachment-tile-remove tw:absolute tw:end-1 tw:top-1 tw:size-5 tw:rounded-full tw:bg-black/50! tw:text-white tw:after:absolute tw:after:-inset-1.5 tw:hover:bg-black/70! tw:hover:text-white! tw:active:scale-[0.96] tw:motion-reduce:transition-none" side="top" />}><XIcon className="aui-attachment-remove-icon tw:size-3 tw:stroke-[2.5]" /></AttachmentPrimitive.Remove>
  );
};

export const UserMessageAttachments: FC = () => {
  return (
    <div className="aui-user-message-attachments-end tw:col-span-full tw:col-start-1 tw:row-start-1 tw:flex tw:w-full tw:flex-row tw:justify-end tw:gap-2">
      <MessagePrimitive.Attachments>
        {() => <AttachmentUI />}
      </MessagePrimitive.Attachments>
    </div>
  );
};

export const ComposerAttachments: FC = () => {
  return (
    <div className="aui-composer-attachments tw:flex tw:w-full tw:flex-row tw:items-center tw:gap-2 tw:overflow-x-auto tw:empty:hidden">
      <ComposerPrimitive.Attachments>
        {() => <AttachmentUI />}
      </ComposerPrimitive.Attachments>
    </div>
  );
};

export const ComposerAddAttachment: FC = () => {
  return (
    <ComposerPrimitive.AddAttachment render={<TooltipIconButton tooltip="Add Attachment" side="bottom" variant="ghost" size="icon" className="aui-composer-add-attachment tw:text-muted-foreground tw:hover:text-foreground tw:hover:bg-muted-foreground/15 tw:dark:border-muted-foreground/15 tw:dark:hover:bg-muted-foreground/30 tw:size-7 tw:rounded-full tw:active:scale-[0.96] tw:motion-reduce:transition-none" aria-label="Add Attachment" />}><PlusIcon className="aui-attachment-add-icon tw:size-4" /></ComposerPrimitive.AddAttachment>
  );
};
