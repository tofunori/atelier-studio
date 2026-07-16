import { rmSync } from 'node:fs';

const RETRYABLE_REMOVE_ERRORS = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM']);

/**
 * Remove an E2E project even when a detached gallery builder completes its
 * final atomic write just after the HTTP server exits. Each attempt performs
 * a fresh recursive scan; fs.rm's built-in ENOTEMPTY retry only retries the
 * final rmdir and therefore cannot see files created after its first scan.
 */
export async function removeTempRoot(root) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      rmSync(root, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!RETRYABLE_REMOVE_ERRORS.has(error?.code)) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(25 * (attempt + 1), 150)));
    }
  }
  throw lastError;
}
