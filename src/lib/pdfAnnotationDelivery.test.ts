import { describe, it, expect, vi } from "vitest";
import { PdfAnnotationDelivery, removeDeliveredAnnotation } from "./pdfAnnotationDelivery";

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

describe("gallery cleanup request", () => {
  it("uses CORS-supported Bearer auth and removes only the acknowledged ID", async () => {
    const request = vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true})});
    await removeDeliveredAnnotation(attachment.pdfAnnotation,"test-token",request);
    expect(request.mock.calls[0][0].href).toBe("http://127.0.0.1:19000/pdfannot");
    expect(request.mock.calls[0][1]).toEqual({method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer test-token"},body:JSON.stringify({rel:"paper.pdf",removeIds:["a1"]})});
  });
  it("does not report a failed server deletion as consumed", async () => {
    const request=vi.fn().mockResolvedValue({ok:false});
    await expect(removeDeliveredAnnotation(attachment.pdfAnnotation,null,request)).rejects.toThrow("cleanup failed");
  });
  it("never sends the gallery token to an external origin", async () => {
    const request=vi.fn();
    await expect(removeDeliveredAnnotation({...attachment.pdfAnnotation,origin:"https://example.com"},"test-token",request)).rejects.toThrow("Invalid gallery origin");
    expect(request).not.toHaveBeenCalled();
  });
});
