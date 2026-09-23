// The source picker may close before KnowledgeSurface mounts. Retain the
// preview intent until that surface is visible; never approve a write here.
let pending: string | null = null;

export function requestRagdocPromotion(id: string) {
  pending = id;
  window.dispatchEvent(new CustomEvent("kb-request-ragdoc-promotion"));
}

export function consumeRagdocPromotion(): string | null {
  const id = pending;
  pending = null;
  return id;
}
