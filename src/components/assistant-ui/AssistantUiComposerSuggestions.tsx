"use client";

import {
  ComposerCommandItem,
  ComposerMenu,
  ComposerMenuItem,
  ComposerPersonItem,
  type ComposerCommand,
  type ComposerPerson,
} from "./elements/composer-elements";
import { useAui, useAuiState } from "@assistant-ui/react";
import { pluginCanAttach, type PluginCatalogEntry } from "../../lib/plugins";
import { FileIcon, FolderIcon, LibraryIcon, SlashIcon, BoxIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent } from "react";

export type AssistantUiComposerCommand = {
  name: string;
  description?: string;
  source?: string;
  icon?: ComposerCommand["icon"];
};

export type AssistantUiComposerAgent = {
  id: string;
  label: string;
  role?: ComposerPerson["role"];
};

export type AssistantUiComposerZoteroItem = {
  key: string;
  title: string;
  creators?: string;
  year?: string;
  citeKey?: string;
};

export type AssistantUiComposerSuggestionsProps = {
  commands?: readonly AssistantUiComposerCommand[];
  files?: readonly string[];
  recentFiles?: readonly string[];
  zoteroItems?: readonly AssistantUiComposerZoteroItem[];
  agents?: readonly AssistantUiComposerAgent[];
  plugins?: readonly PluginCatalogEntry[];
  onCommand?: (command: AssistantUiComposerCommand) => void;
  onAttachPath?: (path: string) => void;
  onAttachFolder?: (folder: string) => void;
  onAttachZotero?: (key: string) => void;
  onAgentSelect?: (agent: AssistantUiComposerAgent) => void;
  className?: string;
};

export type ComposerSuggestion = {
  id: string;
  kind: "command" | "agent" | "plugin" | "file" | "recent-file" | "zotero" | "navigation";
  label: string;
  hint: string;
  section: string;
  insert: string;
  command?: AssistantUiComposerCommand;
  agent?: AssistantUiComposerAgent;
  path?: string;
  zoteroKey?: string;
};

export type ComposerSuggestionKeyAction =
  | { type: "move"; index: number }
  | { type: "select"; index: number }
  | { type: "dismiss" }
  | { type: "ignore" };

/** Keyboard contract kept pure so selection keys can never fall through to send. */
export function assistantUiComposerSuggestionKeyAction(
  key: string,
  activeIndex: number,
  count: number,
): ComposerSuggestionKeyAction {
  if (count <= 0) return { type: "ignore" };
  if (key === "ArrowDown") return { type: "move", index: (activeIndex + 1) % count };
  if (key === "ArrowUp") return { type: "move", index: (activeIndex - 1 + count) % count };
  if (key === "Enter" || key === "Tab") return { type: "select", index: Math.min(activeIndex, count - 1) };
  if (key === "Escape") return { type: "dismiss" };
  return { type: "ignore" };
}

type TriggerMatch = {
  kind: "slash" | "mention";
  query: string;
  start: number;
  end: number;
  prefix: string;
};

const SLASH_TRIGGER = /(^|\s)\/([\w:-]*)$/;
const MENTION_TRIGGER = /(^|\s)@([\w./:-]*)$/;

function triggerMatch(text: string): TriggerMatch | null {
  const slash = SLASH_TRIGGER.exec(text);
  if (slash) {
    return {
      kind: "slash",
      query: slash[2]?.toLowerCase() ?? "",
      start: slash.index + slash[1].length,
      end: text.length,
      prefix: text.slice(0, slash.index) + slash[1],
    };
  }
  const mention = MENTION_TRIGGER.exec(text);
  if (mention) {
    return {
      kind: "mention",
      query: mention[2]?.toLowerCase() ?? "",
      start: mention.index + mention[1].length,
      end: text.length,
      prefix: text.slice(0, mention.index) + mention[1],
    };
  }
  return null;
}

function basename(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).pop() ?? path;
}

function fileKind(path: string): "file" | "recent-file" {
  return path.length > 0 ? "file" : "recent-file";
}

