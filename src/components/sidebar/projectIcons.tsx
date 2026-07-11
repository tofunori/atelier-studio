// Icônes de projet (bibliothèque monochrome trait fin) — extraites de
// Sidebar.tsx au plan 024 pour casser le cycle Sidebar ↔ ProjectHeader.
// Sidebar.tsx les ré-exporte : Rail et TopBar ne changent pas leurs imports.

export const PROJ_ICONS: Record<string, string> = {
  mountain: "M1.5 12.5L6 4l3 5.5L11 6l3.5 6.5z",
  snow: "M8 1.5v13M3 4l10 8M13 4L3 12M5.5 2.8L8 4.5l2.5-1.7M5.5 13.2L8 11.5l2.5 1.7",
  thermo: "M6.5 2.5a1.5 1.5 0 0 1 3 0v6a3 3 0 1 1-3 0zM8 6v5",
  flame: "M8 1.8c1 2.4 4 3.6 4 7a4 4 0 0 1-8 0c0-2 1.2-3 2-4.4.5 1 1.4 1.4 2 1.4-.6-1.3-.4-2.7 0-4z",
  satellite: "M6 6L2.5 2.5M10 10l3.5 3.5M4.5 8.5l3-3 3 3-3 3zM11 3.5l1.5 1.5M3.5 11l1.5 1.5",
  chart: "M2 13.5V9M6 13.5V5.5M10 13.5V7.5M14 13.5V3.5",
  map: "M2 3.5l4-1.5 4 1.5 4-1.5v10l-4 1.5-4-1.5-4 1.5zM6 2v10.5M10 3.5V14",
  globe: "M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8zM1.8 8h12.4M8 1.8c2.2 2 2.2 10.4 0 12.4M8 1.8c-2.2 2-2.2 10.4 0 12.4",
  drop: "M8 1.8C10 5 12.5 7 12.5 9.8a4.5 4.5 0 0 1-9 0C3.5 7 6 5 8 1.8z",
  sun: "M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1",
  tree: "M8 14v-3M8 2l-3.5 4.5h2L3.5 10.5h9L9.5 6.5h2z",
  doc: "M4 1.8h5.2L13 5.6v8.6H4zM9 1.8v4h4",
  book: "M3 2.5h7.5a2 2 0 0 1 2 2v9H5a2 2 0 0 1-2-2zM3 11.5a2 2 0 0 1 2-2h7.5",
  pencil: "M11.5 2.5l2 2L6 12l-2.7.7L4 10z",
  micro: "M7 2.5l2.5 2.5-4 4L3 6.5zM8.2 7.8L10 9.5a4 4 0 0 1-6 3.6M4 13.5h8",
  flask: "M6.5 2h3M7 2v4l-3.4 6a1.5 1.5 0 0 0 1.3 2.2h6.2a1.5 1.5 0 0 0 1.3-2.2L9 6V2M5.5 10.5h5",
  term: "M1.8 2.8h12.4v10.4H1.8zM4.5 6l2.2 2-2.2 2M8.5 10.5h3",
  gear: "M8 5.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zM8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4",
  brain: "M6 2.5a2.5 2.5 0 0 0-2.5 2.5c-1 .5-1.5 1.5-1.5 2.5 0 1.2.7 2.2 1.7 2.7-.1 1.7 1.2 3.3 3.3 3.3h2c2.1 0 3.4-1.6 3.3-3.3 1-.5 1.7-1.5 1.7-2.7 0-1-.5-2-1.5-2.5A2.5 2.5 0 0 0 10 2.5c-.8 0-1.5.3-2 .9-.5-.6-1.2-.9-2-.9zM8 3.4v10",
  target: "M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8zM8 4.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zM8 7.4a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2z",
  rocket: "M8 1.8c2.5 1.5 3.5 4 3.5 6.5L13 10.5l-2.5.5-1 2.5-1.5-2h-0l-1.5 2-1-2.5L3 10.5l1.5-2.2C4.5 5.8 5.5 3.3 8 1.8zM8 6.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  compass: "M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8zM10.5 5.5L9 9 5.5 10.5 7 7z",
  box: "M2.5 5L8 2l5.5 3v6L8 14l-5.5-3zM2.5 5L8 8l5.5-3M8 8v6",
  folder: "M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.4 1.6h5.6c.7 0 1.2.5 1.2 1.2v6c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2v-7.6z",
};

export const PROJ_COLORS = [
  "#e05d5d", "#e8823a", "#8b5cf6", "#3b82f6",
  "#22b07d", "#e0b74a", "#64748b", "#ec4899",
] as const;

export function ProjIcon({ name, size = 13 }: { name: string; size?: number }) {
  const d = PROJ_ICONS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
