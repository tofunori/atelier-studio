import type { DraftAttachment } from './chatDraftStore';

/** Visible transcript only: the provider already receives attachment text. */
export function annotationDisplayText(prompt: string, attachments: readonly DraftAttachment[]): string {
  const annotations = attachments.filter(attachment => attachment.pdfAnnotation && attachment.text.trim());
  if (!annotations.length) return prompt;
  return [prompt, ...annotations.map(attachment => attachment.text)].filter(text => text.trim()).join('\n\n');
}
