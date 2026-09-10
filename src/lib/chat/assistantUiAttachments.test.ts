import { describe, expect, it, vi } from "vitest";
import type { DraftAttachment } from "../chatDraftStore";
import {
  createAtelierAttachmentAdapter,
  draftAttachmentId,
  draftAttachmentToCompleteAttachment,
  isTextAttachment,
} from "./assistantUiAttachments";

const draft = (overrides: Partial<DraftAttachment> = {}): DraftAttachment => ({
  name: "notes.md",
  lines: null,
  text: "contenu local",
  ...overrides,
});

describe("assistant-ui Atelier attachment adapter", () => {
  it("keeps saved file IDs stable and projects drafts without decoding binary paths", () => {
    const source = draft({
      name: "report.pdf",
      text: "Fichier joint (chemin local, lisible avec Read) : /private/report.pdf",
      path: "/private/report.pdf",
      kind: "file",
    });
    expect(draftAttachmentId(source)).toBe("atelier-file:/private/report.pdf");
    const projected = draftAttachmentToCompleteAttachment(source);
    expect(projected.id).toBe("atelier-file:/private/report.pdf");
    expect(projected.type).toBe("document");
    expect(projected.content).toEqual([{ type: "text", text: source.text }]);
  });

  it("retains a pasted attachment identity after an earlier chip is removed", () => {
    const item = draft({ name: "Citation", text: "A quoted paragraph", kind: "quote" });
    expect(draftAttachmentId(item, 1)).toBe(draftAttachmentId(item, 0));
  });

  it("persists browser files, calls Atelier callbacks once, and preserves MIME payloads", async () => {
    const saved: Array<{ name: string; bytes: Uint8Array }> = [];
    const restored: Array<{ attachment: DraftAttachment; index: number }> = [];
    const onPasteImage = vi.fn();
    const onPasteText = vi.fn();
    const onRemoveAttachment = vi.fn();
    const adapter = createAtelierAttachmentAdapter({
      attachments: [draft({ name: "existing.txt" })],
      onSaveFile: async ({ name, bytes }) => {
        saved.push({ name, bytes });
        return `/private/atelier/attachments/${name}`;
      },
      onRestoreAttachment: (attachment, index) => { restored.push({ attachment, index }); },
      onPasteImage,
      onPasteText,
      onRemoveAttachment,
    });

    const image = new File([new Uint8Array([137, 80, 78, 71])], "figure.png", { type: "image/png" });
    const imagePending = await adapter.add({ file: image });
    expect(imagePending.id).toBe("atelier-file:/private/atelier/attachments/figure.png");
    expect(restored[0]?.index).toBe(1);
    const imageComplete = await adapter.send(imagePending);
    await adapter.send(imagePending);
    expect(onPasteImage).not.toHaveBeenCalled();
    expect(imageComplete.content[0]).toMatchObject({ type: "image", filename: "figure.png" });

    const text = new File(["alpha\nbeta"], "notes.txt", { type: "text/plain" });
    const textPending = await adapter.add({ file: text });
    const textComplete = await adapter.send(textPending);
    expect(onPasteText).not.toHaveBeenCalled();
    expect(textComplete.content[0]).toEqual({
      type: "text",
      text: "<attachment name=notes.txt>\nalpha\nbeta\n</attachment>",
    });

    const pdf = new File([new Uint8Array([37, 80, 68, 70])], "paper.pdf", { type: "application/pdf" });
    const pdfText = vi.fn(() => { throw new Error("PDF must stay binary"); });
    Object.defineProperty(pdf, "text", { value: pdfText });
    const pdfPending = await adapter.add({ file: pdf });
    const pdfComplete = await adapter.send(pdfPending);
    expect(pdfText).not.toHaveBeenCalled();
    expect(pdfComplete.content[0]).toMatchObject({ type: "file", mimeType: "application/pdf" });
    const renamedPdf = new File([new Uint8Array([37, 80, 68, 70, 45])], "paper.md", { type: "application/octet-stream" });
    const renamedPdfText = vi.fn(() => { throw new Error("PDF magic bytes must stay binary"); });
    Object.defineProperty(renamedPdf, "text", { value: renamedPdfText });
    const renamedPdfPending = await adapter.add({ file: renamedPdf });
    const renamedPdfComplete = await adapter.send(renamedPdfPending);
    expect(renamedPdfText).not.toHaveBeenCalled();
    expect(renamedPdfComplete.content[0]).toMatchObject({ type: "file", mimeType: "application/octet-stream" });
    expect(saved.map((entry) => entry.name)).toEqual(["figure.png", "notes.txt", "paper.pdf", "paper.md"]);
    expect(Array.from(saved[2]?.bytes ?? [])).toEqual([37, 80, 68, 70]);
  });

  it("cancels a pending upload before send and addresses its restored draft index", async () => {
    const onRemoveAttachment = vi.fn();
    const onPasteText = vi.fn();
    const adapter = createAtelierAttachmentAdapter({
      onSaveFile: async ({ name }) => `/private/attachments/${name}`,
      onRestoreAttachment: vi.fn(),
      onRemoveAttachment,
      onPasteText,
    });
    const pending = await adapter.add({
      file: new File(["cancel me"], "cancel.txt", { type: "text/plain" }),
    });
    await adapter.remove(pending);
    expect(onRemoveAttachment).toHaveBeenCalledWith(0);
    await expect(adapter.send(pending)).rejects.toThrow("removed before send");
    expect(onPasteText).not.toHaveBeenCalled();
  });

  it("reserves concurrent restore slots and removes restored drafts by their current ID", async () => {
    const existing = draft({ name: "existing.txt" });
    const restored: Array<{ attachment: DraftAttachment; index: number }> = [];
    const onRemoveAttachment = vi.fn();
    const adapter = createAtelierAttachmentAdapter({
      attachments: [existing],
      onSaveFile: async ({ name }) => {
        if (name === "one.txt") await new Promise((resolve) => setTimeout(resolve, 10));
        return `/private/attachments/${name}`;
      },
      onRestoreAttachment: (attachment, index) => { restored.push({ attachment, index }); },
      onRemoveAttachment,
    });
    const [first, second] = await Promise.all([
      adapter.add({ file: new File(["one"], "one.txt", { type: "text/plain" }) }),
      adapter.add({ file: new File(["two"], "two.txt", { type: "text/plain" }) }),
    ]);
    expect(Object.fromEntries(restored.map((item) => [item.attachment.name, item.index]))).toEqual({
      "one.txt": 1,
      "two.txt": 2,
    });

    const ordered = [...restored].sort((left, right) => left.index - right.index);
    adapter.syncDraftAttachments([existing, ...ordered.map((item) => item.attachment)]);
    await adapter.remove(first);
    expect(onRemoveAttachment).toHaveBeenCalledWith(1);

    // A complete attachment projected from the current draft is removable
    // even though it did not originate in this adapter instance's add().
    const projected = draftAttachmentToCompleteAttachment(ordered[1]!.attachment, 2);
    await adapter.remove(projected);
    expect(onRemoveAttachment).toHaveBeenCalledWith(2);
    await adapter.remove(projected);
    expect(onRemoveAttachment).toHaveBeenCalledTimes(2);
    expect(second.id).toContain("atelier-file:/private/attachments/two.txt");
  });

  it("routes native paths separately and classifies PDF as opaque", async () => {
    const onAttachPath = vi.fn();
    const adapter = createAtelierAttachmentAdapter({ onAttachPath });
    const pathDraft = await adapter.attachNativePath("/repo/methods.tex");
    expect(onAttachPath).toHaveBeenCalledWith("/repo/methods.tex");
    expect(pathDraft.path).toBe("/repo/methods.tex");
    expect(isTextAttachment(new File([], "paper.pdf", { type: "application/pdf" }))).toBe(false);
    expect(isTextAttachment(new File([], "paper.md", { type: "application/pdf" }))).toBe(false);
    expect(isTextAttachment(new File([], "paper.txt", { type: "application/octet-stream" }))).toBe(true);
  });

  it("prefers stable-ID removal when the host does not trust list indexes", async () => {
    const source = draft({ path: "/private/attachments/source.md", kind: "file" });
    const onRemoveAttachment = vi.fn();
    const onRemoveAttachmentId = vi.fn();
    const adapter = createAtelierAttachmentAdapter({
      attachments: [source],
      onRemoveAttachment,
      onRemoveAttachmentId,
    });
    await adapter.remove(draftAttachmentToCompleteAttachment(source));
    expect(onRemoveAttachmentId).toHaveBeenCalledWith("atelier-file:/private/attachments/source.md");
    expect(onRemoveAttachment).not.toHaveBeenCalled();
  });
});
