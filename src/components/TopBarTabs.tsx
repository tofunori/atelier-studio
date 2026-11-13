// Onglets du pane focalisé, dans la barre du haut (lot 068). Ils vivaient
// dans le rail depuis `806a20bb` (« le rail porte les onglets, la bande
// disparaît »), réduits à un monogramme de deux lettres faute de place à
// 48 px : `methods_en.tex` et `memoire.tex` donnaient tous deux « me », et il
// fallait survoler chaque tuile pour savoir laquelle était laquelle. La barre
// du haut a la largeur qui manquait — le nom s'écrit, l'extension distingue,
// et la croix de fermeture tient sans manger le libellé.
//
// Le rail garde ce qu'il sait porter : les vues, les projets, l'activité.
import { requestWorkspacePaneMenu } from "../lib/workspacePaneMenu";
import { useLayoutEffect, useRef, useState } from "react";
import { MessageSquareIcon } from "lucide-react";
import { t } from "../lib/i18n";
import { moveDocumentTabFocus } from "../lib/surfaceKeyboard";
import { CloseIcon } from "./icons";
import { type Surface } from "./surfaces";
import { parseWorkspaceTabId } from "../lib/workspaceLayout";
import { dispatchWorkspacePointerDragStart, shouldSuppressWorkspaceSourceClick } from "../lib/workspaceDrag";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";
import { IconButton, RowButton } from "./ui";
import "../styles/document-tabs.css";
import { FileGlyph, type FileKind } from "./fileGlyphs";
import { fileKind } from "../lib/fileKind";

/** Au-delà, les onglets passent dans le menu de débordement, qui affiche les
 *  noms complets. Huit tiennent sur 1440 px une fois la recherche réduite à
 *  son icône et les surfaces épinglées ramenées à trois (lot 068) — soit
 *  autant que les huit tuiles du rail, mais nommés. */
export const MAX_TABS = 8;

export type PaneTab = {
  id: string;
  title: string;
  url?: string;
  /** onglet du pane : document, surface, agent ou IDE (plan 057) */
  kind?: "document" | "surface" | "agent" | "ide";
  surface?: Surface;
};

/** Nom affiché : dernier segment du chemin, extension GARDÉE — c'est elle qui
 *  sépare `memoire.tex` de `memoire.pdf`. La troncature est laissée au CSS
 *  (ellipse), jamais calculée ici : elle dépend de la largeur réelle. */
export function tabLabel(title: string): string {
  const base = (String(title ?? "").split("/").pop() ?? "").trim();
  // L'éditeur LaTeX en mode PDF s'intitule « memoire.tex — PDF » : dans un
  // onglet, ce suffixe long faisait de « .tex — PDF » une fausse extension
  // que l'ellipse séparait du nom (« supple…  .tex — PDF »). On montre ce
  // qu'on voit : le PDF, `memoire.pdf`.
  const pdf = /^(.+?)(?:\.[^.\s]+)?\s+—\s+PDF$/.exec(base);
  if (pdf) return `${pdf[1]}.pdf`;
  return base || t("tabs.untitled");
}

/** Coupe le nom en tronc + extension : l'ellipse mord le TRONC, l'extension
 *  reste toujours lisible (`methods_e….tex`). Couper la fin, comme le faisait
 *  un simple `text-overflow`, effaçait justement ce qui sépare `memoire.tex`
 *  de `memoire.pdf`. */
export function splitLabel(label: string): { stem: string; ext: string } {
  const dot = label.lastIndexOf(".");
  if (dot <= 0 || dot === label.length - 1) return { stem: label, ext: "" };
  return { stem: label.slice(0, dot), ext: label.slice(dot) };
}

