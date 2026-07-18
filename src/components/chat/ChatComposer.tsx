// ChatComposer (plan 015, slice 5 ; API regroupée en revue — correction 3) :
// orchestration du composer. Composition pure — tout l'état vit chez Chat,
// passé en QUELQUES bundles typés par domaine (au lieu de ~50 props à plat) :
// input · model · menus · catalog · context · host.
import React, { useEffect, type MutableRefObject } from "react";
import { t } from "../../lib/i18n";
import { ProviderInfo } from "../../lib/providers";
import { ContextShelf, type ShelfAttachment } from "./ContextShelf";
import { type KbBinding } from "./KbPicker";
import { SuggestionsList, PromptTextarea, type Suggestion } from "./PromptInput";
import { ComposerControls } from "./ComposerControls";
import { GoalBar, GoalGlyph, type GoalInfo } from "./GoalBar";
import { InputGroup, InputGroupAddon } from "../shadcn/input-group";
import { Input } from "../shadcn/input";
import { Field, FieldLabel } from "../shadcn/field";
import { ButtonGroup } from "../shadcn/button-group";
import { Button } from "../ui/Button";
import { parseNativeSlashCommand, permissionModeFromSlash } from "../../lib/slashCommands";
import type { FollowUpMode } from "../../lib/chatDraftStore";

type ModelEntry = { id: string; label: string };
type Dispatch<T> = React.Dispatch<React.SetStateAction<T>>;

/** Saisie et suggestions. */
export type ComposerInput = {
  text: string;
  setText: Dispatch<string>;
  taRef: MutableRefObject<HTMLTextAreaElement | null>;
  suggestions: Suggestion[];
  selIdx: number;
  setSelIdx: Dispatch<number>;
  applySuggestion: (s: Suggestion) => void;
  commands: { name: string; source: string }[];
  onPasteImage: (dataURL: string) => void;
  onPasteText: (text: string) => void;
};

/** Sélection provider / modèle / effort / permissions. */
export type ComposerModel = {
  provider: string;
  setProvider: (v: string) => void;
  model: string;
  setModel: Dispatch<string>;
  effort: string;
  setEffort: (v: string) => void;
  permissionMode: string;
  setPermissionMode: Dispatch<string>;
};

/** États d'ouverture des menus/popovers + éditeur d'objectif. */
export type ComposerMenus = {
  plusOpen: boolean;
  setPlusOpen: Dispatch<boolean>;
  menuOpen: boolean;
  setMenuOpen: Dispatch<boolean>;
  effortOpen: boolean;
  setEffortOpen: Dispatch<boolean>;
  goalOpen: boolean;
  setGoalOpen: Dispatch<boolean>;
  goalText: string;
  setGoalText: Dispatch<string>;
};

/** Catalogues et helpers de résolution modèle/effort (closures Chat). */
export type ComposerCatalog = {
  providerInfo: (pv?: string) => ProviderInfo | undefined;
  resolvedModelId: (pv?: string, modelId?: string) => string;
  autoReasoningLabel: (info: ProviderInfo | undefined, modelId: string) => string;
  levelsFor: (pv: string, modelId: string) => string[];
  effortFor: (pv: string, modelId: string) => string;
  modelsFor: (pv: string) => ModelEntry[];
  sortByFav: (models: ModelEntry[], pv: string) => ModelEntry[];
  modelLabel: (m: ModelEntry, pv: string) => string;
  modelButtonLabel: string;
  favModels: string[];
  toggleFavModel: (key: string) => void;
  attachFiles: () => void;
};

/** Contexte joint (ContextShelf). */
export type ComposerContextBundle = {
  attachments: ShelfAttachment[];
  onRemoveAttachment: (index: number) => void;
  onOpenPaste: (paste: { name: string; text: string }) => void;
};

/** Base de connaissances (plan 049 T3) — attache par conversation. */
export type ComposerKbBundle = KbBinding;

/** État hôte : envoi, usage, disabled, réglages par défaut. */
export type ComposerHost = {
  usage: { context: number; output: number; cost: number | null; turns: number | null; window?: number | null } | null;
  disabled: boolean;
  workingSince: number | null;
  onStop: () => void;
  onSubmit: (prompt: string, provider: string, model: string, effort: string, permissionMode: string, mode: "steer" | "queue") => void;
  followUpMode: FollowUpMode;
  onFollowUpModeChange?: (mode: FollowUpMode) => void;
  onGoal?: (action: "set" | "clear", objective?: string, status?: "active" | "paused") => void;
  /** goal Codex actif (dernier événement goal non-cleared) — pilote la barre épinglée */
  activeGoal?: GoalInfo | null;
  defaults: { autoReview?: { enabled: boolean }; providerOrder?: string[]; hiddenProviders?: string[] };
  onOpenModelSettings?: () => void;
};

