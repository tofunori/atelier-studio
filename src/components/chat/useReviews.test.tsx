// useReviews : une relecture par tour relu, affirmations décodées, « Écarter ».
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useReviews } from "./useReviews";

const send = (detail: Record<string, unknown>) => act(() => {
  window.dispatchEvent(new CustomEvent("review-result", { detail: { threadId: "thread-A", status: "done", ...detail } }));
});

afterEach(cleanup);

describe("useReviews", () => {
  it("range la relecture la plus récente sous chaque tour relu", () => {
    const { result } = renderHook(() => useReviews("thread-A"));
    expect(result.current.reviews.size).toBe(0);
    send({ turnId: "turn-1", reviewId: "a", verdict: "ok", createdAt: "2026-11-10T10:00:00Z" });
    send({ turnId: "turn-2", reviewId: "b", verdict: "issues", createdAt: "2026-11-10T10:05:00Z" });
    send({ turnId: "turn-1", reviewId: "c", verdict: "inconclusive", createdAt: "2026-11-10T10:10:00Z" });
    send({ threadId: "thread-B", turnId: "turn-9", reviewId: "d", verdict: "ok" });
    expect([...result.current.reviews.keys()].sort()).toEqual(["turn-1", "turn-2"]);
    expect(result.current.reviews.get("turn-1")?.reviewId).toBe("c");
    expect(result.current.reviews.get("turn-2")?.verdict).toBe("issues");
  });

  it("décode les affirmations et les limites, et ignore les entrées mal formées", () => {
    const { result } = renderHook(() => useReviews("thread-A"));
    send({ turnId: "turn-1", reviewId: "a", verdict: "issues", limitations: ["tool-3", 4],
      claims: [
        { id: "cell-cite-1", claim: "0,42 [cellule 29]", outcome: "failed", category: "number",
          proof: "0,42 ne figure pas", evidenceIds: ["cell-29"], cell: 29 },
        { id: "claim-1", claim: "La pente vaut 0,42", outcome: "passed", evidenceIds: ["tool-0", 7] },
        { id: "sans-phrase", outcome: "passed" },
        "n'importe quoi",
      ] });
    const review = result.current.reviews.get("turn-1")!;
    expect(review.limitations).toEqual(["tool-3"]);
    expect(review.claims).toEqual([
      { id: "cell-cite-1", claim: "0,42 [cellule 29]", outcome: "failed", category: "number",
        proof: "0,42 ne figure pas", evidenceIds: ["cell-29"], cell: 29 },
      { id: "claim-1", claim: "La pente vaut 0,42", outcome: "passed", category: undefined,
        proof: undefined, evidenceIds: ["tool-0"], cell: undefined },
    ]);
  });

  it("un ancien serveur sans `claims` : chaque problème devient une affirmation en échec", () => {
    const { result } = renderHook(() => useReviews("thread-A"));
    send({ turnId: "turn-1", reviewId: "a", verdict: "issues",
      issues: [{ claim: "check", problem: "problem", severity: "review", fix: "corrige" }] });
    expect(result.current.reviews.get("turn-1")?.claims).toEqual([
      { id: "issue-0", claim: "check", outcome: "failed", proof: "problem → corrige", evidenceIds: [] },
    ]);
  });

  it("Écarter retire une affirmation, ou la relecture entière", () => {
    const { result } = renderHook(() => useReviews("thread-A"));
    send({ turnId: "turn-1", reviewId: "a", verdict: "issues", createdAt: "2026-11-10T10:00:00Z", claims: [
      { id: "claim-1", claim: "un", outcome: "failed" },
      { id: "claim-2", claim: "deux", outcome: "passed" },
    ] });
    act(() => result.current.dismiss(result.current.reviews.get("turn-1")!, "claim-1"));
    expect(result.current.reviews.get("turn-1")?.claims?.map((claim) => claim.id)).toEqual(["claim-2"]);
    act(() => result.current.dismiss(result.current.reviews.get("turn-1")!));
    expect(result.current.reviews.has("turn-1")).toBe(false);
    // une relecture plus ancienne du même tour ne revient pas à sa place
    send({ turnId: "turn-1", reviewId: "0", verdict: "ok", createdAt: "2020-01-01T00:00:00Z" });
    expect(result.current.reviews.has("turn-1")).toBe(false);
  });
});
