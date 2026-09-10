import type { AppendMessage, ExternalThreadQueueAdapter } from "@assistant-ui/react";
import type { QueuedTurn } from "../chatDraftStore";

/** Retain Atelier's durable queue while exposing assistant-ui's queue contract. */
export function createAtelierQueueAdapter(options: {
  items: readonly QueuedTurn[];
  submit: (message: AppendMessage, mode: "queue" | "steer") => void;
  mode: "queue" | "steer";
  remove?: (id: string) => void;
  steer?: (id: string) => void;
  reorder?: (id: string, target: string) => void;
  edit?: (id: string) => void;
}): ExternalThreadQueueAdapter {
  return {
    items: options.items.map(item => ({ id: item.id, prompt: item.prompt,
      parts: [{ type: "text" as const, text: item.prompt }] })),
    steerItems: [],
    enqueue: message => options.submit(message, "queue"),
    // The native follow-up preference is authoritative; assistant-ui routes
    // active sends here even when the user selected the queue lane.
    steer: message => options.submit(message, options.mode),
    remove: id => options.remove?.(id),
    edit: id => options.edit?.(id),
    move: (id, placement) => {
      if (placement.lane === "steer" && !placement.insertBefore && !placement.insertAfter) {
        options.steer?.(id);
        return;
      }
      const remaining = options.items.filter(item => item.id !== id);
      const before = placement.insertBefore;
      const after = placement.insertAfter;
      const anchor = before ?? after;
      if (!anchor) return;
      const at = remaining.findIndex(item => item.id === anchor);
      if (at < 0) return;
      const destination = at + (before ? 0 : 1);
      // Atelier's reorder callback inserts at the target's original index.
      const target = options.items[destination];
      if (target) options.reorder?.(id, target.id);
    },
  };
}