export function ChatComposer(props: {
  input: ComposerInput;
  model: ComposerModel;
  menus: ComposerMenus;
  catalog: ComposerCatalog;
  context: ComposerContextBundle;
  host: ComposerHost;
  kb?: ComposerKbBundle;
}) {
  const { input, model, menus, catalog, context, host, kb } = props;
  const { text, setText } = input;
  const { goalOpen, goalText, setGoalText, setGoalOpen } = menus;
  const hasContent = Boolean(text.trim()) || context.attachments.length > 0;
  // un goal actif rend l'éditeur de création inerte : referme l'état goalOpen
  // pour que l'éditeur ne surgisse pas au moment où le goal sera arrêté
  useEffect(() => { if (host.activeGoal) setGoalOpen(false); }, [host.activeGoal, setGoalOpen]);

  // reconstruit le contrat plat attendu par ComposerControls à partir des
  // bundles — plumbing local, aucune logique
  const controlsProps = {
    hasContent,
    ...model, ...menus, ...catalog, ...host,
    kb,
  };

  function resolvedFollowUpMode(): FollowUpMode {
    const capabilities = catalog.providerInfo(model.provider)?.capabilities;
    const queueSupported = capabilities?.queue !== false;
    const steeringSupported = capabilities?.steering !== false;
    if (host.followUpMode === "steer" && steeringSupported) return "steer";
    if (queueSupported) return "queue";
    return "steer";
  }

  function alternateFollowUpMode(): FollowUpMode {
    const capabilities = catalog.providerInfo(model.provider)?.capabilities;
    const preferred = resolvedFollowUpMode();
    if (preferred === "queue" && capabilities?.steering !== false) return "steer";
    if (preferred === "steer" && capabilities?.queue !== false) return "queue";
    return preferred;
  }

  function submit(mode: FollowUpMode) {
    const prompt = text.trim();
    if (!hasContent) return;
    const command = parseNativeSlashCommand(prompt);
    if (command?.name === "model") {
      const requested = command.args.toLowerCase();
      const match = requested
        ? catalog.modelsFor(model.provider).find((entry) =>
            entry.id.toLowerCase() === requested || entry.label.toLowerCase() === requested)
        : null;
      if (match) {
        model.setModel(match.id);
        model.setEffort(catalog.effortFor(model.provider, match.id));
      } else {
        menus.setEffortOpen(false);
        menus.setMenuOpen(true);
      }
      setText("");
      return;
    }
    if (command?.name === "permissions") {
      const requested = permissionModeFromSlash(command.args);
      if (requested) model.setPermissionMode(requested);
      else requestAnimationFrame(() => {
        document.querySelector<HTMLButtonElement>(".composer .custom-select-trigger")?.click();
      });
      setText("");
      return;
    }
    if (command?.name === "plan") {
      model.setPermissionMode("plan");
      if (command.args) {
        host.onSubmit(command.args, model.provider, model.model, model.effort, "plan", mode);
      }
      setText("");
      return;
    }
    host.onSubmit(text, model.provider, model.model, model.effort, model.permissionMode, mode);
    setText("");
  }

  return (
      <form
        className="composer"
        onSubmit={(ev) => {
          ev.preventDefault();
          submit(host.workingSince != null ? resolvedFollowUpMode() : "steer");
        }}
      >
        <InputGroup className="composer-input-group">
          {host.activeGoal && host.onGoal && (
            <GoalBar goal={host.activeGoal} onGoal={host.onGoal} onStop={host.onStop} />
          )}
          {goalOpen && !host.activeGoal && (
            <Field className="goal-editor" onClick={(ev) => ev.stopPropagation()}>
              <div className="goal-editor-head">
                <GoalGlyph />
                <FieldLabel className="goal-editor-title">{t("goal.editor-title")}</FieldLabel>
                <span className="goal-editor-hint">{t("goal.editor-hint")}</span>
              </div>
              <Input
                autoFocus
                value={goalText}
                onChange={(ev) => setGoalText(ev.target.value)}
                placeholder={t("goal.placeholder")}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") {
                    ev.preventDefault();
                    if (goalText.trim()) host.onGoal?.("set", goalText.trim());
                    setGoalOpen(false);
                    setGoalText("");
                  }
                  if (ev.key === "Escape") setGoalOpen(false);
                }}
              />
              <ButtonGroup className="goal-editor-actions">
                <Button type="button" variant="ghost" className="ghost" onClick={() => setGoalOpen(false)}>{t("action.cancel")}</Button>
                <Button type="button" variant="ghost" className="ghost goal-bar-save" onClick={() => {
                  if (goalText.trim()) host.onGoal?.("set", goalText.trim());
                  setGoalOpen(false);
                  setGoalText("");
                }}>{t("goal.set")}</Button>
              </ButtonGroup>
            </Field>
          )}
          <SuggestionsList suggestions={input.suggestions} selIdx={input.selIdx} applySuggestion={input.applySuggestion} />
          <ContextShelf
            attachments={context.attachments}
            onRemoveAttachment={context.onRemoveAttachment}
            onOpenPaste={context.onOpenPaste}
          />
          {/* plan 050 : plus de pilules KB au-dessus du champ — le badge du
              livre porte le compte, son survol les titres, la méta sous
              chaque message la trace ; les pilules éphémères (citations,
              images) restent dans le ContextShelf ci-dessus. */}
          <PromptTextarea
            text={input.text}
            setText={input.setText}
            taRef={input.taRef}
            suggestions={input.suggestions}
            selIdx={input.selIdx}
            setSelIdx={input.setSelIdx}
            applySuggestion={input.applySuggestion}
            commands={input.commands}
            workingSince={host.workingSince}
            disabled={host.disabled}
            onStop={host.onStop}
            onAlternateSubmit={host.workingSince != null ? () => submit(alternateFollowUpMode()) : undefined}
            onPasteImage={input.onPasteImage}
            onPasteText={input.onPasteText}
          />
          <InputGroupAddon align="block-end" className="composer-input-actions">
            <ComposerControls {...controlsProps} />
          </InputGroupAddon>
        </InputGroup>
      </form>
  );
}
