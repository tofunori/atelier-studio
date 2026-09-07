// Menu contextuel d'une rangée de la bibliothèque (point 5) : mêmes actions
// que l'entête du lecteur, à portée de clic droit. Aucun <button> nu — les
// items sont ceux de la primitive Base UI enveloppée dans shadcn/.
import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../shadcn/context-menu";
import { t } from "../../lib/i18n";
import type { ZoteroItem } from "./types";

export type BiblioRowMenuActions = {
  openPdf: (item: ZoteroItem) => void;
  cite: (item: ZoteroItem) => void;
  pinToKb: (item: ZoteroItem) => void;
  toggleFav: (item: ZoteroItem) => void;
  copyKey: (item: ZoteroItem) => void;
  revealInZotero: (item: ZoteroItem) => void;
};

export function BiblioRowMenu({
  item,
  actions,
  children,
}: {
  item: ZoteroItem;
  actions: BiblioRowMenuActions;
  children: ReactNode;
}) {
  return (
    <ContextMenu>
      {children}
      <ContextMenuContent className="biblio-row-menu" aria-label={t("biblio.row-menu")}>
        <ContextMenuItem disabled={!item.hasPdf} onClick={() => actions.openPdf(item)}>
          {t("biblio.open-pdf")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => actions.cite(item)}>{t("biblio.cite")}</ContextMenuItem>
        <ContextMenuItem disabled={!item.pdfKey || !item.pdfFile} onClick={() => actions.pinToKb(item)}>
          {t("biblio.add-kb")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => actions.toggleFav(item)}>
          {item.fav ? t("action.remove-favorite") : t("action.add-favorite")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => actions.copyKey(item)}>{t("biblio.copy-key")}</ContextMenuItem>
        <ContextMenuItem onClick={() => actions.revealInZotero(item)}>
          {t("biblio.reveal-zotero")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
