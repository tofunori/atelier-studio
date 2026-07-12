import { describe, expect, it } from "vitest";
import {
  emptySendQueue,
  enqueueSend,
  listRetryable,
  markAcked,
  markDurableByMessageId,
  markFailed,
  markInflight,
  parseQueue,
  recoverAfterRestart,
  serializeQueue,
} from "./sendQueue.ts";

describe("sendQueue", () => {
  it("idempotent enqueue by clientRequestId", () => {
    let q = emptySendQueue();
    q = enqueueSend(q, {
      clientRequestId: "c1",
      clientMessageId: "m1",
      threadId: "t",
      prompt: "hi",
    });
    q = enqueueSend(q, {
      clientRequestId: "c1",
      clientMessageId: "m1",
      threadId: "t",
      prompt: "hi",
    });
    expect(q.items).toHaveLength(1);
  });

  it("pending → inflight → acked → durable", () => {
    let q = enqueueSend(emptySendQueue(), {
      clientRequestId: "c1",
      clientMessageId: "m1",
      threadId: "t",
      prompt: "hi",
    });
    q = markInflight(q, "c1");
    expect(q.items[0].status).toBe("inflight");
    q = markAcked(q, "c1");
    expect(q.items[0].status).toBe("acked");
    q = markDurableByMessageId(q, "m1");
    expect(q.items[0].status).toBe("durable");
  });

  it("kill after send before ack → recover inflight to pending_local", () => {
    let q = enqueueSend(emptySendQueue(), {
      clientRequestId: "c1",
      clientMessageId: "m1",
      threadId: "t",
      prompt: "hi",
    });
    q = markInflight(q, "c1");
    const raw = serializeQueue(q);
    const restored = parseQueue(raw);
    expect(restored.items[0].status).toBe("pending_local");
    expect(listRetryable(restored, "t")).toHaveLength(1);
  });

  it("failed is retryable", () => {
    let q = enqueueSend(emptySendQueue(), {
      clientRequestId: "c1",
      clientMessageId: "m1",
      threadId: "t",
      prompt: "hi",
    });
    q = markFailed(q, "c1", "network");
    expect(listRetryable(q)).toHaveLength(1);
  });

  it("recoverAfterRestart", () => {
    const q = recoverAfterRestart({
      items: [
        {
          clientRequestId: "a",
          clientMessageId: "m",
          threadId: "t",
          prompt: "x",
          status: "inflight",
          createdAt: 1,
          updatedAt: 1,
          attempts: 1,
        },
      ],
    });
    expect(q.items[0].status).toBe("pending_local");
  });
});
