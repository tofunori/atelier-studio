import { describe, it, expect, vi } from "vitest";
import { PdfAnnotationDelivery } from "./pdfAnnotationDelivery";

const attachment = { name: "paper.pdf", lines: null, text: "passage", pdfAnnotation: { origin: "http://127.0.0.1:19000", rel: "paper.pdf", id: "a1" } };

describe("PDF annotation delivery", () => {
  it("keeps annotations until their submitted message is acknowledged, once only", async () => {
    const delivery = new PdfAnnotationDelivery();
    const remove = vi.fn().mockResolvedValue(undefined);
    delivery.track("message1", [attachment]);
    expect(remove).not.toHaveBeenCalled();
    await delivery.acknowledge("another message", remove);
    expect(remove).not.toHaveBeenCalled();
    await delivery.acknowledge("message1", remove);
    expect(remove).toHaveBeenCalledWith(attachment.pdfAnnotation);
    await delivery.acknowledge("message1", remove);
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it("retains failed cleanup for retry without removing already completed annotations twice", async () => {
    const delivery = new PdfAnnotationDelivery();
    delivery.track("m", [attachment]);
    await expect(delivery.acknowledge("m", async () => { throw new Error("offline"); })).rejects.toThrow();
    const remove = vi.fn().mockResolvedValue(undefined);
    await delivery.acknowledge("m", remove);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
