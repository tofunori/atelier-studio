// Actions partagées de la base de connaissances (plan 050) — UNE seule
// implémentation pour le popover du composer ET la surface Connaissances :
// attache/détache, épinglages (fichiers, dossier, URL/YouTube, note),
// promotion gbrain, et la corrélation « épinglé ici → attaché à la
// conversation d'origine » (le kbAdd peut répondre après un changement de
// thread ; on capture le binding au moment de l'envoi).
import { useEffect, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { wsSend } from "../../lib/wsBus";
import { t } from "../../lib/i18n";
import type { KbBinding, KbSource } from "../../lib/kbSources";

/**
 * A `kbAdd` response can arrive after the picker that started it has been
 * remounted (for example when the user changes threads while a native file
 * picker is open). Keep the response ledger outside the component so the
 * source conversation's callback survives that remount. Origin matching is
 * used because the current window event has no request id.
 */
type PendingAdd = {
  id: number;
  remaining: number;
  origins: Set<string>;
  attachedNext: string[];
  fullContent: string[];
  onChange: KbBinding["onChange"];
  activeCollection: string | null;
  isMounted: () => boolean;
  isActive: () => boolean;
  setError: (message: string | null) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const PENDING_ADD_TTL_MS = 120_000;
let nextPendingAddId = 1;
const pendingAdds: PendingAdd[] = [];
let kbAddedListenerInstalled = false;

function removePendingAdd(pending: PendingAdd): void {
  const index = pendingAdds.indexOf(pending);
  if (index >= 0) pendingAdds.splice(index, 1);
  clearTimeout(pending.timeout);
}

function pendingForOrigin(origin: string | null): PendingAdd | undefined {
  if (origin) {
    // An origin-bearing response must never fall through to another
    // conversation's FIFO transaction. Without a request id, dropping an
    // unmatched response is safer than contaminating the wrong thread.
    return pendingAdds.find((pending) => pending.origins.has(origin));
  }
  // Sources without an origin cannot be correlated more precisely by this
  // transport. Consume the oldest transaction as the legacy hook did.
  return pendingAdds[0];
}

function onKbSourceAdded(event: Event): void {
  const detail = (event as CustomEvent).detail as
    | { ok?: boolean; message?: string; source?: KbSource }
    | undefined;
  const origin = typeof detail?.source?.origin === "string"
    ? detail.source.origin.trim()
    : null;
  const pending = pendingForOrigin(origin);

  if (!detail?.ok) {
    if (!pending) return;
    pending.remaining -= 1;
    if (pending.isMounted() && pending.isActive()) {
      pending.setError(detail?.message ?? t("kb.error-generic"));
    }
    if (pending.remaining <= 0) removePendingAdd(pending);
    return;
  }

  // Without an id the source cannot be attached safely; leave the transaction
  // pending for a later correlated response.
  const id = detail.source?.id;
  if (!pending || !id) return;

  if (pending.isMounted() && pending.isActive()) pending.setError(null);
  pending.remaining -= 1;
  if (pending.activeCollection) {
    wsSend({ type: "kbTag", id, collection: pending.activeCollection, off: false });
  }
  if (!pending.attachedNext.includes(id)) {
    pending.attachedNext = [...pending.attachedNext, id];
    pending.onChange({
      kbSourceIds: pending.attachedNext,
      kbFullContent: pending.fullContent,
    });
  }
  if (pending.remaining <= 0) removePendingAdd(pending);
}

function ensureKbAddedListener(): void {
  if (kbAddedListenerInstalled || typeof window === "undefined") return;
  kbAddedListenerInstalled = true;
  window.addEventListener("kb-source-added", onKbSourceAdded);
}

/** Test-only reset; production transactions expire after a bounded TTL. */
export function resetKbActionPendingForTests(): void {
  for (const pending of pendingAdds) clearTimeout(pending.timeout);
  pendingAdds.length = 0;
}

export function useKbActions(
  binding: KbBinding,
  isActive: () => boolean,
  opts: {
    /** Plan 052 C : collection active — tout épinglage initié ici y entre. */
    activeCollection?: () => string | null;
  } = {},
) {
  const [error, setError] = useState<string | null>(null);
  const [promoted, setPromoted] = useState<string | null>(null);
  const activeRef = useRef(isActive);
  activeRef.current = isActive;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    ensureKbAddedListener();
    return () => {
      mountedRef.current = false;
      // The module-level transaction deliberately survives this cleanup: its
      // callback belongs to the source conversation and may resolve after a
      // thread switch. The bounded TTL prevents orphaned transactions.
    };
  }, []);

  function trackPendingAdds(count: number, origins: readonly string[] = []) {
    if (count <= 0) return;
    ensureKbAddedListener();
    const pending = {} as PendingAdd;
    pending.id = nextPendingAddId++;
    pending.remaining = count;
    pending.origins = new Set(origins.map((origin) => origin.trim()).filter(Boolean));
    pending.attachedNext = [...binding.attached];
    pending.fullContent = [...binding.fullContent];
    pending.onChange = binding.onChange;
    pending.activeCollection = optsRef.current.activeCollection?.() ?? null;
    pending.isMounted = () => mountedRef.current;
    pending.isActive = () => activeRef.current();
    pending.setError = setError;
    pending.timeout = setTimeout(() => {
      const current = pendingAdds.find((item) => item.id === pending.id);
      if (current) removePendingAdd(current);
    }, PENDING_ADD_TTL_MS);
    pendingAdds.push(pending);
  }

  useEffect(() => {
    const onPromoted = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string } | undefined;
      if (detail?.id) setPromoted(detail.id);
    };
    window.addEventListener("kb-source-promoted", onPromoted);
    return () => window.removeEventListener("kb-source-promoted", onPromoted);
  }, []);

  useEffect(() => {
    if (!promoted) return;
    const timer = setTimeout(() => setPromoted(null), 2000);
    return () => clearTimeout(timer);
  }, [promoted]);

  function toggle(id: string) {
    const on = binding.attached.includes(id);
    binding.onChange({
      kbSourceIds: on ? binding.attached.filter((x) => x !== id) : [...binding.attached, id],
      kbFullContent: on ? binding.fullContent.filter((x) => x !== id) : binding.fullContent,
    });
  }

  function toggleFull(id: string) {
    const full = binding.fullContent.includes(id);
    binding.onChange({
      kbSourceIds: binding.attached.includes(id) ? binding.attached : [...binding.attached, id],
      kbFullContent: full ? binding.fullContent.filter((x) => x !== id) : [...binding.fullContent, id],
    });
  }

  function removeSource(id: string) {
    wsSend({ type: "kbRemove", id });
    if (binding.attached.includes(id) || binding.fullContent.includes(id)) {
      binding.onChange({
        kbSourceIds: binding.attached.filter((x) => x !== id),
        kbFullContent: binding.fullContent.filter((x) => x !== id),
      });
    }
  }

  /** Suppression en lot (redesign de la base) : UN message, UNE liste fraîche.
   *  Le détachement local suit, sinon la conversation garde des pilules
   *  orphelines jusqu'au prochain kbList. */
  function removeMany(ids: string[]) {
    if (!ids.length) return;
    wsSend({ type: "kbRemove", ids });
    const dropped = new Set(ids);
    if (binding.attached.some((x) => dropped.has(x)) || binding.fullContent.some((x) => dropped.has(x))) {
      binding.onChange({
        kbSourceIds: binding.attached.filter((x) => !dropped.has(x)),
        kbFullContent: binding.fullContent.filter((x) => !dropped.has(x)),
      });
    }
  }

  function promote(id: string) {
    setError(null);
    wsSend({ type: "kbPromote", id });
  }

  async function addFiles() {
    const picked = await openDialog({
      multiple: true,
      // csv/tsv : un tableau entre dans la base profilé, pas déversé (csv_digest)
      filters: [{ name: "Sources", extensions: ["md", "tex", "txt", "pdf", "csv", "tsv"] }],
    });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    trackPendingAdds(paths.length, paths);
    for (const path of paths) {
      const kind = String(path).toLowerCase().endsWith(".pdf") ? "pdf" : "file";
      wsSend({ type: "kbAdd", kind, origin: path });
    }
  }

  // Épinglage d'un PDF déjà choisi ailleurs (plan 053 : « Épingler seulement »
  // du dialogue d'article) — même chemin que addFiles, sans re-sélection.
  function addPdf(path: string) {
    if (!path) return;
    trackPendingAdds(1, [path]);
    wsSend({ type: "kbAdd", kind: "pdf", origin: path });
  }

  async function addFolder() {
    const picked = await openDialog({ directory: true, multiple: false });
    if (!picked || Array.isArray(picked)) return;
    trackPendingAdds(1, [picked]);
    wsSend({ type: "kbAdd", kind: "folder", origin: picked });
  }

  function addUrl(url: string) {
    trackPendingAdds(1, [url]);
    // une URL YouTube s'épingle par son transcript horodaté (T8) ;
    // détection large — le backend valide l'hôte exactement
    const kind = /youtube\.com\/|youtu\.be\//.test(url) ? "youtube" : "web";
    wsSend({ type: "kbAdd", kind, origin: url });
  }

  function addNote(title: string, text: string) {
    trackPendingAdds(1, [title]);
    wsSend({ type: "kbAdd", kind: "note", title, text });
  }

  // Épingle (ou re-synchronise : id déterministe par slug) une page du corpus
  // gbrain — plan 050 P3.
  function addGbrain(slug: string) {
    trackPendingAdds(1, [slug]);
    wsSend({ type: "kbAdd", kind: "gbrain", origin: slug });
  }

  // Organisation (plan 051) : collections et archivage.
  function createCollection(title: string) {
    const clean = title.trim();
    if (!clean) return;
    wsSend({ type: "kbCollection", op: "add", title: clean });
  }

  function tagSource(id: string, slug: string, off: boolean) {
    wsSend({ type: "kbTag", id, collection: slug, off });
  }

  // Lots (plan 052) : UNE mutation backend, UNE liste fraîche.
  function tagMany(ids: string[], slug: string) {
    if (ids.length) wsSend({ type: "kbTag", ids, collection: slug, off: false });
  }

  function archiveMany(ids: string[]) {
    if (!ids.length) return;
    wsSend({ type: "kbArchive", ids, off: false });
    const dropped = new Set(ids);
    if (binding.attached.some((x) => dropped.has(x)) || binding.fullContent.some((x) => dropped.has(x))) {
      binding.onChange({
        kbSourceIds: binding.attached.filter((x) => !dropped.has(x)),
        kbFullContent: binding.fullContent.filter((x) => !dropped.has(x)),
      });
    }
  }

  function attachMany(ids: string[]) {
    const next = [...new Set([...binding.attached, ...ids])];
    if (next.length !== binding.attached.length) {
      binding.onChange({ kbSourceIds: next, kbFullContent: binding.fullContent });
    }
  }

  function toggleCollection(ids: string[], attach: boolean) {
    if (attach) { attachMany(ids); return; }
    const removed = new Set(ids);
    binding.onChange({
      kbSourceIds: binding.attached.filter(id => !removed.has(id)),
      kbFullContent: binding.fullContent.filter(id => !removed.has(id)),
    });
  }

  function archiveSource(id: string, off: boolean) {
    wsSend({ type: "kbArchive", id, off });
    // une source archivée quitte le contexte de la conversation
    if (!off && (binding.attached.includes(id) || binding.fullContent.includes(id))) {
      binding.onChange({
        kbSourceIds: binding.attached.filter((x) => x !== id),
        kbFullContent: binding.fullContent.filter((x) => x !== id),
      });
    }
  }

  return {
    error, setError, promoted,
    toggle, toggleFull, removeSource, removeMany, promote,
    addFiles, addFolder, addPdf, addUrl, addNote, addGbrain,
    createCollection, tagSource, archiveSource,
    tagMany, archiveMany, attachMany, toggleCollection,
  };
}
