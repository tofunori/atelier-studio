import { useCallback, useEffect, useState } from "react";
import type { AgentEvent } from "../../lib/ws";
import type { ReviewState } from "./turns";

type Review = NonNullable<ReviewState> & {
  threadId: string;
  turnId: string;
  reviewId: string;
  createdAt?: string;
  updatedAt?: string;
  checks?: number;
  checkedTools?: string[];
  checkedFiles?: string[];
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

// Normalize the wire contract once; never pass an unvalidated error object to React.
function decode(value: unknown): Review | null {
  const msg = object(value);
  if (!msg || typeof msg.threadId !== "string" || typeof msg.turnId !== "string"
      || !msg.turnId || (msg.status !== "running" && msg.status !== "done")) return null;
  const text = (key: string) => typeof msg[key] === "string" ? msg[key] as string : undefined;
  const verdict = text("verdict");
  const error = object(msg.error);
  return {
    threadId: msg.threadId, turnId: msg.turnId,
    // Older projections with a known turn remain attributable; no turn is invented.
    reviewId: text("reviewId") ?? `legacy:${msg.turnId}`,
    status: msg.status,
    verdict: verdict === "unparseable" || verdict === "unavailable"
      || (verdict === "ok" && !text("reviewId")) ? "inconclusive" : verdict,
    mode: text("mode"), text: text("text"),
    error: text("error") ?? (typeof error?.message === "string" ? error.message : undefined),
    outcome: text("outcome"), coverage: text("coverage"), executionStatus: text("executionStatus"),
    createdAt: text("createdAt"), updatedAt: text("updatedAt"),
    checks: typeof msg.checks === "number" ? msg.checks : undefined,
    checkedTools: strings(msg.checkedTools), checkedFiles: strings(msg.checkedFiles),
    issues: Array.isArray(msg.issues) ? msg.issues.flatMap((item) => {
      const issue = object(item);
      if (!issue || typeof issue.claim !== "string" || typeof issue.problem !== "string"
          || typeof issue.severity !== "string") return [];
      return [{ claim: issue.claim, problem: issue.problem, severity: issue.severity,
        fix: typeof issue.fix === "string" ? issue.fix : undefined }];
    }) : undefined,
  };
}

const identity = (review: Review) => JSON.stringify([review.threadId, review.turnId, review.reviewId]);

function merge(previous: Review[], incoming: Review[]): Review[] {
  const byId = new Map(previous.map((review) => [identity(review), review]));
  for (const review of incoming) {
    const key = identity(review);
    const old = byId.get(key);
    // A delayed list/running notification must not undo a terminal update.
    if (old && ((old.status === "done" && review.status === "running")
        || (old.updatedAt && review.updatedAt && old.updatedAt > review.updatedAt))) continue;
    byId.set(key, review);
  }
  const keys = [...new Set([...incoming.map(identity), ...previous.map(identity)])];
  return keys.map((key) => byId.get(key)!).sort((a, b) => {
    if (a.createdAt && b.createdAt) {
      return b.createdAt.localeCompare(a.createdAt) || b.reviewId.localeCompare(a.reviewId);
    }
    // Without timestamps, preserve the server's descending order.
    return 0;
  });
}

export function useReviews(threadId: string | null, events: AgentEvent[]) {
  const [records, setRecords] = useState<Review[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const accept = (values: unknown[]) => {
      const incoming = values.map(decode).filter((review): review is Review => review !== null && review.threadId === threadId);
      if (incoming.length) setRecords((previous) => merge(previous, incoming));
    };
    const onReview = (event: Event) => accept([(event as CustomEvent).detail]);
    const onList = (event: Event) => {
      const msg = object((event as CustomEvent).detail);
      if (msg?.threadId === threadId && Array.isArray(msg.reviews)) accept(msg.reviews);
    };
    window.addEventListener("review-result", onReview);
    window.addEventListener("reviews-list", onList);
    return () => {
      window.removeEventListener("review-result", onReview);
      window.removeEventListener("reviews-list", onList);
    };
  }, [threadId]);

  // Include the active turn: the previous verdict disappears as soon as a new turn starts.
  let turnId: string | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const meta = events[i].meta;
    const id = meta && "turnId" in meta ? meta.turnId : undefined;
    if (typeof id === "string" && id) { turnId = id; break; }
    if (events[i].kind === "user") break;
  }
  const latest = records.find((review) => review.threadId === threadId && review.turnId === turnId);
  const review = latest && !dismissed.has(identity(latest)) ? latest : null;
  const dismiss = useCallback(() => {
    if (latest) setDismissed((previous) => new Set([...previous, identity(latest)]));
  }, [latest]);
  return { review, dismiss };
}