/** Pure projection used by the component and by its keyboard tests. */
export function buildAssistantUiComposerSuggestions(
  text: string,
  props: Pick<
    AssistantUiComposerSuggestionsProps,
    "commands" | "files" | "recentFiles" | "zoteroItems" | "agents" | "plugins"
  >,
): ComposerSuggestion[] {
  const trigger = triggerMatch(text);
  if (!trigger) return [];
  const base = trigger.prefix;
  if (trigger.kind === "slash") {
    return (props.commands ?? [])
      .filter((command) => command.name.toLowerCase().includes(trigger.query))
      .slice(0, 12)
      .map((command) => ({
        id: `command:${command.name}`,
        kind: "command" as const,
        label: `/${command.name}`,
        hint: command.description ?? command.source ?? "",
        section: "Commandes",
        insert: `${base}/${command.name} `,
        command,
      }));
  }

  const query = trigger.query;
  const suggestions: ComposerSuggestion[] = [];
  for (const plugin of props.plugins ?? []) {
    if (!pluginCanAttach(plugin) || !`${plugin.name} ${plugin.displayName}`.toLowerCase().includes(query)) continue;
    suggestions.push({ id: `plugin:${plugin.id}`, kind: "plugin", label: `@${plugin.name}`,
      hint: plugin.displayName, section: "Intégrations", insert: `${base}@${plugin.name} ` });
  }
  const addAgent = query.startsWith("zotero") || query.startsWith("recent") || query === ""
    ? (props.agents ?? [])
    : (props.agents ?? []);
  for (const agent of addAgent) {
    if (!agent.label.toLowerCase().includes(query) && !agent.id.toLowerCase().includes(query)) continue;
    suggestions.push({
      id: `agent:${agent.id}`,
      kind: "agent",
      label: `@${agent.label}`,
      hint: "Agent lié",
      section: "Agents",
      insert: `${base}@${agent.label} `,
      agent,
    });
  }

  if ("recent".startsWith(query) || query.startsWith("recent")) {
    if (query === "" || query === "recent") {
      suggestions.push({
        id: "navigation:recent",
        kind: "navigation",
        label: "@recent",
        hint: "Parcourir les fichiers récents",
        section: "Raccourcis",
        insert: `${base}@recent:`,
      });
    }
    const recentQuery = query.startsWith("recent:") ? query.slice("recent:".length) : "";
    for (const path of props.recentFiles ?? []) {
      if (recentQuery && !path.toLowerCase().includes(recentQuery)) continue;
      suggestions.push({
        id: `recent-file:${path}`,
        kind: "recent-file",
        label: basename(path),
        hint: path,
        section: "Fichiers récents",
        insert: `${base}@${path} `,
        path,
      });
    }
  }

  if ("zotero".startsWith(query) || query.startsWith("zotero")) {
    if (query === "" || query === "zotero") {
      suggestions.push({
        id: "navigation:zotero",
        kind: "navigation",
        label: "@zotero",
        hint: "Chercher dans Zotero",
        section: "Raccourcis",
        insert: `${base}@zotero:`,
      });
    }
    const zoteroQuery = query.startsWith("zotero:") ? query.slice("zotero:".length) : "";
    const terms = zoteroQuery.split(/\s+/u).filter(Boolean);
    for (const item of props.zoteroItems ?? []) {
      const haystack = `${item.title} ${item.creators ?? ""} ${item.year ?? ""} ${item.citeKey ?? ""} ${item.key}`.toLowerCase();
      if (terms.length && !terms.every((term) => haystack.includes(term))) continue;
      const label = item.citeKey ? `@${item.citeKey}` : `@${item.key}`;
      suggestions.push({
        id: `zotero:${item.key}`,
        kind: "zotero",
        label,
        hint: [item.title, item.year].filter(Boolean).join(" · "),
        section: "Zotero",
        insert: `${base}${label} `,
        zoteroKey: item.key,
      });
    }
  }

  const seen = new Set<string>();
  for (const path of [...(props.files ?? [])]) {
    if (seen.has(path) || !path.toLowerCase().includes(query)) continue;
    seen.add(path);
    suggestions.push({
      id: `file:${path}`,
      kind: fileKind(path),
      label: basename(path),
      hint: path,
      section: "Fichiers",
      insert: `${base}@${path} `,
      path,
    });
  }
  return suggestions.slice(0, 32);
}

/** Replace only the trigger token, preserving the rest of a draft. */
export function replaceAssistantUiComposerToken(
  text: string,
  suggestion: ComposerSuggestion,
): string {
  const match = triggerMatch(text);
  // Each projected entry already carries the untouched prefix (`base`) so the
  // same replacement works when the trigger follows prose or starts the draft.
  if (!match) return suggestion.insert;
  return suggestion.insert;
}

function toOfficialCommand(command: AssistantUiComposerCommand): ComposerCommand {
  return {
    name: command.name,
    description: command.description ?? command.source ?? "",
    icon: command.icon ?? SlashIcon,
  };
}

function toOfficialPerson(agent: AssistantUiComposerAgent): ComposerPerson {
  return { name: agent.label, role: agent.role ?? "agent" };
}

/**
 * Official ComposerMenu composition for Atelier's slash and @-mention data.
 * The component never owns a second input: it observes the assistant-ui
 * composer state and writes selections through `aui.composer.setText`.
 */
