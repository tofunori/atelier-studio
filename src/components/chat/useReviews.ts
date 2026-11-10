import { useCallback, useEffect, useMemo, useState } from "react";

/** Une affirmation relue : la phrase citée, son issue et sa preuve. */
export type ReviewClaim = {
  id: string;
  claim: string;
  /** `passed`, `failed` ou `inconclusive` */
  outcome: string;
  /** famille (`number`, `computed`, `citation`, `figure`, `conclusion`) */
  category?: string;
  proof?: string;
  evidenceIds: string[];
  /** cellule du noyau qui sert de preuve */
  cell?: number;
};

export type Review = {
  threadId: string;
  turnId: string;
  reviewId: string;
  status: string;
  verdict?: string;
  mode?: string;
  text?: string | null;
  error?: string;
  outcome?: string | null;
  coverage?: string;
  executionStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  issues?: { claim: string; problem: string; severity: string; fix?: string }[];
  /** une entrée par affirmation, vérifiées comprises (absent : ancien serveur) */
  claims?: ReviewClaim[];
  limitations?: string[];
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
  const issues = Array.isArray(msg.issues) ? msg.issues.flatMap((item) => {
    const issue = object(item);
    if (!issue || typeof issue.claim !== "string" || typeof issue.problem !== "string"
        || typeof issue.severity !== "string") return [];
    return [{ claim: issue.claim, problem: issue.problem, severity: issue.severity,
      fix: typeof issue.fix === "string" ? issue.fix : undefined }];
  }) : undefined;
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
    limitations: strings(msg.limitations),
    issues,
    claims: Array.isArray(msg.claims) ? msg.claims.flatMap((item) => {
      const claim = object(item);
      if (!claim || typeof claim.id !== "string" || typeof claim.claim !== "string"
          || typeof claim.outcome !== "string") return [];
      return [{ id: claim.id, claim: claim.claim, outcome: claim.outcome,
        category: typeof claim.category === "string" ? claim.category : undefined,
        proof: typeof claim.proof === "string" ? claim.proof : undefined,
        evidenceIds: strings(claim.evidenceIds) ?? [],
        cell: typeof claim.cell === "number" ? claim.cell : undefined }];
    // Ancien serveur : seuls les problèmes sont connus, chacun devient une rangée.
    }) : issues?.map((issue, index) => ({ id: `issue-${index}`, claim: issue.claim, outcome: "failed",
      proof: issue.fix ? `${issue.problem} → ${issue.fix}` : issue.problem, evidenceIds: [] })),
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

/** Relectures du fil, rangées par tour : la plus récente de chaque tour relu.
 *  Un tour sans relecture n'a pas d'entrée (la relecture est optionnelle). */
export function useReviews(threadId: string | null) {
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

  const reviews = useMemo(() => {
    const byTurn = new Map<string, Review>();
    const seen = new Set<string>();
    for (const review of records) {
      // `records` est trié du plus récent au plus ancien : une relecture plus
      // ancienne du même tour ne revient pas, même si la dernière est écartée.
      if (review.threadId !== threadId || seen.has(review.turnId)) continue;
      seen.add(review.turnId);
      const key = identity(review);
      if (dismissed.has(key)) continue;
      const kept = review.claims?.filter((claim) => !dismissed.has(key + claim.id));
      byTurn.set(review.turnId, kept && kept.length !== review.claims!.length ? { ...review, claims: kept } : review);
    }
    return byTurn;
  }, [records, dismissed, threadId]);
  /** Écarte une affirmation (`claimId`) ou, sans elle, la relecture entière. */
  const dismiss = useCallback((review: Review, claimId = "") => {
    setDismissed((previous) => new Set(previous).add(identity(review) + claimId));
  }, []);
  return { reviews, dismiss };
}
