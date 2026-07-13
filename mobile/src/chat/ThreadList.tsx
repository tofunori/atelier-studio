import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer.tsx";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty.tsx";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item.tsx";
import { PlusIcon, RefreshCwIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { ThreadSummary } from "../transport/types.ts";
import { CHAT_PROVIDERS, modelLabel, providerLabel } from "./providerCatalog.ts";

type Props = {
  threads: ThreadSummary[];
  loading: boolean;
  error: string | null;
  onOpen: (id: string) => void;
  onRefresh: () => void;
  onCreate: (body: { title: string; provider: string; model: string }) => Promise<void>;
  creating: boolean;
};

const ACTIVE_STATUSES = new Set(["running", "thinking", "streaming", "pending", "working"]);
const ERROR_STATUSES = new Set(["error", "failed"]);

function humanizePathSegment(value: string): string {
  const clean = value
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "Conversation";
  if (clean === clean.toUpperCase()) return clean;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function threadDisplayTitle(title: string, id: string): string {
  const clean = title.trim();
  if (!clean || clean === id) return "Conversation";

  const looksLikePath =
    clean.startsWith("/") ||
    clean.startsWith("~/") ||
    (!clean.includes(": ") && clean.split("/").length >= 3);
  if (!looksLikePath) return clean;

  const segments = clean.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean);
  return humanizePathSegment(segments.at(-1) ?? clean);
}

export function relativeThreadDate(value: string, now = Date.now()): string | null {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const elapsed = Math.max(0, now - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} j`;
  return new Intl.DateTimeFormat("fr-CA", {
    day: "numeric",
    month: "short",
    year: new Date(timestamp).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  }).format(timestamp);
}

function threadState(status: string): { label: string; tone: "active" | "error" } | null {
  const normalized = status.toLowerCase();
  if (ACTIVE_STATUSES.has(normalized)) return { label: "En cours", tone: "active" };
  if (ERROR_STATUSES.has(normalized)) return { label: "Erreur", tone: "error" };
  return null;
}

export function ThreadList(p: Props) {
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [provider, setProvider] = useState(CHAT_PROVIDERS[0].id);
  const selectedProvider = CHAT_PROVIDERS.find((item) => item.id === provider) ?? CHAT_PROVIDERS[0];
  const [model, setModel] = useState(selectedProvider.defaultModel);

  const providerItems = useMemo(
    () => CHAT_PROVIDERS.map((item) => ({ label: item.label, value: item.id })),
    [],
  );
  const modelItems = useMemo(
    () => selectedProvider.models.map((value) => ({ label: modelLabel(value), value })),
    [selectedProvider],
  );

  const chooseProvider = (id: string) => {
    const next = CHAT_PROVIDERS.find((item) => item.id === id) ?? CHAT_PROVIDERS[0];
    setProvider(next.id);
    setModel(next.defaultModel);
  };

  const submitNewChat = async () => {
    await p.onCreate({ title: "", provider, model });
    setNewChatOpen(false);
  };

  return (
    <div className="screen">
      <div className="thread-list-header">
        <h1 className="screen-title">Chats</h1>
        <div className="thread-list-actions">
          <Button
            type="button"
            size="icon-lg"
            aria-label="Nouveau chat"
            onClick={() => setNewChatOpen(true)}
            disabled={p.creating}
          >
            {p.creating ? <Spinner /> : <PlusIcon />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label="Actualiser"
            onClick={p.onRefresh}
            disabled={p.loading}
          >
            {p.loading ? <Spinner /> : <RefreshCwIcon />}
          </Button>
        </div>
      </div>

      {p.error && (
        <Alert variant="destructive">
          <AlertDescription>{p.error}</AlertDescription>
        </Alert>
      )}
      {p.loading && p.threads.length === 0 && (
        <Empty>
          <EmptyHeader>
            <Spinner />
            <EmptyTitle>Chargement des conversations…</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
      {!p.loading && p.threads.length === 0 && !p.error && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Aucune conversation</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}

      <ItemGroup className="thread-list">
        {p.threads.map((t) => {
          const date = relativeThreadDate(t.updatedAt);
          const state = threadState(t.status);
          const agent = `${providerLabel(t.provider)}${t.model ? ` · ${modelLabel(t.model)}` : ""}`;
          return (
            <Item
              key={t.id}
              className="thread-row"
              data-status={state?.tone ?? "idle"}
              render={<button type="button" onClick={() => p.onOpen(t.id)} />}
              variant="default"
              size="sm"
            >
              <ItemContent>
                <ItemTitle className="thread-row-title">
                  {threadDisplayTitle(t.title, t.id)}
                </ItemTitle>
                <ItemDescription className="thread-row-meta">
                  <span className="thread-row-agent">{agent}</span>
                  {state && (
                    <span className="thread-row-state" data-tone={state.tone}>
                      {state.label}
                    </span>
                  )}
                  {!state && date && <span className="thread-row-date">{date}</span>}
                </ItemDescription>
              </ItemContent>
            </Item>
          );
        })}
      </ItemGroup>

      <Drawer
        open={newChatOpen}
        onOpenChange={(open) => {
          if (!p.creating) setNewChatOpen(open);
        }}
        showSwipeHandle
      >
        <DrawerContent className="max-h-[calc(100dvh-1rem)]">
          <DrawerHeader>
            <DrawerTitle>Nouveau chat</DrawerTitle>
            <DrawerDescription>Choisissez l’agent et son modèle.</DrawerDescription>
          </DrawerHeader>

          <FieldGroup className="gap-3 px-4 py-4">
            <Field>
              <FieldLabel htmlFor="new-chat-provider">Agent</FieldLabel>
              <Select
                items={providerItems}
                value={provider}
                onValueChange={(value) => {
                  if (value) chooseProvider(value);
                }}
              >
                <SelectTrigger id="new-chat-provider" className="w-full" aria-label={`Provider : ${selectedProvider.label}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {providerItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="new-chat-model">Modèle</FieldLabel>
              <Select
                items={modelItems}
                value={model}
                onValueChange={(value) => {
                  if (value) setModel(value);
                }}
              >
                <SelectTrigger id="new-chat-model" className="w-full" aria-label={`Modèle : ${modelLabel(model)}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {modelItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          <DrawerFooter>
            <Button type="button" size="lg" onClick={() => void submitNewChat()} disabled={p.creating}>
              {p.creating && <Spinner data-icon="inline-start" />}
              {p.creating ? "Création…" : `Créer avec ${selectedProvider.label}`}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
