import { useCallback, useEffect, useRef } from "react";
import type { AgentEvent } from "../lib/ws";
import type { DraftAttachment, useChatDraftStore } from "../lib/chatDraftStore";
import { appSnapPreviewUrl } from "../lib/appSnap";

type Attachment = DraftAttachment;
type DraftStore = ReturnType<typeof useChatDraftStore>;

/** Aperçus `blob:` des captures AppSnap : réhydratation des brouillons
 *  restaurés, balayage des blobs orphelins et révocation au démontage. */
export function useAppSnapPreviews(
  composerDrafts: DraftStore["drafts"],
  updateComposerDraft: DraftStore["updateDraft"],
  eventsRef: { readonly current: Record<string, AgentEvent[]> },
) {
  const appSnapPreviewUrlsRef = useRef(new Set<string>());
  const hydratingAppSnapsRef = useRef(new Set<string>());
  const composerDraftsRef = useRef(composerDrafts);
  composerDraftsRef.current = composerDrafts;

  useEffect(() => () => {
    for (const url of appSnapPreviewUrlsRef.current) URL.revokeObjectURL(url);
    appSnapPreviewUrlsRef.current.clear();
  }, []);

  // Les blobs de capture n'étaient révoqués qu'au démontage de App : chaque
  // capture retenait son PNG pour toute la session. Un blob est encore
  // référencé s'il apparaît dans un brouillon (pièce jointe ou tour en file)
  // ou dans un événement `user` déjà envoyé — tout le reste est orphelin
  // (capture abandonnée, fil évincé) et peut être libéré. Appelé par le
  // passage périodique d'éviction. Le référencement ne devient visible du
  // sweep qu'au commit React suivant l'add : un blob fraîchement créé est
  // donc protégé une passe (`fresh`), et seulement balayable à la suivante.
  const freshAppSnapUrlsRef = useRef(new Set<string>());
  const sweepAppSnapPreviewUrls = useCallback(() => {
    const owned = appSnapPreviewUrlsRef.current;
    if (owned.size === 0) return;
    const referenced = new Set<string>();
    const note = (attachment: { imageUrl?: string }) => {
      if (attachment.imageUrl?.startsWith("blob:")) referenced.add(attachment.imageUrl);
    };
    for (const draft of Object.values(composerDraftsRef.current)) {
      draft.attachments.forEach(note);
      for (const turn of draft.queuedTurns) turn.attachments.forEach(note);
    }
    for (const list of Object.values(eventsRef.current)) {
      for (const event of list) {
        const url = (event as { imageUrl?: string }).imageUrl;
        if (url?.startsWith("blob:")) referenced.add(url);
      }
    }
    const fresh = freshAppSnapUrlsRef.current;
    for (const url of [...owned]) {
      if (fresh.has(url)) {
        fresh.delete(url);
        continue;
      }
      if (!referenced.has(url)) {
        URL.revokeObjectURL(url);
        owned.delete(url);
      }
    }
  }, []);

  useEffect(() => {
    const needsPreview = (attachment: Attachment) =>
      attachment.kind === "appsnap" && Boolean(attachment.path) &&
      !attachment.imageUrl?.startsWith("blob:") && !attachment.imageUrl?.startsWith("data:");

    for (const [key, draft] of Object.entries(composerDrafts)) {
      const paths = new Set<string>();
      for (const attachment of draft.attachments) {
        if (needsPreview(attachment) && attachment.path) paths.add(attachment.path);
      }
      for (const turn of draft.queuedTurns) {
        for (const attachment of turn.attachments) {
          if (needsPreview(attachment) && attachment.path) paths.add(attachment.path);
        }
      }

      for (const path of paths) {
        const hydrationKey = `${key}\u0000${path}`;
        if (hydratingAppSnapsRef.current.has(hydrationKey)) continue;
        hydratingAppSnapsRef.current.add(hydrationKey);
        void appSnapPreviewUrl(path).then((imageUrl) => {
          appSnapPreviewUrlsRef.current.add(imageUrl);
          freshAppSnapUrlsRef.current.add(imageUrl);
          updateComposerDraft(key, (current) => {
            let changed = false;
            const hydrate = (attachment: Attachment) => {
              if (attachment.kind !== "appsnap" || attachment.path !== path || !needsPreview(attachment)) {
                return attachment;
              }
              changed = true;
              return { ...attachment, imageUrl };
            };
            const nextAttachments = current.attachments.map(hydrate);
            const nextQueuedTurns = current.queuedTurns.map((turn) => {
              const next = turn.attachments.map(hydrate);
              return next.some((attachment, index) => attachment !== turn.attachments[index])
                ? { ...turn, attachments: next }
                : turn;
            });
            return changed
              ? { ...current, attachments: nextAttachments, queuedTurns: nextQueuedTurns }
              : current;
          });
        }).catch((error) => {
          console.warn("[appsnap] Could not restore capture preview", error);
        }).finally(() => {
          hydratingAppSnapsRef.current.delete(hydrationKey);
        });
      }
    }
  }, [composerDrafts, updateComposerDraft]);

  /** Une nouvelle capture confie son blob au balayage (protégé une passe). */
  const adoptAppSnapPreviewUrl = useCallback((imageUrl: string) => {
    appSnapPreviewUrlsRef.current.add(imageUrl);
    freshAppSnapUrlsRef.current.add(imageUrl);
  }, []);

  return { sweepAppSnapPreviewUrls, adoptAppSnapPreviewUrl };
}
