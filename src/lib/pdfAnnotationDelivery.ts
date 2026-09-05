import type { DraftAttachment } from "./chatDraftStore";

export type PdfAnnotation = NonNullable<DraftAttachment["pdfAnnotation"]>;

/** Track submitted messages, not draft changes or queued turns. */
export class PdfAnnotationDelivery {
  private pending = new Map<string, PdfAnnotation[]>();
  track(messageId: string, attachments: DraftAttachment[]) {
    const annotations = attachments.flatMap(a => a.pdfAnnotation ? [a.pdfAnnotation] : []);
    if (annotations.length) this.pending.set(messageId, annotations);
  }
  async acknowledge(messageId: string, remove: (annotation: PdfAnnotation) => Promise<void>) {
    const annotations = this.pending.get(messageId);
    if (!annotations) return;
    this.pending.delete(messageId);
    const failed: PdfAnnotation[] = [];
    for (const annotation of annotations) {
      try { await remove(annotation); } catch { failed.push(annotation); }
    }
    if (failed.length) {
      this.pending.set(messageId, failed);
      throw new Error("Certaines annotations n’ont pas pu être retirées du PDF.");
    }
  }
}
