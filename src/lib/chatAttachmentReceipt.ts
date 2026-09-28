/** A receipt confirms insertion into the composer, never delivery to a model.
 * Failed insertions remain retryable; repeated successful requests are inert. */
export function acceptChatAttachment(
  key: string | undefined,
  accepted: Set<string>,
  insert: () => void,
): { ok: true } | { ok: false; error: string } {
  if (key && accepted.has(key)) return { ok: true };
  try {
    insert();
    if (key) accepted.add(key);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
