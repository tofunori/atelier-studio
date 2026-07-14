import type { ChatItem } from "./store/types.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible.tsx";
import { Item, ItemContent, ItemGroup, ItemHeader, ItemTitle } from "@/components/ui/item.tsx";
import { cn } from "@/lib/utils.ts";
import { CheckCircleIcon, ChevronDownIcon, CircleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { WorkingStatus } from "./WorkingStatus.tsx";

export const ACTIVITY_KINDS = new Set<ChatItem["kind"]>([
  "thinking",
  "thinking_live",
  "tool",
  "edit",
  "todos",
  "goal",
]);

function commandFrom(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const value = input as Record<string, unknown>;
  for (const key of ["command", "cmd", "script", "path", "file_path", "skill", "skill_name"]) {
    if (typeof value[key] === "string" && value[key]) return value[key];
  }
  return "";
}

function itemLabel(item: ChatItem): string {
  if (item.kind === "thinking" || item.kind === "thinking_live") return "Réflexion";
  if (item.kind === "edit") return "Fichiers modifiés";
  if (item.kind === "todos") return "Plan de travail";
  if (item.kind === "goal") return "Objectif";
  if (/^__?thinking$/i.test(item.toolName ?? "")) return "Réflexion";
  if (/^__?goal$/i.test(item.toolName ?? "")) return "Objectif";
  const skill = commandFrom(item.toolInput);
  if (/skill/i.test(item.toolName ?? "") && skill) return `Skill · ${skill}`;
  return item.toolName || "Outil";
}

function statusLabel(items: ChatItem[]): string {
  const running = [...items].reverse().find(
    (item) => item.kind === "thinking_live" || item.toolStatus === "running",
  );
  if (running?.kind === "thinking_live") return "Réfléchit…";
  if (running) return `Exécute ${itemLabel(running)}…`;
  return `Activité · ${items.length} étape${items.length > 1 ? "s" : ""}`;
}

function durationLabel(items: ChatItem[]): string {
  const total = items.reduce((sum, item) => sum + (item.toolDurationMs ?? 0), 0);
  if (!total) return "";
  return total < 1000 ? `${total} ms` : `${(total / 1000).toFixed(total < 10_000 ? 1 : 0)} s`;
}

export function AgentActivity({ items }: { items: ChatItem[] }) {
  const failed = items.some((item) => item.toolStatus === "failed" || (item.toolExitCode ?? 0) !== 0);
  const running = items.some((item) => item.kind === "thinking_live" || item.toolStatus === "running");
  const activeCommand = commandFrom(
    [...items].reverse().find(
      (item) => item.kind === "thinking_live" || item.toolStatus === "running",
    )?.toolInput,
  );
  const [open, setOpen] = useState(failed || running);
  useEffect(() => {
    if (failed || running) {
      setOpen(true);
      return;
    }
    const timer = window.setTimeout(() => setOpen(false), 900);
    return () => window.clearTimeout(timer);
  }, [failed, running]);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="agent-activity"
      data-running={running ? "1" : "0"}
      data-failed={failed ? "1" : "0"}
    >
      <CollapsibleTrigger
        render={<Button type="button" variant="ghost" className="agent-activity-trigger" />}
      >
        {running ? (
          <WorkingStatus label={statusLabel(items)} className="agent-activity-live" />
        ) : (
          <>
            {failed ? <CircleAlertIcon data-icon="inline-start" /> : <CheckCircleIcon data-icon="inline-start" />}
            <span className="min-w-0 flex-1 truncate text-left">{statusLabel(items)}</span>
          </>
        )}
        {activeCommand && (
          <Badge variant="outline" className="max-w-28 truncate font-mono">
            {activeCommand}
          </Badge>
        )}
        {durationLabel(items) && <Badge variant="secondary">{durationLabel(items)}</Badge>}
        <ChevronDownIcon data-icon="inline-end" className={cn("transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="agent-activity-panel">
        <ItemGroup className="agent-activity-steps">
        {items.map((item) => {
          const command = commandFrom(item.toolInput);
          return (
            <Item variant="muted" size="sm" key={item.id} data-state={item.toolStatus ?? "done"}>
              <ItemHeader>
                <ItemTitle>{itemLabel(item)}</ItemTitle>
                {item.toolExitCode != null && (
                  <Badge variant={item.toolExitCode === 0 ? "secondary" : "destructive"}>exit {item.toolExitCode}</Badge>
                )}
              </ItemHeader>
              <ItemContent>
              {(command || item.toolDetail) && <code className="agent-step-command">{command || item.toolDetail}</code>}
              {item.kind === "edit" && item.files?.length ? (
                <ul className="agent-files">
                  {item.files.map((file) => (
                    <li key={file.path}><span>{file.path}</span><small>+{file.add ?? 0} −{file.del ?? 0}</small></li>
                  ))}
                </ul>
              ) : item.kind === "todos" && item.todos?.length ? (
                <ul className="agent-todos">
                  {item.todos.map((todo, index) => <li key={`${todo.content}-${index}`} data-status={todo.status}>{todo.content || todo.activeForm}</li>)}
                </ul>
              ) : item.text ? (
                <pre className="agent-step-output">{item.text}</pre>
              ) : null}
              {item.toolTruncated && <Badge variant="outline">Sortie abrégée</Badge>}
              </ItemContent>
            </Item>
          );
        })}
        </ItemGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}
