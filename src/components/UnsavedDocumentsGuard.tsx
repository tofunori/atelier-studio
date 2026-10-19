// Garde des documents non enregistrés (audit du 2026-10-18, problème 1) :
// - dialogue de confirmation avant de fermer un onglet modifié ou de quitter,
//   sur le modèle des confirmations existantes (AlertDialog shadcn) ;
// - côté Tauri, publie le nombre de documents modifiés pour que la fermeture
//   de la fenêtre soit retenue (CloseRequested / ExitRequested,
//   src-tauri/src/lib.rs), et répond à `atelier-quit-requested`.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./shadcn/alert-dialog";
import { t } from "../lib/i18n";
import {
  answerDiscard,
  confirmDiscard,
  flushUnsavedFrames,
  subscribeDiscardRequests,
  subscribeUnsavedDocuments,
  unsavedDocuments,
  type DiscardRequest,
} from "../lib/unsavedDocuments";

export const QUIT_REQUESTED_EVENT = "atelier-quit-requested";

// Même détection que la dictée : la coquille Tauri pose ses internes sur
// window ; dans un navigateur (tests, dev web) rien n'est retenu côté natif.
const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function UnsavedDocumentsGuard() {
  const [request, setRequest] = useState<DiscardRequest | null>(null);

  useEffect(() => subscribeDiscardRequests(setRequest), []);

  useEffect(() => {
    if (!inTauri()) return;
    let last = -1;
    const publish = () => {
      const count = unsavedDocuments().length;
      if (count === last) return;
      last = count;
      void invoke("set_unsaved_documents", { count }).catch(() => { /* coquille ancienne : rien à retenir */ });
    };
    publish();
    const unsubscribe = subscribeUnsavedDocuments(publish);
    let unlisten: UnlistenFn | null = null;
    let alive = true;
    void listen(QUIT_REQUESTED_EVENT, () => {
      // accusé de réception : sans lui, la coquille laisse passer la demande
      // suivante (interface qui n'écoute plus, voir QuitGuard)
      void invoke("ack_quit_request").catch(() => {});
      void confirmDiscard("quit", unsavedDocuments()).then(async (ok) => {
        if (!ok) return;
        // Les brouillons partent sur le serveur AVANT la sortie : le
        // `pagehide` d'une WebView qu'on ferme n'est pas garanti.
        await flushUnsavedFrames();
        void invoke("confirm_quit").catch(() => {});
      });
    }).then((fn) => {
      if (alive) unlisten = fn;
      else fn();
    }).catch(() => {});
    return () => {
      alive = false;
      unsubscribe();
      unlisten?.();
      // Plus personne ne répondra à `atelier-quit-requested` (App remplacé
      // par la notice de BootBoundary, par exemple) : la coquille ne doit
      // plus retenir la fermeture. Les éditeurs démontés avec l'app ont
      // laissé leurs brouillons de secours sur le serveur.
      void invoke("set_unsaved_documents", { count: 0 }).catch(() => {});
    };
  }, []);

  const quitting = request?.kind === "quit";
  const names = request?.documents.map((document) => document.title).join(", ") ?? "";
  return (
    <AlertDialog open={request != null} onOpenChange={(open) => { if (!open) answerDiscard(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {quitting ? t("unsaved.quit-title") : t("unsaved.close-title", { name: request?.documents[0]?.title ?? "" })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {quitting ? t("unsaved.quit-help", { names }) : t("unsaved.close-help")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant={quitting ? "default" : "destructive"} onClick={() => answerDiscard(true)}>
            {quitting ? t("unsaved.quit-confirm") : t("unsaved.close-confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
