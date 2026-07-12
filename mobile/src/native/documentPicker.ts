/**
 * Document picker — first use only opens OS picker (plan 034 H).
 * Web: <input type=file>; Tauri: dialog plugin when available.
 */

export type PickedDocument = {
  name: string;
  size: number;
  mime: string;
  /** Local blob for upload/attach — not a Mac path. */
  blob: Blob;
};

export async function pickDocuments(opts?: {
  multiple?: boolean;
  accept?: string;
}): Promise<PickedDocument[]> {
  // Prefer hidden input (works in WKWebView without extra permission prompt)
  return pickViaInput(opts);
}

function pickViaInput(opts?: {
  multiple?: boolean;
  accept?: string;
}): Promise<PickedDocument[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = !!opts?.multiple;
    if (opts?.accept) input.accept = opts.accept;
    input.style.display = "none";
    document.body.appendChild(input);
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      document.body.removeChild(input);
      const out: PickedDocument[] = files.map((f) => ({
        name: f.name,
        size: f.size,
        mime: f.type || "application/octet-stream",
        blob: f,
      }));
      resolve(out);
    };
    input.oncancel = () => {
      document.body.removeChild(input);
      resolve([]);
    };
    input.click();
  });
}
