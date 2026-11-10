// Icônes de projet (bibliothèque monochrome trait fin, famille Lucide) — extraites de
// Sidebar.tsx au plan 024 pour casser le cycle Sidebar ↔ ProjectHeader.
// Sidebar.tsx les ré-exporte : Rail et TopBar ne changent pas leurs imports.

import {
  BookIcon, BoxIcon, BrainIcon, ChartNoAxesColumnIcon, CompassIcon, DropletIcon, FileIcon, FlameIcon,
  FlaskConicalIcon, FolderIcon, GlobeIcon, MapIcon, MicroscopeIcon, MountainIcon, PencilIcon, RocketIcon,
  SatelliteIcon, SettingsIcon, SnowflakeIcon, SquareTerminalIcon, SunIcon, TargetIcon, ThermometerIcon,
  TreePineIcon, type LucideIcon,
} from "lucide-react";


export const PROJ_ICONS: Record<string, LucideIcon> = {
  mountain: MountainIcon, snow: SnowflakeIcon, thermo: ThermometerIcon, flame: FlameIcon,
  satellite: SatelliteIcon, chart: ChartNoAxesColumnIcon, map: MapIcon, globe: GlobeIcon,
  drop: DropletIcon, sun: SunIcon, tree: TreePineIcon, doc: FileIcon, book: BookIcon,
  pencil: PencilIcon, micro: MicroscopeIcon, flask: FlaskConicalIcon, term: SquareTerminalIcon,
  gear: SettingsIcon, brain: BrainIcon, target: TargetIcon, rocket: RocketIcon,
  compass: CompassIcon, box: BoxIcon, folder: FolderIcon,
};

export const PROJ_COLORS = [
  "#e05d5d", "#e8823a", "#8b5cf6", "#3b82f6",
  "#22b07d", "#e0b74a", "#64748b", "#ec4899",
] as const;

export function ProjIcon({ name, size = 14 }: { name: string; size?: number }) {
  const Glyph = PROJ_ICONS[name];
  return Glyph ? <Glyph size={size} /> : null;
}
