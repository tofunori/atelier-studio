import type { ReactNode } from "react";

export type PaletteSection = "actions" | "fichiers" | "chats" | "surfaces" | "references";

export type PaletteItem = {
  id: string;
  label: string;
  hint?: string;
  section: PaletteSection;
  icon?: ReactNode;
  run: () => void;
};

type PaletteThread = {
  id: string;
  title: string;
  provider: string;
  projectRoot?: string;
};

type PaletteZoteroItem = {
  key: string;
  title: string;
  creators?: string;
  year?: string;
  citeKey?: string;
};

export type PaletteContext = {
  files: string[];
  threads: PaletteThread[];
  zotero?: PaletteZoteroItem[];
  t: (key: any, vars?: Record<string, string | number | null | undefined>) => string;
  actions: {
    newChat: () => void;
    openResume: () => void;
    switchSurface: (surface: "atelier" | "browser" | "terminal" | "git" | "biblio") => void;
    setLayout: (layout: "chat" | "split" | "atelier") => void;
    openSettings: () => void;
    retitleAll: () => void;
    nextTheme: () => void;
    openFile: (rel: string) => void;
    openThread: (threadId: string, projectRoot?: string) => void;
    selectZotero: (key: string) => void;
  };
};

function isWordStart(label: string, index: number): boolean {
  if (index === 0) return true;
  return /[\s/_\-.:()[\]{}]/.test(label[index - 1]);
}

export function fuzzyScore(query: string, label: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const l = label.toLowerCase();
  let score = 0;
  let qi = 0;
  let last = -2;
  for (let i = 0; i < l.length && qi < q.length; i++) {
    if (l[i] !== q[qi]) continue;
    score += 1;
    if (i === 0) score += 3;
    else if (isWordStart(l, i)) score += 2;
    if (i === last + 1) score += 2;
    if (i === qi) score += 1;
    last = i;
    qi++;
  }
  if (qi !== q.length) return 0;
  return score + Math.max(0, 12 - label.length / 4);
}

export function buildItems(ctx: PaletteContext): PaletteItem[] {
  const { t, actions } = ctx;
  const actionItems: PaletteItem[] = [
    {
      id: "action:new-chat",
      label: t("palette.action.new-chat"),
      hint: t("palette.hint.chat"),
      section: "actions",
      run: actions.newChat,
    },
    {
      id: "action:resume",
      label: t("palette.action.resume-session"),
      hint: t("palette.hint.session"),
      section: "actions",
      run: actions.openResume,
    },
    {
      id: "action:settings",
      label: t("palette.action.settings"),
      hint: t("palette.hint.app"),
      section: "actions",
      run: actions.openSettings,
    },
    {
      id: "action:retitle",
      label: t("palette.action.retitle"),
      hint: t("palette.hint.sidecar"),
      section: "actions",
      run: actions.retitleAll,
    },
    {
      id: "action:next-theme",
      label: t("palette.action.next-theme"),
      hint: t("palette.hint.theme"),
      section: "actions",
      run: actions.nextTheme,
    },
    {
      id: "layout:chat",
      label: t("palette.action.layout-chat"),
      hint: t("palette.hint.layout"),
      section: "actions",
      run: () => actions.setLayout("chat"),
    },
    {
      id: "layout:split",
      label: t("palette.action.layout-split"),
      hint: t("palette.hint.layout"),
      section: "actions",
      run: () => actions.setLayout("split"),
    },
    {
      id: "layout:atelier",
      label: t("palette.action.layout-atelier"),
      hint: t("palette.hint.layout"),
      section: "actions",
      run: () => actions.setLayout("atelier"),
    },
  ];

  const surfaceItems: PaletteItem[] = [
    ["atelier", "atelier.surface"],
    ["browser", "atelier.browser"],
    ["terminal", "atelier.terminal"],
    ["git", "atelier.git"],
    ["biblio", "atelier.biblio"],
  ].map(([surface, labelKey]) => ({
    id: `surface:${surface}`,
    label: t("palette.action.switch-surface", { surface: t(labelKey) }),
    hint: t("palette.hint.surface"),
    section: "surfaces",
    run: () => actions.switchSurface(surface as "atelier" | "browser" | "terminal" | "git" | "biblio"),
  }));

  const fileItems: PaletteItem[] = ctx.files.slice(0, 300).map((file) => ({
    id: `file:${file}`,
    label: file.split("/").pop() || file,
    hint: file,
    section: "fichiers",
    run: () => actions.openFile(file),
  }));

  const threadItems: PaletteItem[] = ctx.threads.map((thread) => ({
    id: `chat:${thread.id}`,
    label: thread.title || thread.id,
    hint: thread.provider,
    section: "chats",
    run: () => actions.openThread(thread.id, thread.projectRoot),
  }));

  const zoteroItems: PaletteItem[] = (ctx.zotero ?? []).map((item) => ({
    id: `reference:${item.key}`,
    label: item.title || item.key,
    hint: [item.creators, item.year, item.citeKey ? `@${item.citeKey}` : null].filter(Boolean).join(" · "),
    section: "references",
    run: () => actions.selectZotero(item.key),
  }));

  return [...actionItems, ...surfaceItems, ...fileItems, ...threadItems, ...zoteroItems];
}