/** Dossier parent, pour distinguer deux fichiers homonymes ouverts ensemble. */
export function parentFolder(title: string): string {
  const parts = String(title ?? "").split("/").filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

/** id d'onglet → préfixe de dossier à afficher, vide quand le nom suffit.
 *  N'ajoute JAMAIS de préfixe à un nom unique : la barre resterait bruyante
 *  pour régler un problème qui ne se pose pas. */
export function folderPrefixes(tabs: PaneTab[]): Map<string, string> {
  const seen = new Map<string, number>();
  for (const tab of tabs) {
    const label = tabLabel(tab.title);
    seen.set(label, (seen.get(label) ?? 0) + 1);
  }
  const out = new Map<string, string>();
  for (const tab of tabs) {
    const folder = (seen.get(tabLabel(tab.title)) ?? 0) > 1 ? parentFolder(tab.title) : "";
    if (folder) out.set(tab.id, folder);
  }
  return out;
}

export function extensionOf(tab: PaneTab): string {
  if (/\s—\sPDF$/.test(String(tab.title ?? ""))) return "pdf";
  const source = tab.url && tab.url.includes(".") ? tab.url : tab.title;
  return (/\.([a-z0-9]+)(?:[?#].*)?$/i.exec(String(source ?? ""))?.[1] ?? "").toLowerCase();
}

/** Type de glyphe : le même classement que l'explorateur (fileKind), pour
 *  qu'un fichier porte la même forme et la même teinte partout. */
export function kindOf(tab: PaneTab): FileKind {
  return fileKind(extensionOf(tab));
}

function KindGlyph({ kind }: { kind: FileKind }) {
  return <FileGlyph className="topbar-tab-kind" kind={kind} size={14} />;
}

/** Icône de tête : un fil d'agent porte sa bulle, un fichier son type. Les
 *  surfaces et l'IDE n'arrivent jamais ici — voir `isDocumentTab`. */
export function tabIcon(tab: PaneTab) {
  if (tab.kind === "agent") {
    return (
      <MessageSquareIcon size={14} className="topbar-tab-kind" />
    );
  }
  return <KindGlyph kind={kindOf(tab)} />;
}

/**
 * Le ruban ne porte que ce qu'on a OUVERT, jamais où l'on travaille.
 *
 * Une surface (Galerie, Narval, Terminal, Git…) et l'IDE sont des
 * destinations : elles ont chacune leur icône dans le groupe de droite de la
 * même barre, avec le soulignement accent qui dit laquelle est active. Les
 * laisser aussi dans le ruban les faisait apparaître DEUX FOIS à quarante
 * pixels d'écart, et mettait sur une même ligne deux natures qui ne
 * répondent pas à la même question.
 *
 * Un fil d'agent, lui, reste : ce n'est pas un fichier, mais il n'a AUCUNE
 * icône à droite — l'exclure le rendrait introuvable et infermable depuis la
 * barre, c'est-à-dire l'onglet fantôme qu'on vient justement de supprimer.
 */
export function isDocumentTab(tab: PaneTab): boolean {
  return tab.kind !== "surface" && tab.kind !== "ide";
}

let ruler: CanvasRenderingContext2D | null = null;

/** Abrège le TRONC de chaque nom qui ne tient pas, au caractère près :
 *  `supplem….tex`. L'ellipse CSS (`text-overflow`) laissait un trou entre
 *  « … » et l'extension (la place du dernier caractère retiré), d'où le
 *  « supple…  .tex » de la barre. On mesure le texte avec la police réelle
 *  de l'onglet et on garde le plus long début qui tient. */
function shortenStems(tabs: HTMLElement[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tab of tabs) {
    const id = tab.dataset.tabId;
    const name = tab.querySelector<HTMLElement>(".topbar-tab-name");
    const stemNode = name?.querySelector<HTMLElement>(".topbar-tab-stem");
    const stem = stemNode?.dataset.stem ?? "";
    if (!id || !name || !stemNode || stem.length < 2) continue;
    ruler ??= document.createElement("canvas").getContext("2d");
    if (!ruler) return out;
    const style = getComputedStyle(name);
    ruler.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const folder = name.querySelector(".topbar-tab-folder")?.textContent ?? "";
    const ext = name.querySelector(".topbar-tab-ext")?.textContent ?? "";
    const room = name.clientWidth - 1;
    const width = (text: string) => ruler!.measureText(folder + text + ext).width;
    if (width(stem) <= room) continue;
    let low = 1, high = stem.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (width(`${stem.slice(0, mid)}…`) <= room) low = mid; else high = mid - 1;
    }
    out[id] = `${stem.slice(0, low).trimEnd()}…`;
  }
  return out;
}

export default function TopBarTabs(p: {
  tabs: PaneTab[];
  allTabsMenu?: boolean;
  activeTab: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const documents = p.tabs.filter(isDocumentTab);
  const strip = useRef<HTMLDivElement>(null);
  // Comme un navigateur : les onglets se partagent la place et rétrécissent
  // ensemble (CSS) ; arrivés à leur largeur minimale, ceux qui ne tiennent
  // plus passent dans le menu ⌄ au lieu d'être coupés au bord de la barre.
  // `fit` = combien d'onglets on montre ; il redescend tant que le dernier
  // déborde, et repart du maximum quand la place disponible change.
  const [fit, setFit] = useState(MAX_TABS);
  const [, setResized] = useState(0);
  // tronc abrégé par onglet (id → « supplem… ») quand le nom ne tient pas
  const [stems, setStems] = useState<Record<string, string>>({});
  const counted = useRef(p.tabs.length);
  useLayoutEffect(() => {
    const element = strip.current;
    if (!element) return;
    // un onglet de plus ou de moins : on remesure depuis le maximum
    if (counted.current !== p.tabs.length) {
      counted.current = p.tabs.length;
      if (fit < MAX_TABS) { setFit(MAX_TABS); return; }
    }
    const tabs = Array.from(element.querySelectorAll<HTMLElement>(".topbar-tab"));
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || tabs.length === 0) return;
    // une barre très étroite masque les onglets inactifs (@container dans
    // local-headers.css) : masqué compte comme « ne tient pas »
    const outside = (node: Element) => getComputedStyle(node).display === "none"
      || node.getBoundingClientRect().right > bounds.right + 1;
    const first = tabs.findIndex(outside);
    const more = element.querySelector(".topbar-tab-more");
    const next = first >= 0 ? first : more && outside(more) ? tabs.length - 1 : tabs.length;
    // même l'actif masqué (barre minuscule) : tout passe dans le compteur
    if (next < tabs.length) { setFit(next === 0 && getComputedStyle(tabs[0]).display === "none" ? 0 : Math.max(1, next)); return; }
    const cut = shortenStems(tabs);
    if (Object.keys(cut).length !== Object.keys(stems).length || Object.entries(cut).some(([id, stem]) => stems[id] !== stem)) setStems(cut);
  });
  useLayoutEffect(() => {
    const element = strip.current;
    const host = element?.closest(".topbar-right") ?? element?.parentElement;
    if (!host) return;
    let width = -1;
    const observer = new ResizeObserver(() => {
      const next = host.getBoundingClientRect().width;
      if (Math.abs(next - width) < 1) return;
      width = next;
      // `fit` peut déjà valoir le maximum : le compteur force quand même un
      // rendu, donc une nouvelle mesure
      setFit(MAX_TABS);
      setResized(count => count + 1);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // aucun document ouvert : le ruban DISPARAÎT au lieu d'afficher un vide —
  // la barre retrouve exactement sa forme d'avant le lot 068
  if (documents.length === 0) return null;

  // l'onglet actif reste toujours dans la barre, à la dernière place visible
  const shown = Math.min(fit, MAX_TABS);
  const head = documents.slice(0, shown);
  const active = documents.find(tab => tab.id === p.activeTab);
  const visible = shown > 0 && active && !head.includes(active) ? [...head.slice(0, shown - 1), active] : head;
  const overflow = documents.filter(tab => !visible.includes(tab));
  const prefixes = folderPrefixes(visible);

  return (
    <div ref={strip} className="topbar-tabs" role="group" aria-label={t("tabs.open-files")}
      onKeyDown={event => moveDocumentTabFocus(event, ".topbar-tab-main")}>
      {visible.map((tab) => {
        // Le glisser d'un onglet vers un autre pane suivait les tuiles du
        // rail depuis la disparition de la bande ; il suit les onglets ici,
        // même mécanisme et même cible.
        const ref = parseWorkspaceTabId(tab.id);
        const label = tabLabel(tab.title);
        const on = tab.id === p.activeTab;
        return (
          <span key={tab.id} className={`topbar-tab document-tab-shell ${on ? "on" : ""}`} data-active={on} data-tab-id={tab.id}
            // clic droit = actions de CE document (scinder, épingler, couleur,
            // fermer le pane) ; l'icône isolée qui les portait est partie
            onContextMenu={(event) => {
              if (!on) p.onSelectTab(tab.id);
              requestWorkspacePaneMenu(event, { id: tab.id });
            }}>
            <RowButton
              className="topbar-tab-main"
              // le chemin complet, utile dès que l'ellipse mord. L'ancienne
              // infobulle annonçait « — ⌥N » : ce raccourci n'a JAMAIS existé
              // (aucun handler alt+chiffre dans l'app), il est parti avec.
              title={tab.title}
              aria-current={on ? "page" : undefined}
              onClickCapture={(event: React.MouseEvent) => {
                if (!ref || !shouldSuppressWorkspaceSourceClick(ref)) return;
                event.preventDefault();
                event.stopPropagation();
              }}
              onPointerDown={(event: React.PointerEvent) => {
                if (ref) dispatchWorkspacePointerDragStart(event.nativeEvent, ref);
              }}
              onClick={() => p.onSelectTab(tab.id)}
              onAuxClick={(event: React.MouseEvent) => {
                // clic milieu = fermer, comme dans toute bande d'onglets —
                // la croix reste là pour ceux qui ne le savent pas
                if (event.button !== 1) return;
                event.preventDefault();
                p.onCloseTab(tab.id);
              }}
            >
              {tabIcon(tab)}
              {/* tronc, extension et dossier vivent dans UNE seule boîte :
                  RowButton pose une gouttière entre chacun de ses enfants
                  directs, qui disloquait le nom en « methods_en .tex ». */}
              <span className="topbar-tab-name">
                {prefixes.get(tab.id) && (
                  <span className="topbar-tab-folder">{prefixes.get(tab.id)}/</span>
                )}
                <span className="topbar-tab-stem" data-stem={splitLabel(label).stem}>{stems[tab.id] ?? splitLabel(label).stem}</span>
                {splitLabel(label).ext && (
                  <span className="topbar-tab-ext">{splitLabel(label).ext}</span>
                )}
              </span>
            </RowButton>
            <IconButton
              className="topbar-tab-close document-tab-close"
              label={`${t("action.close-tab")} — ${label}`}
              title={t("action.close-tab")}
              onClick={() => p.onCloseTab(tab.id)}
            >
              <CloseIcon size={12} />
            </IconButton>
          </span>
        );
      })}
      {overflow.length > 0 && (
        <LazyDropdownMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          align="start"
          label={t("tabs.open-files")}
          // « +4 » plutôt qu'un chevron : celui du menu des surfaces suit juste à
          // droite, deux ⌄ côte à côte ne disaient pas lequel faisait quoi
          trigger={<RowButton className="topbar-tab-more" aria-label={t("tabs.open-files")}>+{overflow.length}</RowButton>}
          items={documents.map((tab) => ({
            key: tab.id,
            label: tabLabel(tab.title),
            onSelect: () => p.onSelectTab(tab.id),
          }))}
        />
      )}
    </div>
  );
}
