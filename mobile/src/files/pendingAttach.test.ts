import { beforeEach, describe, expect, it } from "vitest";
import {
  addPendingAttachment,
  clearPendingAttachments,
  loadPendingAttachments,
  removePendingAttachment,
} from "./pendingAttach.ts";

beforeEach(() => {
  clearPendingAttachments();
});

describe("pendingAttach", () => {
  it("add/remove", () => {
    addPendingAttachment({
      fileId: "f1",
      name: "a.png",
      size: 1,
      kind: "figure",
      projectId: "p",
      addedAt: 1,
    });
    expect(loadPendingAttachments()).toHaveLength(1);
    removePendingAttachment("f1");
    expect(loadPendingAttachments()).toHaveLength(0);
  });
});