export function AssistantUiComposerSuggestions({
  commands,
  files,
  recentFiles,
  zoteroItems,
  agents,
  plugins,
  onCommand,
  onAttachPath,
  onAttachFolder,
  onAttachZotero,
  onAgentSelect,
  className,
}: AssistantUiComposerSuggestionsProps) {
  const aui = useAui();
  const text = useAuiState((state) => state.composer.text);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedTrigger, setDismissedTrigger] = useState<string | null>(null);
  const suggestions = useMemo(
    () => buildAssistantUiComposerSuggestions(text, { commands, files, recentFiles, zoteroItems, agents, plugins }),
    [agents, commands, files, recentFiles, text, zoteroItems, plugins],
  );
  const trigger = triggerMatch(text);
  const triggerKey = trigger ? `${trigger.kind}:${trigger.start}:${trigger.query}` : null;
  const visibleSuggestions = triggerKey === dismissedTrigger ? [] : suggestions;
  const open = visibleSuggestions.length > 0;

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, visibleSuggestions.length - 1)));
  }, [visibleSuggestions.length, triggerKey]);
  useEffect(() => {
    if (!triggerKey || triggerKey !== dismissedTrigger) setDismissedTrigger(null);
  }, [dismissedTrigger, triggerKey]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const inputs = [...document.querySelectorAll<HTMLTextAreaElement>(".aui-composer-input")];
    const handlers = inputs.map((input) => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (document.activeElement !== input || visibleSuggestions.length === 0) return;
        const action = assistantUiComposerSuggestionKeyAction(event.key, activeIndex, visibleSuggestions.length);
        if (action.type === "move") {
          event.preventDefault();
          event.stopPropagation();
          setActiveIndex(action.index);
        } else if (action.type === "dismiss") {
          event.preventDefault();
          event.stopPropagation();
          setDismissedTrigger(triggerKey);
        } else if (action.type === "select") {
          event.preventDefault();
          event.stopPropagation();
          void selectSuggestion(visibleSuggestions[action.index] ?? visibleSuggestions[0]);
        }
      };
      input.addEventListener("keydown", onKeyDown, true);
      return () => input.removeEventListener("keydown", onKeyDown, true);
    });
    return () => handlers.forEach((dispose) => dispose());
    // The selection callback is defined below but is stable for this effect's
    // current render; the listener is intentionally rebuilt with the menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open, triggerKey, visibleSuggestions]);

  async function selectSuggestion(suggestion: ComposerSuggestion): Promise<void> {
    setDismissedTrigger(null);
    if (suggestion.kind === "command" && suggestion.command) {
      onCommand?.(suggestion.command);
      aui.composer.setText(replaceAssistantUiComposerToken(text, suggestion));
      setActiveIndex(0);
      return;
    }
    if (suggestion.kind === "agent" && suggestion.agent) {
      onAgentSelect?.(suggestion.agent);
      aui.composer.setText(replaceAssistantUiComposerToken(text, suggestion));
      setActiveIndex(0);
      return;
    }
    if (suggestion.kind === "zotero" && suggestion.zoteroKey) {
      onAttachZotero?.(suggestion.zoteroKey);
      aui.composer.setText(text.replace(/(^|\s)@[\w./:-]*$/u, "$1"));
      setActiveIndex(0);
      return;
    }
    if ((suggestion.kind === "file" || suggestion.kind === "recent-file") && suggestion.path) {
      if (suggestion.path.endsWith("/")) onAttachFolder?.(suggestion.path.slice(0, -1));
      else onAttachPath?.(suggestion.path);
      aui.composer.setText(text.replace(/(^|\s)@[\w./:-]*$/u, "$1"));
      setActiveIndex(0);
      return;
    }
    aui.composer.setText(replaceAssistantUiComposerToken(text, suggestion));
    setActiveIndex(0);
  }

  return (
    <ComposerMenu
      open={open}
      className={className}
      role="listbox"
      aria-label="Suggestions"
    >
      {visibleSuggestions.map((suggestion, index) => {
        const active = index === activeIndex;
        const onMouseDown = (event: ReactKeyboardEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>) => {
          event.preventDefault();
          void selectSuggestion(suggestion);
        };
        if (suggestion.kind === "command" && suggestion.command) {
          return <ComposerCommandItem key={suggestion.id} command={toOfficialCommand(suggestion.command)} active={active} onMouseDown={onMouseDown} role="option" aria-selected={active} />;
        }
        if (suggestion.kind === "agent" && suggestion.agent) {
          return <ComposerPersonItem key={suggestion.id} person={toOfficialPerson(suggestion.agent)} active={active} onMouseDown={onMouseDown} role="option" aria-selected={active} />;
        }
        const Icon: ComponentType<{ className?: string }> = suggestion.kind === "plugin" ? BoxIcon : suggestion.kind === "zotero" ? LibraryIcon : suggestion.kind === "navigation" ? FolderIcon : FileIcon;
        return (
          <ComposerMenuItem key={suggestion.id} active={active} onMouseDown={onMouseDown} role="option" aria-selected={active}>
            <Icon className="tw:text-foreground/35 tw:size-3.5 tw:shrink-0" />
            <span className="tw:flex-1 tw:truncate tw:text-start">{suggestion.label}</span>
            <span className="tw:text-foreground/40 tw:max-w-44 tw:truncate tw:text-start tw:text-xs">{suggestion.hint}</span>
          </ComposerMenuItem>
        );
      })}
    </ComposerMenu>
  );
}
