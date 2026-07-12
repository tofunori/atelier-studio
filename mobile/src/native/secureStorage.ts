/**
 * Secure storage abstraction (plan 034 D).
 * - Tauri: invoke Rust commands backed by Keychain on iOS when available.
 * - Web / tests: session-isolated memory + localStorage fallback (no secrets in logs).
 */

type Store = Map<string, string>;

const memory: Store = new Map();

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function secureSet(key: string, value: string): Promise<void> {
  memory.set(key, value);
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("secure_set", { key, value });
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    localStorage.setItem(`secure:${key}`, value);
  } catch {
    /* private mode */
  }
}

export async function secureGet(key: string): Promise<string | null> {
  if (memory.has(key)) return memory.get(key)!;
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const v = await invoke<string | null>("secure_get", { key });
      if (v != null) {
        memory.set(key, v);
        return v;
      }
    } catch {
      /* fall through */
    }
  }
  try {
    return localStorage.getItem(`secure:${key}`);
  } catch {
    return null;
  }
}

export async function secureRemove(key: string): Promise<void> {
  memory.delete(key);
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("secure_remove", { key });
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.removeItem(`secure:${key}`);
  } catch {
    /* ignore */
  }
}

/** Test-only: wipe memory + localStorage secure keys. */
export function __resetSecureStorageForTests(): void {
  memory.clear();
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("secure:")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
