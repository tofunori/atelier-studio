import { describe, expect, it, vi } from "vitest";
import { acceptChatAttachment } from "./chatAttachmentReceipt";

describe("attachment receipts", () => {
  it("acknowledges a retry without inserting the attachment twice", () => {
    const accepted = new Set<string>();
    const insert = vi.fn();
    expect(acceptChatAttachment("pdf:1", accepted, insert)).toEqual({ ok: true });
    expect(acceptChatAttachment("pdf:1", accepted, insert)).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("reports a refused insertion and allows it to be retried", () => {
    const accepted = new Set<string>();
    const insert = vi.fn().mockImplementationOnce(() => { throw new Error("Projet manquant"); });
    expect(acceptChatAttachment("pdf:1", accepted, insert)).toEqual({ ok: false, error: "Projet manquant" });
    expect(accepted.size).toBe(0);
    expect(acceptChatAttachment("pdf:1", accepted, insert)).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledTimes(2);
  });
});
