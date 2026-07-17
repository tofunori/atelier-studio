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

export function useKbActions(binding: KbBinding, isActive: () => boolean) {
  const [error, setError] = useState<string | null>(null);
  const [promoted, setPromoted] = useState<string | null>(null);
  const activeRef = useRef(isActive);
  activeRef.current = isActive;
  const pendingRef = useRef<{
    remaining: number;
    attachedNext: string[];
    fullContent: string[];
    onChange: KbBinding["onChange"];
  } | null>(null);

  function trackPendingAdds(count: number) {
    const pending = pendingRef.current;
    if (pending && pending.onChange === binding.onChange) {
      pending.remaining += count;
    } else {
      pendingRef.current = {
        remaining: count,
        attachedNext: [...binding.attached],
        fullContent: binding.fullContent,
        onChange: binding.onChange,
      };
    }
  }

  useEffect(() => {
    const onAdded = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { ok?: boolean; message?: string; source?: KbSource }
        | undefined;
      const pending = pendingRef.current;
      if (!detail?.ok) {
        if (pending && pending.remaining > 0) pending.remaining -= 1;
        if (activeRef.current()) setError(detail?.message ?? t("kb.error-generic"));
        return;
      }
      const id = detail.source?.id;
      if (!pending || pending.remaining <= 0 || !id) return;
      pending.remaining -= 1;
      if (!pending.attachedNext.includes(id)) {
        pending.attachedNext = [...pending.attachedNext, id];
        pending.onChange({
          kbSourceIds: pending.attachedNext,
          kbFullContent: pending.fullContent,
        });
      }
    };
    window.addEventListener("kb-source-added", onAdded);
    return () => window.removeEventListener("kb-source-added", onAdded);
  }, []);

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

  function promote(id: string) {
    setError(null);
    wsSend({ type: "kbPromote", id });
  }

  async function addFiles() {
    const picked = await openDialog({
      multiple: true,
      filters: [{ name: "Sources", extensions: ["md", "tex", "txt", "pdf"] }],
    });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    trackPendingAdds(paths.length);
    for (const path of paths) {
      const kind = String(path).toLowerCase().endsWith(".pdf") ? "pdf" : "file";
      wsSend({ type: "kbAdd", kind, origin: path });
    }
  }

  async function addFolder() {
    const picked = await openDialog({ directory: true, multiple: false });
    if (!picked || Array.isArray(picked)) return;
    trackPendingAdds(1);
    wsSend({ type: "kbAdd", kind: "folder", origin: picked });
  }

  function addUrl(url: string) {
    trackPendingAdds(1);
    // une URL YouTube s'épingle par son transcript horodaté (T8) ;
    // détection large — le backend valide l'hôte exactement
    const kind = /youtube\.com\/|youtu\.be\//.test(url) ? "youtube" : "web";
    wsSend({ type: "kbAdd", kind, origin: url });
  }

  function addNote(title: string, text: string) {
    trackPendingAdds(1);
    wsSend({ type: "kbAdd", kind: "note", title, text });
  }

  // Épingle (ou re-synchronise : id déterministe par slug) une page du corpus
  // gbrain — plan 050 P3.
  function addGbrain(slug: string) {
    trackPendingAdds(1);
    wsSend({ type: "kbAdd", kind: "gbrain", origin: slug });
  }

  return {
    error, setError, promoted,
    toggle, toggleFull, removeSource, promote,
    addFiles, addFolder, addUrl, addNote, addGbrain,
  };
}
