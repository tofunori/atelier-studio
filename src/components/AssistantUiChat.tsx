import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  AssistantRuntimeProvider, ComposerPrimitive, useExternalStoreRuntime, useAuiState,
  type AppendMessage, type ThreadMessageLike,
} from "@assistant-ui/react";
import { GitForkIcon, PencilIcon, ArrowUpIcon, CornerUpLeftIcon, Undo2Icon, Settings2Icon, BookmarkIcon, StarIcon } from "lucide-react";
import type Chat from "./Chat";
import { createAtelierQueueAdapter } from "../lib/chat/assistantUiQueue";
import { handleAssistantUiLink } from "../lib/chat/assistantUiLinks";
import { AssistantUiKnowledgePicker } from "./assistant-ui/AssistantUiKnowledgePicker";
import { AssistantUiInteraction, isAssistantUiInteractionResumePayload } from "./AssistantUiInteraction";
import { AssistantUiComposerSuggestions } from "./assistant-ui/AssistantUiComposerSuggestions";
import { AssistantUiComposerControls } from "./AssistantUiComposerControls";
import { PromptLibrary } from "./assistant-ui/elements/prompt-library";
import { Popover, PopoverTrigger, PopoverContent } from "./assistant-ui/primitives/popover";
import { Button } from "./assistant-ui/primitives/button";
import { ToggleGroup, ToggleGroupItem } from "./shadcn/toggle-group";
import { basculerConsigne, nomConsigne } from "../lib/consignes";
import { AssistantUiData } from "./AssistantUiData";
import { AssistantUiGoalControls } from "./AssistantUiGoalControls";
import { AssistantUiHome } from "./AssistantUiHome";
import { AssistantUiPinnedMessageActions } from "./AssistantUiPinnedMessageActions";
import { AssistantUiThreadControls } from "./AssistantUiThreadControls";
import { Thread } from "./assistant-ui/elements/thread.aui";
import { ModelSelector, type ModelOption } from "./assistant-ui/elements/model-selector.aui";
import { TooltipIconButton } from "./assistant-ui/elements/tooltip-icon-button";
import { MessageQueue } from "./assistant-ui/elements/message-queue";
import {
  assistantUiApprovalToInteractionResponse, projectAgentEventsToThreadMessages,
  type AssistantUiApprovalDecision,
} from "../lib/chat/assistantUiProjection";
import {
  createAtelierAttachmentAdapter, draftAttachmentId, draftAttachmentToCompleteAttachment,
} from "../lib/chat/assistantUiAttachments";
import {
  assistantUiEffortLabel, assistantUiEffortLevels,
  chatModelOptionId, chatModelStorageKey, parseChatModelOptionId,
  persistChatModelSelection, resolveChatModelSelection, isChatModelSelection,
} from "../lib/chat/assistantUiModelSelection";
import { orderedVisibleProviders, providerAllowsCommand } from "../lib/providers";
import { supportsDictation } from "../lib/dictation";
import { atelierDictationAdapter } from "../lib/chat/assistantUiDictation";
import "../styles/assistant-ui.css";

export type AssistantUiChatProps = ComponentProps<typeof Chat>;
const identityMessage = (message: ThreadMessageLike) => message;
const messageText = (message: Pick<AppendMessage, "content">) => message.content
  .filter(part => part.type === "text").map(part => part.text).join("\n");

function sourceIndex(message: ThreadMessageLike | undefined): number | null {
  const value = message?.metadata?.custom?.atelier as { sourceEventIndex?: unknown } | undefined;
  return typeof value?.sourceEventIndex === "number" ? value.sourceEventIndex : null;
}

/** Native callbacks belong to the host; the action bar remains assistant-ui's. */
function AtelierMessageActions({ onFork, onTogglePin, onStylePin, pins }: Pick<AssistantUiChatProps, "onFork" | "onTogglePin" | "onStylePin" | "pins">) {
  const index = useAuiState(state => sourceIndex(state.message));
  const text = useAuiState(state => messageText(state.message));
  if (index == null) return null;
  return <>
    <TooltipIconButton tooltip="Créer une branche" aria-label="Créer une branche" onClick={() => onFork(index)}>
      <GitForkIcon />
    </TooltipIconButton>
    <AssistantUiPinnedMessageActions sourceIndex={index} text={text} pins={pins}
      onTogglePin={onTogglePin} onStylePin={onStylePin} />
  </>;
}

