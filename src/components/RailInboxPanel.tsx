// Liste de la boîte « À traiter » (chargée à l'ouverture, cf. RailInbox).
import { isDiscussionContext } from "../lib/discussions";
import { dismissArticleImport, fileName, openArticleDialog, type ArticleJob } from "../lib/articleImports";
import { buildInbox, shortAge, type InboxGroup, type InboxItem } from "../lib/railInbox";
import { MenuPanelItem } from "./ui/MenuPanel";
import { RowButton } from "./ui/RowButton";
import type { RailInboxProps } from "./RailInbox";

import { CirclePauseIcon, CircleQuestionMarkIcon, MessageSquareIcon, ShieldIcon, XIcon, type LucideIcon } from "lucide-react";
const GROUP_LABEL: Record<InboxGroup, string> = {
  wait: "Attend ta réponse",
  fail: "Échecs",
  done: "Terminé",
};

const ICONS: Record<InboxItem["icon"], LucideIcon> = {
  permission: ShieldIcon, question: CircleQuestionMarkIcon, paused: CirclePauseIcon, done: MessageSquareIcon, fail: XIcon,
};

function InboxIcon({ item }: { item: InboxItem }) {
  const Glyph = ICONS[item.icon];
  return <Glyph className={`rail-inbox-icon ${item.group}`} size={14} />;
}

export default function RailInboxPanel(p: RailInboxProps & {
  ragdocOn: boolean;
  jobs: readonly ArticleJob[];
  onClose: () => void;
}) {
  const articleFailures: InboxItem[] = p.ragdocOn ? p.jobs
    .filter((job) => job.phase === "error")
    .map((job) => ({
      id: `article:${job.requestId}`, group: "fail" as const, icon: "fail" as const,
      title: "Conversion échouée", detail: fileName(job.path), at: null,
    })) : [];
  const items = [...buildInbox(p.threads, p.attention, p.unread, p.activeId, isDiscussionContext), ...articleFailures];
  const groups = (["wait", "fail", "done"] as const)
    .map((group) => [group, items.filter((item) => item.group === group)] as const)
    .filter(([, list]) => list.length > 0);
  const readable = items.some((item) => item.group !== "wait");

  const openItem = (item: InboxItem) => {
    p.onClose();
    if (item.id.startsWith("article:")) openArticleDialog(item.id.slice("article:".length));
    else if (item.threadId) p.onOpen(item.threadId);
  };
  const markAllRead = () => {
    p.onMarkAllRead();
    for (const item of articleFailures) dismissArticleImport(item.id.slice("article:".length));
  };

  return (
    <>
      <div className="rail-inbox-head">
        <span className="rail-inbox-title">À traiter</span>
        {readable && <RowButton className="rail-inbox-clear" onClick={markAllRead}>Tout marquer comme lu</RowButton>}
      </div>
      {groups.length === 0 && <p className="rail-inbox-empty">Rien ne t’attend.</p>}
      {groups.map(([group, list]) => (
        <div key={group} className="rail-inbox-group" role="group" aria-label={GROUP_LABEL[group]}>
          <div className="rail-inbox-label">{GROUP_LABEL[group]}</div>
          {list.map((item) => (
            <MenuPanelItem key={item.id} className="rail-inbox-item" onClick={() => openItem(item)}>
              <InboxIcon item={item} />
              <span className="rail-inbox-text">
                <span className="rail-inbox-main">{item.title}</span>
                <span className="rail-inbox-detail">{item.detail}</span>
              </span>
              {item.at != null && <time className="rail-inbox-age">{shortAge(item.at)}</time>}
            </MenuPanelItem>
          ))}
        </div>
      ))}
    </>
  );
}
