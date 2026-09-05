// Search the real translated labels without mounting every provider panel.
import { t, type I18nKey } from "../../lib/i18n";
import { SECTIONS, type SectionId } from "./sections";

export const SEARCH_LABELS: Record<SectionId, readonly I18nKey[]> = {
  general: [
    "language.label",
    "settings.group.agents",
    "settings.default-claude-effort",
    "settings.default-codex-effort",
    "settings.group.tools",
    "settings.permission-default",
    "settings.web-search",
    "settings.group.conversations",
    "settings.thread-order",
    "settings.chat-titles",
    "settings.additional-dirs",
    "settings.setup-runtime",
    "settings.setup-node",
    "settings.sidecar",
    "settings.pasted-images",
    "settings.remote-devices",
  ],
  apparence: [
    "settings.interface",
    "settings.theme",
    "settings.base-size",
    "settings.density",
    "settings.reading",
    "settings.chat-text-size",
    "settings.reading-width",
    "settings.interline",
    "settings.group.theme",
    "settings.group.colors",
    "settings.accent",
    "settings.bg",
    "settings.text",
    "settings.group.typography",
    "settings.ui-font",
    "settings.code-font",
    "settings.smoothing",
    "settings.group.conversations",
    "settings.time-format",
    "chat.transcript-view",
    "settings.stream-fade",
    "settings.display-timestamps",
  ],
  modeles: [
    "settings.default-provider",
    "settings.models-new-thread",
    "settings.models-picker-order",
    "settings.api-providers",
    "settings.api-add",
    "settings.models-slug-group",
    "settings.slug-add",
  ],
  atelier: [
    "settings.gallery-folder",
    "settings.auto-refresh",
    "settings.group.gallery-exts",
    "settings.gallery-exts-default",
    "settings.review",
    "settings.autoreview-enable",
    "settings.autoreview-agent",
    "settings.autoreview-trigger",
    "appsnap.group.capture",
    "appsnap.enable",
    "appsnap.shortcut",
    "appsnap.destination",
    "appsnap.sound",
    "appsnap.group.permissions",
    "appsnap.input-monitoring",
    "appsnap.screen-recording",
    "appsnap.accessibility",
    "appsnap.status",
  ],
  consignes: [
  ],
};

const GROUP_LABELS = new Set<I18nKey>(["settings.group.agents", "settings.group.tools", "settings.group.conversations", "settings.setup-runtime", "settings.remote-devices", "settings.interface", "settings.reading", "settings.group.theme", "settings.group.colors", "settings.group.typography", "settings.models-picker-order", "settings.api-providers", "settings.models-slug-group", "settings.group.gallery-exts", "settings.review", "appsnap.group.capture", "appsnap.group.permissions"]);

export function searchSettings(query: string) {
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return SECTIONS.flatMap(section => [
    { section: section.id, label: t(section.labelKey), category: t(section.labelKey), target: null as string | null },
    ...SEARCH_LABELS[section.id].map(key => ({ section: section.id, label: t(key), category: t(section.labelKey), target: `${GROUP_LABELS.has(key) ? "group:" : ""}${t(key)}` as string | null })),
  ]).filter(entry => words.every(word => normalize(`${entry.label} ${entry.category}`).includes(word)));
}
