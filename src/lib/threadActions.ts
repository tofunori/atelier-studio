// Actions de fil déclenchées depuis le chat, la barre latérale et le Quick Ask :
// chacune envoie un message au serveur Atelier et, au besoin, prépare l'état
// local (réponse attendue, fil ouvert après création). Sorties d'App.tsx, où
// elles vivaient en callbacks inline du rendu ; mêmes lectures au moment de
// l'appel (refs), même ordre des effets.
import type { Thread, AgentEvent } from "./ws";
import type { ThreadEvents } from "./threadEventStore";
import { buildForkThreadPayload } from "./forkThread";
import { qaPromotePayload } from "./quickAskModel";
import { linkedConversations } from "./threadLinks";
import { checkpointAfterUser } from "./turnCheckpoint";

type Ref<T> = { current: T };

/** Édition renvoyée : le revert part d'abord, le nouveau texte suit à sa confirmation. */
export type PendingResend = {
  threadId: string;
  prompt: string;
  snapshot: AgentEvent[];
  clientMessageId: string;
  ts: number;
  index: number;
};

/** Revert en vol : l'état local est restauré à la confirmation du serveur. */
export type PendingRevert = {
  threadId: string;
  snapshot: AgentEvent[];
  index: number;
};

/** Objectif Codex posé avant que la session existe (premier message). */
export type PendingGoal = { threadId: string | null; objective: string };

export type ThreadActionsContext = {
  ws: Ref<WebSocket | null>;
  /** Valeurs du rendu courant (les callbacks inline les capturaient ainsi). */
  activeId: string | null;
  activeProject: string | null;
  allThreads: Thread[];
  activeIdRef: Ref<string | null>;
  activeProjectRef: Ref<string | null>;
  allThreadsRef: Ref<Thread[]>;
  eventsRef: Ref<ThreadEvents>;
  pendingRevert: Ref<PendingRevert | null>;
  pendingResend: Ref<PendingResend | null>;
  pendingGoal: Ref<PendingGoal | null>;
  pendingPaste: Ref<string | null>;
  setActiveId: (id: string | null) => void;
  setEvents: (update: (previous: ThreadEvents) => ThreadEvents) => void;
  setDraftThreads: (update: (previous: Thread[]) => Thread[]) => void;
  setInjectText: (text: string | null) => void;
  requestHistory: (threadId: string, cursor?: undefined, options?: { force?: boolean }) => unknown;
};

