// Construction d'un tour envoyé au fournisseur : prompt complet, bulle
// utilisateur optimiste, événement archivable et entrées structurées. Partagé
// par l'envoi direct du composer et par le vidage de la file d'attente, pour
// que les deux chemins produisent le même tour.
import type { DraftAttachment } from "./chatDraftStore";
import type { ProviderCapabilities } from "./providers";
import type { PluginSkill } from "./plugins";
import { skillAttachInstruction, type CatalogSkill } from "./skills";
import type { SendOptions, UserDisplayEvent } from "./ws";

type Attachment = DraftAttachment;
type TurnInputs = NonNullable<SendOptions["inputs"]>;

/** Pièces jointes (annotation, sélection atelier…) préfixées au prompt envoyé. */
export function promptWithAttachments(prompt: string, attachments: Attachment[]): string {
  return attachments.length
    ? `${attachments.map((a) => a.text).join("\n\n")}\n\n${prompt}`.trim()
    : prompt;
}

/** Nom affiché d'une pièce jointe dans la bulle. Une figure annotée a une
 *  vignette ET un nom : sans l'exception `notes`, le nom de la figure source
 *  disparaissait dès qu'une vignette existait. Les collages ont leur puce. */
function labelledAttachments(attachments: Attachment[]): Attachment[] {
  return attachments.filter((a) => (!a.imageUrl || a.notes?.length) && a.kind !== "paste");
}

/** Champs de la bulle utilisateur tirés des pièces jointes : vignette, noms,
 *  notes de figure annotée et collages. */
export function userBubbleAttachmentFields(attachments: Attachment[]) {
  const withImage = attachments.find((a) => a.imageUrl);
  const labelled = labelledAttachments(attachments);
  const withNotes = attachments.find((a) => a.notes?.length);
  const pastes = attachments.filter((a) => a.kind === "paste");
  return {
    ...(withImage ? { imageUrl: withImage.imageUrl } : {}),
    ...(labelled.length
      ? { label: labelled.map((a) => `${a.name}${a.lines ? ` (lines ${a.lines})` : ""}`).join(" · ") }
      : {}),
    ...(withNotes ? { notes: withNotes.notes } : {}),
    ...(pastes.length ? { pastes: pastes.map((a) => ({ name: a.name, text: a.text })) } : {}),
  };
}

/** Bulle user archivable : texte tapé + attachments structurés (chemins,
 *  lignes) — jamais le handoff, les textes injectés ni une data URL. Le
 *  collage garde son texte : c'est du contenu de l'utilisateur, et sans lui
 *  la chip d'une bulle restaurée n'ouvrait rien (2026-09-14). */
export function archivedUserEvent(
  bubble: { text: string; ts: number; label?: string },
  attachments: Attachment[],
  imagePaths: string[],
): UserDisplayEvent {
  const pastes = attachments.filter((a) => a.kind === "paste");
  return {
    kind: "user",
    text: bubble.text,
    ts: bubble.ts,
    ...(bubble.label ? { label: bubble.label } : {}),
    ...(pastes.length
      ? { pastes: pastes.map((a) => ({ name: a.name, lines: a.text.split("\n").length, text: a.text })) }
      : {}),
    ...(imagePaths.length ? { imagePaths } : {}),
  };
}

/** Inputs structurés selon la capability (plan 046) — plus réservé à Codex ;
 *  skillsAttach implique le support des inputs structurés. */
export function supportsStructuredInputs(capabilities: ProviderCapabilities | undefined, provider: string): boolean {
  return (capabilities?.imageInput ?? provider === "codex") || capabilities?.skillsAttach === true;
}

/** Entrées structurées du tour (images locales, skills de plugin, SKILL.md du
 *  catalogue), ou `undefined` quand le prompt texte suffit. */
export function structuredTurnInputs(
  supported: boolean,
  fullPrompt: string,
  imagePaths: string[],
  pluginSkills: Pick<PluginSkill, "name" | "path" | "type">[],
  catalogSkill: CatalogSkill | null,
): TurnInputs | undefined {
  if (!supported || !(imagePaths.length || pluginSkills.length || catalogSkill)) return undefined;
  return [
    {
      type: "text",
      text: catalogSkill ? `${fullPrompt}\n\n${skillAttachInstruction(catalogSkill)}` : fullPrompt,
    },
    ...imagePaths.map((path) => ({ type: "local_image" as const, path })),
    ...pluginSkills.map((skill) => ({ type: skill.type ?? "skill" as const, name: skill.name, path: skill.path })),
    ...(catalogSkill ? [{ type: "skill" as const, name: catalogSkill.name, path: catalogSkill.path }] : []),
  ];
}

/** Réglages fournisseur du tour. Niveau de service Codex : `priority`
 *  seulement quand Fast est actif ; Standard n'envoie RIEN et laisse le
 *  défaut Codex décider. */
export function providerTurnOptions(turn: {
  provider: string;
  model?: string;
  effort?: string;
  permissionMode?: string;
  fastMode?: boolean;
  webSearch?: boolean;
  additionalDirectories: string[];
}): Pick<SendOptions, "model" | "effort" | "permissionMode" | "fastMode" | "webSearch" | "additionalDirectories"> {
  const codex = turn.provider === "codex";
  return {
    ...(turn.model ? { model: turn.model } : {}),
    ...(turn.effort ? { effort: turn.effort } : {}),
    ...(turn.permissionMode ? { permissionMode: turn.permissionMode } : {}),
    ...(codex && turn.fastMode ? { fastMode: true } : {}),
    ...(codex && turn.webSearch ? { webSearch: true } : {}),
    ...(codex && turn.additionalDirectories.length ? { additionalDirectories: turn.additionalDirectories } : {}),
  };
}

const GOAL_CLEAR_WORDS = ["clear", "stop", "off", "reset", "none", "cancel"];

/** `/goal [objectif|clear…]` : argument et intention d'effacement, ou `null`. */
export function parseGoalCommand(prompt: string): { arg: string; isClear: boolean } | null {
  const match = /^\/goal(?:\s+([\s\S]*))?$/.exec(prompt.trim());
  if (!match) return null;
  const arg = (match[1] ?? "").trim();
  return { arg, isClear: GOAL_CLEAR_WORDS.includes(arg.toLowerCase()) };
}
