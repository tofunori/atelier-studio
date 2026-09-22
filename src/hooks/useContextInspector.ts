import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { InspectedFile } from "../components/ContextInspector";
import type { DraftAttachment } from "../lib/chatDraftStore";
import { addAttachment } from "../lib/composerAttachments";
import { artefactKind } from "../lib/researchHome";

// ContextInspector (plan 018, étapes 4–5) : sélection explicite depuis le
// menu d'onglet Atelier ; le transfert au chat suit le contrat pending →
// added (accusé) → idle, et la suppression du chip ne touche jamais la source.
export function useContextInspector(
  layout: "split" | "chat" | "atelier",
  activeProject: string | null,
  displayProjectName: string | null,
  setAttachments: Dispatch<SetStateAction<DraftAttachment[]>>,
) {
  const [inspected, setInspected] = useState<InspectedFile | null>(null);
  const [inspectorAdd, setInspectorAdd] = useState<"idle" | "pending" | "added">("idle");
  const inspectorAddTimer = useRef<number | null>(null);
  // l'inspecteur ne survit ni au layout chat (panneau démonté) ni à un
  // changement de projet (l'item pointerait l'ancien projet) — panel 018
  useEffect(() => {
    if (!inspected) return;
    if (layout === "chat" || !activeProject || inspected.projectRoot !== activeProject) {
      setInspected(null);
    }
  }, [layout, activeProject, inspected]);
  useEffect(() => () => {
    if (inspectorAddTimer.current != null) window.clearTimeout(inspectorAddTimer.current);
  }, []);
  function openInspector(rel: string) {
    if (!activeProject) return;
    const segs = rel.split("/");
    setInspectorAdd("idle");
    setInspected({
      rel,
      name: segs[segs.length - 1] || rel,
      dir: segs.slice(0, -1).join("/"),
      kind: artefactKind(rel),
      projectRoot: activeProject,
      projectName: displayProjectName,
    });
  }
  function closeInspector() {
    setInspected(null);
    // retour focus à l'élément source : l'onglet actif de la barre Atelier
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(".atelier-bar .atab.on")?.focus());
  }
  function addInspectedToChat(item: InspectedFile) {
    if (inspectorAdd !== "idle") return; // pending/added : pas de double ajout
    setInspectorAdd("pending");
    setAttachments((l) => addAttachment(l, {
      name: item.name,
      lines: null,
      kind: "file",
      text: `Fichier du projet ajouté au contexte : ${item.projectRoot}/${item.rel}`,
    }));
    setInspectorAdd("added");
    if (inspectorAddTimer.current != null) window.clearTimeout(inspectorAddTimer.current);
    inspectorAddTimer.current = window.setTimeout(() => setInspectorAdd("idle"), 1800);
  }
  return { inspected, inspectorAdd, openInspector, closeInspector, addInspectedToChat };
}