export function createThreadActions(ctx: ThreadActionsContext) {
  const { ws } = ctx;
  const open = () => ws.current?.readyState === 1;
  const send = (payload: unknown) => ws.current!.send(JSON.stringify(payload));

  /** Le serveur crée le fil de façon asynchrone : on l'ouvre, historique
   * compris, un court instant après la demande. */
  function openCreatedThread(newId: string) {
    setTimeout(() => {
      ctx.setActiveId(newId);
      ctx.activeIdRef.current = newId;
      ctx.requestHistory(newId);
    }, 250);
  }

  return {
    importSession(provider: string, sessionId: string, title: string, sessionRoot?: string) {
      const newId = crypto.randomUUID();
      if (!open()) return;
      send({
        type: "importSession",
        newThreadId: newId,
        provider,
        sessionId,
        title,
        projectRoot: sessionRoot || ctx.activeProject || "",
      });
      // charger l'historique (Claude) une fois le thread créé
      openCreatedThread(newId);
    },

    promoteQuickAsk(qaId: string, title: string) {
      const newId = crypto.randomUUID();
      if (!open()) return;
      send(qaPromotePayload({
        qaId, newThreadId: newId, title,
        activeProject: ctx.activeProjectRef.current,
      }));
      openCreatedThread(newId);
    },

    deleteThread(threadId: string) {
      ctx.setDraftThreads((p) => p.filter((t) => t.id !== threadId));
      ctx.setEvents((p) => {
        const { [threadId]: _, ...rest } = p;
        return rest;
      });
      if (ctx.activeId === threadId) ctx.setActiveId(null);
      if (open()) send({ type: "deleteThread", threadId });
    },

    renameThread(threadId: string, title: string) {
      ctx.setDraftThreads((p) => p.map((t) => (t.id === threadId ? { ...t, title } : t)));
      if (open()) send({ type: "renameThread", threadId, title });
    },

    /** `unlinkThread` vise toujours le côté enfant de la relation stockée. */
    unlinkConversation(childThreadId: string) {
      if (open()) send({ type: "unlinkThread", threadId: childThreadId });
    },

    /** Délier depuis l'en-tête du fil actif : `threadId` est l'agent affiché. */
    unlinkLinkedAgent(threadId: string) {
      const childId = ctx.activeId
        ? linkedConversations(ctx.allThreads, ctx.activeId).find(
            (relation) => relation.thread.id === threadId,
          )?.childThreadId
        : null;
      if (childId && open()) send({ type: "unlinkThread", threadId: childId });
    },

    revert(index: number, text: string, edit?: boolean) {
      if (!ctx.activeId) return;
      const id = ctx.activeId;
      const snapshot = ctx.eventsRef.current[id] ?? [];
      const eventId = (snapshot[index]?.meta as any)?.eventId;
      const checkpoint = checkpointAfterUser(snapshot, index);
      if (open()) {
        ctx.pendingRevert.current = { threadId: id, snapshot, index };
        send({ type: "revert", scope: "thread", threadId: id, text, eventId, ...checkpoint });
      }
      if (edit) ctx.setInjectText(text);
    },

    editSend(index: number, oldText: string, newText: string) {
      if (!ctx.activeId) return;
      const id = ctx.activeId;
      const snapshot = ctx.eventsRef.current[id] ?? [];
      const eventId = (snapshot[index]?.meta as any)?.eventId;
      ctx.pendingResend.current = {
        threadId: id,
        prompt: newText,
        snapshot,
        clientMessageId: crypto.randomUUID(),
        ts: Date.now(),
        index,
      };
      if (open()) send({ type: "revert", scope: "thread", threadId: id, text: oldText, eventId });
    },

    fork(index: number) {
      const activeId = ctx.activeId;
      if (!activeId) return;
      const src = ctx.allThreadsRef.current.find((t) => t.id === activeId);
      if (!src) return;
      const newId = crypto.randomUUID();
      const { forkEvents, payload } = buildForkThreadPayload(
        activeId,
        newId,
        index,
        ctx.eventsRef.current[activeId] ?? [],
      );
      // copie locale de l'historique jusqu'au point de fork
      ctx.setEvents((p) => ({ ...p, [newId]: forkEvents }));
      if (open()) send(payload);
      ctx.setActiveId(newId);
      ctx.activeIdRef.current = newId;
    },

    stop() {
      if (ctx.activeId && open()) {
        send({ type: "interrupt", threadId: ctx.activeId });
        ctx.requestHistory(ctx.activeId, undefined, { force: true });
      }
    },

    pasteImage(dataURL: string) {
      if (!open()) return;
      ctx.pendingPaste.current = dataURL;
      send({ type: "saveImage", dataURL });
    },

    goal(action: "set" | "clear", objective?: string, status?: "active" | "paused") {
      const activeId = ctx.activeId;
      if (!activeId || !open()) return;
      const th = ctx.allThreadsRef.current.find((t) => t.id === activeId);
      if (!th?.sessionId) {
        // pas encore de session : mémoriser (posé au premier message)
        // ou oublier — goalSet/goalClear échoueraient côté sidecar
        ctx.pendingGoal.current =
          action === "set" && objective ? { threadId: activeId, objective } : null;
        return;
      }
      if (action === "clear") ctx.pendingGoal.current = null;
      // le router sidecar relaie déjà `status` à thread/goal/set (Codex
      // app-server) — pause = status:"paused", reprise = "active"
      send(
        action === "set"
          ? { type: "goalSet", threadId: activeId, objective, ...(status ? { status } : {}) }
          : { type: "goalClear", threadId: activeId },
      );
    },
  };
}
