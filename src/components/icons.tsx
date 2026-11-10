// Icônes de l'app : UNE famille (Lucide), deux tailles de travail (12 et 14 px),
// trait unifié par primitives.css. Ce module garde les noms historiques : les
// appelants ne changent pas, et une taille hors grille (11, 13, 15) est ramenée
// sur la grille ici. Restent dessinés à la main : les logos de fournisseur
// (approximations sobres, monochromes en currentColor : le parent fixe la
// couleur, TRANS-05, SET-02) et le pont entre sessions, propres à Atelier.
import {
  ArrowDownIcon as LucideArrowDown, ArrowDownToLineIcon, ArrowUpIcon as LucideArrowUp,
  ArrowUpRightIcon as LucideArrowUpRight, BanIcon, BrainIcon, CheckIcon as LucideCheck,
  ChevronRightIcon, CopyIcon as LucideCopy, DownloadIcon as LucideDownload, EllipsisIcon,
  ExternalLinkIcon, EyeIcon, FileTextIcon, GitBranchIcon, GitForkIcon, GlobeIcon,
  HighlighterIcon as LucideHighlighter, HouseIcon, ImageIcon, LibraryIcon, ListFilterIcon,
  ListTreeIcon, Maximize2Icon, MessageSquareIcon, Minimize2Icon, MinusIcon as LucideMinus,
  PanelLeftIcon, PanelRightIcon, PlusIcon as LucidePlus, ReplyIcon as LucideReply, RotateCwIcon,
  SearchIcon as LucideSearch, SettingsIcon as LucideSettings, StarIcon as LucideStar,
  TriangleAlertIcon, XIcon, ZapIcon as LucideZap, type LucideIcon,
} from "lucide-react";

type IconProps = { size?: number };

/** Grille des tailles : 12 (dense), 14 (courant), 16 et plus tels quels. */
const grid = (size: number) => (size <= 12 ? 12 : size < 16 ? 14 : size);
/** Signes (croix, coche, chevron, tiret) : 12 px tant qu'ils ne sont pas en grand. */
const sign = (size: number) => (size < 16 ? 12 : size);

function family(Glyph: LucideIcon, fit = grid) {
  return function Icon({ size = 14 }: IconProps) {
    return <Glyph size={fit(size)} />;
  };
}

export function ClaudeIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" aria-hidden="true">
      <path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2M12.6 3.4L3.4 12.6" />
    </svg>
  );
}

export function CodexIcon({ size = 13 }: { size?: number }) {
  // marque OpenAI (monochrome)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.073zM13.2599 22.4301a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6455zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865a4.504 4.504 0 0 1-1.6464-6.1487zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997z"/>
    </svg>
  );
}

export function GrokIcon({ size = 13 }: { size?: number }) {
  // diagonale xAI (monochrome)
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" aria-hidden="true">
      <path d="M2.5 2.5l11 11M13.5 2.5L8 8M2.5 13.5L5.5 10.5" />
    </svg>
  );
}

// globe générique pour les providers API (OpenRouter, GLM, MiniMax…)
export const ApiProviderIcon = family(GlobeIcon);

export function ProviderIcon({ provider, size = 13 }: { provider: string; size?: number }) {
  if (provider === "codex") return <CodexIcon size={size} />;
  if (provider === "claude") return <ClaudeIcon size={size} />;
  if (provider === "grok") return <GrokIcon size={size} />;
  return <ApiProviderIcon size={size} />;
}

export const ResumeIcon = family(ArrowDownToLineIcon);

/* Vue de la transcription (sélecteur du header de conversation, 2026-08-21) :
   une icône par mode : œil (Normal), cerveau (Réflexion en cours), liste
   arborescente (Détaillé), lignes décroissantes (Résumé). */
export const ViewNormalIcon = family(EyeIcon);
export const ViewThinkingIcon = family(BrainIcon);
export const ViewDetailedIcon = family(ListTreeIcon);
export const ViewSummaryIcon = family(ListFilterIcon);

export const ForkIcon = family(GitForkIcon);
/** Marqueur de branche dans la barre latérale : une conversation qui repart
 * d'un point du fil parent. */
export const ForkBranchIcon = family(GitForkIcon);

/** Marqueur Atelier d'une continuité entre conversations. Ce n'est ni une
 * chaîne ni une couleur de statut : deux sessions, un passage explicite. */
export function SessionBridgeIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="3.75" cy="8" r="1.75" />
      <path d="M5.5 8h5" />
      <circle cx="12.25" cy="8" r="1.75" />
    </svg>
  );
}

export const BranchIcon = family(GitBranchIcon);
export const BookIcon = family(LibraryIcon);
export const StarIcon = family(LucideStar);
export const LedgerIcon = family(FileTextIcon);
export const CloseIcon = family(XIcon, sign);
export const MinusIcon = family(LucideMinus, sign);
export const RefreshIcon = family(RotateCwIcon);
export const GalleryIcon = family(ImageIcon);
export const HomeIcon = family(HouseIcon);
export const CheckIcon = family(LucideCheck, sign);
export const CopyIcon = family(LucideCopy);
export const OpenIcon = family(ExternalLinkIcon);
export const PlusIcon = family(LucidePlus);
export const ExpandIcon = family(Maximize2Icon);
export const CollapseIcon = family(Minimize2Icon);
export const SettingsIcon = family(LucideSettings);
export const SidebarIcon = family(PanelLeftIcon);
export const PanelIcon = family(PanelRightIcon);
export const SearchIcon = family(LucideSearch);
export const ArrowDownIcon = family(LucideArrowDown);
/** Vue « Chats » de la barre d'activité. */
export const ChatsIcon = family(MessageSquareIcon);
/** Vue « Surlignés » de la barre d'activité. */
export const HighlighterIcon = family(LucideHighlighter);
export const ZapIcon = family(LucideZap);
export const DownloadIcon = family(LucideDownload);
export const MoreIcon = family(EllipsisIcon);

/** Chevron de dépliage : pointe à droite ; l'état ouvert le tourne de 90°
 *  en CSS (.ui-disclosure-chevron[data-open]) : UNE convention partout. */
export function ChevronIcon({ size = 12, open }: IconProps & { open?: boolean }) {
  return <ChevronRightIcon className="ui-disclosure-chevron" data-open={open ? "" : undefined} size={sign(size)} />;
}

export const ArrowUpIcon = family(LucideArrowUp);

export function StarFilledIcon({ size = 14 }: IconProps) {
  return <LucideStar size={grid(size)} fill="currentColor" />;
}

/** Renvoyer dans le fil (Quick Ask « injecter »). */
export const ReplyIcon = family(LucideReply);
/** Ouvrir ailleurs / promouvoir en conversation. */
export const ArrowUpRightIcon = family(LucideArrowUpRight);
/** Alerte (erreur d'une réponse, état dégradé) : triangle au trait, pas d'emoji. */
export const AlertIcon = family(TriangleAlertIcon);
/** « Aucun » (pas de couleur, pas d'icône). */
export const NoneIcon = family(BanIcon);