function AtelierUserActions(p: Pick<AssistantUiChatProps, "onRevert" | "onTogglePin" | "onStylePin" | "pins">) {
  const index = useAuiState(state => sourceIndex(state.message));
  const text = useAuiState(state => messageText(state.message));
  if (index == null) return null;
  return <>
    <TooltipIconButton tooltip="Revenir avant ce message" onClick={() => p.onRevert(index, text, false)}><Undo2Icon /></TooltipIconButton>
    <AssistantUiPinnedMessageActions sourceIndex={index} text={text} pins={p.pins}
      onTogglePin={p.onTogglePin} onStylePin={p.onStylePin} />
  </>;
}

/** Remount only at a conversation boundary, never for a streamed delta. */
export default function AssistantUiChat(props: AssistantUiChatProps) {
  return <AssistantUiConversation key={props.threadId ?? `new:${props.projectRoot ?? ""}`} {...props} />;
}

function AssistantUiConversation(p: AssistantUiChatProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const latest = useRef(p);
  latest.current = p;
  const [selection, setSelection] = useState(() => resolveChatModelSelection({ ...p, storage: localStorage }));
  const [promptQuery, setPromptQuery] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const selectionKey = chatModelStorageKey(p.threadId, p.projectRoot);
  useEffect(() => { persistChatModelSelection(localStorage, selectionKey, selection); }, [selectionKey, selection]);

  const projection = useMemo(() => projectAgentEventsToThreadMessages(p.events, {
    workingSince: p.workingSince, threadId: p.threadId,
  }), [p.events, p.workingSince, p.threadId]);
  const goalEvent = [...p.events].reverse().find(event => event.kind === "goal");
  const providerInfo = p.providers?.find(provider => provider.id === selection.provider);

  const models = useMemo<ModelOption[]>(() => {
    const providers = orderedVisibleProviders(p.providers ?? [], {
      providerOrder: p.defaults.providerOrder ?? [], hiddenProviders: p.defaults.hiddenProviders ?? [],
    }, selection.provider);
    const result = providers.flatMap(provider => {
      const ids = new Set([...provider.models, ...(p.defaults.customModels ?? [])
        .filter(model => model.provider === provider.id).map(model => model.id)]);
      if (provider.id === selection.provider && selection.model) ids.add(selection.model);
      return [...ids].map(model => {
        const effortLevels = assistantUiEffortLevels(provider, model);
        return {
          id: chatModelOptionId(provider.id, model),
          name: provider.modelLabels?.[model] ?? model,
          description: provider.label,
          keywords: [provider.id, model],
          disabled: !provider.ok && provider.id !== selection.provider,
          efforts: effortLevels.map(id => ({ id, name: assistantUiEffortLabel(id) })),
        };
      });
    });
    if (!result.some(option => option.id === chatModelOptionId(selection.provider, selection.model))) {
      result.push({ id: chatModelOptionId(selection.provider, selection.model), name: selection.model || selection.provider,
        description: selection.provider, keywords: [], disabled: false, efforts: [] });
    }
    return result;
  }, [p.providers, p.defaults, selection.provider, selection.model]);

  const [attachments] = useState(() => createAtelierAttachmentAdapter({
    attachments: p.attachments,
    onRestoreAttachment: (attachment, index) => latest.current.onRestoreAttachment?.(attachment, index),
    onRemoveAttachmentId: id => {
      const index = latest.current.attachments.findIndex((attachment, index) => draftAttachmentId(attachment, index) === id);
      if (index >= 0) latest.current.onRemoveAttachment(index);
    },
  }));
  attachments.syncDraftAttachments(p.attachments);

  const submit = (message: AppendMessage, mode = p.followUpMode ?? "queue") => {
    // Use the official composer's send snapshot: a newly attached file while
    // another upload resolves belongs to the next draft, not this message.
    const sentIds = new Set(message.attachments?.map(item => item.id) ?? []);
    const files = p.attachments.filter((item, index) => sentIds.has(draftAttachmentId(item, index)));
    const quote = message.metadata?.custom?.quote as { text?: unknown } | undefined;
    if (typeof quote?.text === "string" && quote.text.trim()) {
      files.push({ name: "Passage cité", text: quote.text, lines: null, kind: "quote" });
    }
    const snapshot = message.runConfig?.custom?.atelierSelection;
    const chosen = isChatModelSelection(snapshot) ? snapshot : selection;
    p.onSubmit(messageText(message), chosen.provider, chosen.model, chosen.effort,
      chosen.permissionMode, mode, chosen.fastMode, files);
  };
  // ExternalStoreRuntime compares adapters by identity. Keep the callbacks in
  // refs so App's inline host functions do not create a new adapter on every
  // rerender (which would synchronously notify every assistant-ui subscriber).
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const projectionRef = useRef(projection);
  projectionRef.current = projection;
  const queue = useMemo(() => createAtelierQueueAdapter({
    items: p.queuedTurns ?? [],
    submit: (message, mode) => submitRef.current(message, mode),
    mode: p.followUpMode ?? "queue",
    remove: id => latest.current.onRemoveQueued?.(id),
    steer: id => latest.current.onSteerQueued?.(id),
    reorder: (id, target) => latest.current.onReorderQueued?.(id, target),
    edit: id => latest.current.onEditQueued?.(id),
  }), [p.queuedTurns, p.followUpMode]);
  const runtimeAdapters = useMemo(() => ({
    attachments,
    dictation: supportsDictation() ? atelierDictationAdapter : undefined,
  }), [attachments]);
  const runtimeAdapter = useMemo(() => ({
    messages: projection.messages,
    convertMessage: identityMessage,
    isRunning: projection.isRunning,
    isSendDisabled: p.disabled,
    queue,
    adapters: runtimeAdapters,
    onNew: async (message: AppendMessage) => submitRef.current(message),
    onCancel: async () => latest.current.onStop(),
    onEdit: async (message: AppendMessage) => {
      const currentProjection = projectionRef.current;
      const original = currentProjection.messages.find(item => item.id === message.sourceId);
      const index = sourceIndex(original);
      if (index == null) throw new Error("Le message d’origine est introuvable.");
      const event = latest.current.events[index];
      if (!event) throw new Error("Le message d’origine est introuvable.");
      latest.current.onEditSend(index, event.kind === "user" ? event.text : "", messageText(message));
    },
    onReload: async (parentId: string | null) => {
      const currentProjection = projectionRef.current;
      const original = currentProjection.messages.find(item => item.id === parentId);
      const index = sourceIndex(original);
      const event = index == null ? null : latest.current.events[index];
      if (index == null || event?.kind !== "user") throw new Error("Le message à régénérer est introuvable.");
      latest.current.onEditSend(index, event.text, event.text);
    },
    onResumeToolCall: ({ payload }: { payload: unknown }) => {
      if (!isAssistantUiInteractionResumePayload(payload, latest.current.events)) {
        throw new Error("Cette demande n’est plus en attente ou la réponse est invalide.");
      }
      window.dispatchEvent(new CustomEvent("interaction-answer", {
        detail: { threadId: latest.current.threadId, requestId: payload.requestId, response: payload.response },
      }));
    },
    onRespondToToolApproval: async (decision: AssistantUiApprovalDecision) => {
      const request = [...latest.current.events].reverse().find(event =>
        (event.kind === "interaction" || event.kind === "permission") && event.requestId === decision.approvalId);
      const answer = assistantUiApprovalToInteractionResponse(decision, {
        fields: request?.kind === "interaction" ? request.fields : undefined,
      });
      if (!isAssistantUiInteractionResumePayload(answer, latest.current.events)) {
        throw new Error("Cette demande n’est plus en attente ou la réponse est invalide.");
      }
      window.dispatchEvent(new CustomEvent("interaction-answer", {
        detail: { threadId: latest.current.threadId, ...answer },
      }));
    },
  }), [projection.messages, projection.isRunning, p.disabled, queue, runtimeAdapters]);
  const runtime = useExternalStoreRuntime(runtimeAdapter);
  const observedComposerText = useRef<string | undefined>(undefined);

  useEffect(() => {
    runtime.thread.composer.setRunConfig({ custom: { atelierSelection: selection } });
  }, [runtime, selection]);

  useEffect(() => {
    const composer = runtime.thread.composer;
    const initialText = latest.current.draftText ?? "";
    if (composer.getState().text !== initialText) composer.setText(initialText);
    observedComposerText.current = composer.getState().text;
    return composer.subscribe(() => {
      const text = composer.getState().text;
      // Thread-runtime notifications also reach this subscriber when the
      // queue adapter changes. They do not mean that the user edited the
      // composer. Only propagate a value that changed since the last
      // composer snapshot; otherwise restoring a queued turn can briefly
      // write the old empty text back into the host draft.
      if (text === observedComposerText.current) return;
      observedComposerText.current = text;
      if (text !== latest.current.draftText) latest.current.onDraftTextChange?.(text);
    });
  }, [runtime]);
  useEffect(() => {
    if (p.draftText !== undefined && p.draftText !== runtime.thread.composer.getState().text) {
      runtime.thread.composer.setText(p.draftText);
    }
  }, [runtime, p.draftText]);
  useEffect(() => {
    if (!p.injectText) return;
    const composer = runtime.thread.composer;
    const current = composer.getState().text;
    composer.setText(current ? `${current}\n${p.injectText}` : p.injectText);
    p.onInjected();
  }, [runtime, p.injectText, p.onInjected]);
  useEffect(() => {
    const append = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.threadId !== undefined && detail.threadId !== latest.current.threadId) return;
      if (typeof detail?.text !== "string" || !detail.text.trim()) return;
      const composer = runtime.thread.composer;
      const current = composer.getState().text;
      composer.setText(current.trim() ? `${current.trimEnd()}\n${detail.text}` : detail.text);
      hostRef.current?.querySelector<HTMLTextAreaElement>(".aui-composer-input")?.focus();
    };
    window.addEventListener("chat-compose-append", append);
    return () => window.removeEventListener("chat-compose-append", append);
  }, [runtime]);
  const restoredIds = useRef(new Set<string>());
  useEffect(() => {
    const composer = runtime.thread.composer;
    const nextIds = new Set(p.attachments.map((item, index) => draftAttachmentId(item, index)));
    const previous = composer.getState().attachments;
    for (let index = previous.length - 1; index >= 0; index--) {
      const item = previous[index];
      if (restoredIds.current.has(item.id) && !nextIds.has(item.id)) void composer.getAttachmentByIndex(index).remove();
    }
    restoredIds.current = nextIds;
    const currentIds = new Set(composer.getState().attachments.map(item => item.id));
    p.attachments.forEach((attachment, index) => {
      const item = draftAttachmentToCompleteAttachment(attachment, index);
      if (!currentIds.has(item.id)) void composer.addAttachment(item);
    });
  }, [runtime, p.attachments]);

  useEffect(() => {
    const form = hostRef.current?.querySelector("form.aui-composer-root");
    if (!form) return;
    const sendContext = (event: Event) => {
      const send = (event as CustomEvent).detail?.send;
      if (typeof send !== "function") return;
      send(selection.provider, selection.model, selection.effort,
        selection.permissionMode, latest.current.followUpMode ?? "queue", selection.fastMode);
    };
    form.addEventListener("atelier-submit-context", sendContext);
    return () => form.removeEventListener("atelier-submit-context", sendContext);
  }, [selection]);

  return <div ref={hostRef} className="assistant-ui-host" data-atelier-chat
    onClick={event => {
      const anchor = (event.target as Element).closest?.("a[href]");
      if (anchor && handleAssistantUiLink(anchor.getAttribute("href") ?? "", anchor.textContent ?? "")) event.preventDefault();
    }} style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantUiThreadControls threadTitle={p.threadTitle} onNewChat={p.onNewChat}
        onOpenProject={p.onOpenProject} onToggleExpand={p.onToggleExpand} expanded={p.layout === "chat"}
        linkedAgents={p.linkedAgents} onOpenLinkedAgent={p.onOpenLinkedAgent} onUnlinkLinkedAgent={p.onUnlinkLinkedAgent} />
      <div style={{ flex: 1, minHeight: 0 }}>
      <AssistantUiData threadId={p.threadId} onOpenAgent={p.onOpenAgent} onAttachPath={p.onAttachPath} />
      <Thread components={{
        ToolFallback: AssistantUiInteraction,
        ...(p.home && p.threadId == null ? { Welcome: () => <AssistantUiHome home={p.home!} /> } : {}),
      }}
        onRemoveAttachment={id => {
          const index = p.attachments.findIndex((item, index) => draftAttachmentId(item, index) === id);
          if (index >= 0) p.onRemoveAttachment(index);
        }}
        composerControls={<>
          <AssistantUiComposerSuggestions commands={p.commands.filter(command => providerAllowsCommand(providerInfo, command))} files={p.files} recentFiles={p.recentFiles}
            zoteroItems={p.zoteroItems} agents={p.agentProviders}
            plugins={(providerInfo?.capabilities?.plugins ?? selection.provider === "codex") ? p.plugins : []} onAttachPath={p.onAttachPath}
            onAttachFolder={p.onAttachFolder} onAttachZotero={p.onAttachZotero} />
          <ModelSelector models={models}
          searchable={models.length > 8}
          value={chatModelOptionId(selection.provider, selection.model)}
          effort={selection.effort}
          onEffortChange={effort => setSelection(current => ({ ...current, effort }))}
          onValueChange={id => {
            const chosen = parseChatModelOptionId(id);
            if (!chosen) return;
            const previous = resolveChatModelSelection({ ...p, storage: localStorage, threadProvider: chosen.provider });
            const info = p.providers?.find(provider => provider.id === chosen.provider);
            const allowed = assistantUiEffortLevels(info, chosen.model);
            setSelection({ ...previous, ...chosen, effort: allowed.includes(previous.effort) ? previous.effort
              : info?.modelReasoning?.[chosen.model]?.default_effort ?? p.defaults.defaultEffort[chosen.provider] ?? "medium" });
          }} variant="ghost" size="sm" />
          {p.onKbChange && <AssistantUiKnowledgePicker binding={{ attached: p.kbSourceIds ?? [], fullContent: p.kbFullContent ?? [], onChange: p.onKbChange }} onOpenKnowledgeSurface={p.onOpenKnowledgeSurface} />}
          <Popover>
            <PopoverTrigger render={<TooltipIconButton tooltip="Options du chat" aria-label="Options du chat" />}><Settings2Icon /></PopoverTrigger>
            <PopoverContent side="top" align="end" className="tw:w-72 tw:max-w-[calc(100vw-2rem)]" data-chat-options>
              <AssistantUiComposerControls selection={selection} onSelectionChange={setSelection}
                usage={p.usage} contextResetKey={p.threadId ?? "new"}
                effortLevels={assistantUiEffortLevels(providerInfo, selection.model).map(key => ({
                  key, label: assistantUiEffortLabel(key),
                }))}
                permissionModes={p.providers?.find(provider => provider.id === selection.provider)?.capabilities?.permissionModes?.map(value => ({
                  value, label: ({ bypassPermissions: "Accès complet", acceptEdits: "Modifications autorisées", default: "Demander", plan: "Planification" } as Record<string, string>)[value] ?? value,
                }))} permissionModeLabel="Mode de permission" className="tw:flex-col tw:items-stretch" />
              {p.onGoal && <AssistantUiGoalControls goal={goalEvent?.kind === "goal" && !goalEvent.cleared ? goalEvent.goal : null}
                onGoal={p.onGoal} disabled={p.disabled} />}
              {p.onFavoriteModelsChange && <Button variant="ghost" size="sm" className="tw:justify-start"
                aria-pressed={p.defaults.favoriteModels?.[selection.provider]?.includes(selection.model) ?? false}
                onClick={() => {
                  const favorites = p.defaults.favoriteModels ?? {};
                  const current = favorites[selection.provider] ?? [];
                  p.onFavoriteModelsChange?.({ ...favorites, [selection.provider]: current.includes(selection.model)
                    ? current.filter(model => model !== selection.model) : [...current, selection.model] });
                }}><StarIcon data-icon="inline-start" />Modèle favori</Button>}
              {p.onOpenModelSettings && <Button variant="ghost" size="sm" className="tw:justify-start" onClick={p.onOpenModelSettings}>Réglages des modèles</Button>}
              {p.onFollowUpModeChange && <ToggleGroup
                aria-label="Envoi des prochains messages"
                value={[p.followUpMode ?? "queue"]}
                onValueChange={values => {
                  const mode = values[0];
                  if (mode === "queue" || mode === "steer") p.onFollowUpModeChange?.(mode);
                }} className="tw:w-full">
                <ToggleGroupItem value="queue" size="sm" variant="outline" className="tw:flex-1">En attente</ToggleGroupItem>
                <ToggleGroupItem value="steer" size="sm" variant="outline" className="tw:flex-1">Immédiat</ToggleGroupItem>
              </ToggleGroup>}
            </PopoverContent>
          </Popover>
          {p.consigneDuFil && (
            <span data-slot="assistant-ui-consigne-pill" aria-label="Consigne active"
              className="tw:text-muted-foreground tw:max-w-40 tw:truncate tw:rounded-full tw:border tw:px-2 tw:py-1 tw:text-xs">
              {nomConsigne(p.consigneDuFil, p.defaults.consignes)}
            </span>
          )}
          {p.onChoisirConsigne && <Popover>
            <PopoverTrigger render={<TooltipIconButton tooltip={nomConsigne(p.consigneDuFil, p.defaults.consignes)} aria-label="Consignes de réponse" />}><BookmarkIcon /></PopoverTrigger>
            <PopoverContent side="top" align="end" className="tw:w-96 tw:max-w-[90vw]">
              <PromptLibrary prompts={(p.defaults.consignes ?? []).map(item => ({ id: item.id, name: item.nom, body: item.texte, variables: [] }))}
                query={promptQuery} onQueryChange={setPromptQuery} selectedId={selectedPrompt} onSelect={setSelectedPrompt}
                onInsert={id => {
                  const item = p.defaults.consignes?.find(item => item.id === id);
                  if (item) p.onChoisirConsigne?.(basculerConsigne(p.consigneDuFil ?? null, { id, texte: item.texte }));
                }} />
              <Button variant="ghost" onClick={() => p.onChoisirConsigne?.(null)}>Désactiver les consignes du fil</Button>
              {p.onOuvrirReglagesConsignes && <Button variant="ghost" onClick={p.onOuvrirReglagesConsignes}>Modifier les consignes</Button>}
            </PopoverContent>
          </Popover>}
          {projection.isRunning && <ComposerPrimitive.Send render={<TooltipIconButton tooltip={p.followUpMode === "steer" ? "Envoyer maintenant" : "Mettre en attente"} aria-label="Envoyer le message de suivi" />}><ArrowUpIcon /></ComposerPrimitive.Send>}
        </>}
        userMessageActions={<AtelierUserActions onRevert={p.onRevert} onTogglePin={p.onTogglePin}
          pins={p.pins} onStylePin={p.onStylePin} />}
        messageActions={<AtelierMessageActions onFork={p.onFork} onTogglePin={p.onTogglePin}
          pins={p.pins} onStylePin={p.onStylePin} />}
        queue={!!p.queuedTurns?.length
          ? <MessageQueue running={p.threadTitle || "Conversation"} active={projection.isRunning}
            queued={p.queuedTurns.map(item => ({ id: item.id, text: item.prompt }))}
            onCancel={p.onRemoveQueued}
            renderActions={(item, index) => <>
              {p.onEditQueued && <TooltipIconButton tooltip="Modifier le message en attente" onClick={() => p.onEditQueued?.(item.id)}><PencilIcon /></TooltipIconButton>}
              {p.onSteerQueued && projection.isRunning && <TooltipIconButton tooltip="Envoyer maintenant" onClick={() => p.onSteerQueued?.(item.id)}><CornerUpLeftIcon /></TooltipIconButton>}
              {p.onReorderQueued && index > 0 && <TooltipIconButton tooltip="Monter dans la file" onClick={() => p.onReorderQueued?.(item.id, p.queuedTurns![index - 1].id)}><ArrowUpIcon /></TooltipIconButton>}
            </>} /> : undefined}
      />
      </div>
    </AssistantRuntimeProvider>
  </div>;
}
