/** Serialized by atelier-core/src/gallery_builder.rs and consumed by both gallery UIs. */
export type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};
export interface GalleryRow {
  thumb: string | null;
  code: boolean;
  archive: boolean;
  name: string;
  rel: string;
  folder: string;
  ext: string;
  mdate: string;
  bdate: string;
  mtime: number;
  btime: number;
  size: number;
  provenance?: JsonValue;
}
export interface GalleryData {
  files: GalleryRow[]; folders: string[]; favs: string[];
  root: string; title: string; wordmark: string; project: string;
  count: number; countLabel: string; gen: string; ver: string;
}
export type GalleryFileType = {key: string; label: string; active: boolean; pinned: boolean};
export type GalleryFileTypePreset = {id: string; label: string; extensions: string[]; custom: boolean; active: boolean};
export interface GalleryFileTypeState {
  projectName: string; types: GalleryFileType[]; pinned: string[];
  presets: GalleryFileTypePreset[]; summary: string;
  /** Fichiers marqués archive (_archive*, menage_, tmp…) affichés ; masqués par défaut. */
  archives?: boolean; archiveCount?: number;
  /** Dossier choisi (et ses sous-dossiers) ; '' = tout le projet. */
  folder?: string; folderTree?: GalleryFolderTree;
}
/** Un dossier du bouton Dossier : chemin relatif, nom affiché, fichiers visibles. */
export interface GalleryFolderNode {path: string; label: string; count: number; children: GalleryFolderNode[]}
export interface GalleryFolderTree {total: number; folders: GalleryFolderNode[]}
export interface GalleryFileTypeAdapter {
  getState(): GalleryFileTypeState;
  setActive(extensions: string[]): void; setPinned(extensions: string[]): void;
  applyPreset(id: string): void; savePreset(name: string): void; removePreset(id: string): void;
  setArchives?(on: boolean): void;
  setFolder?(path: string): void;
  resetFilters(): void;
}
export type GallerySelectionState = {rels: string[]; imageCount: number};
export interface GalleryExportMode {mode: string; label: string}
export type GalleryExportResult = {ok: true; count: number; path: string} | {ok: false; error: string};
export interface GallerySelectionAdapter {
  getState(): GallerySelectionState;
  open(): void; compare(): void; collect(anchor: HTMLElement): void; export(anchor: HTMLElement): void;
  exportModes(): GalleryExportMode[]; exportTo(mode: string): Promise<GalleryExportResult>;
  hide(): void; delete(): void; clear(): void;
}
export interface GalleryPresentation {mode: 'grid' | 'list'; size: number; rows: 'compact' | 'comfortable'}
export interface GalleryPresentationAdapter {getState(): GalleryPresentation; set(patch: Partial<GalleryPresentation>): void}
export type GalleryColumn = 'name' | 'type' | 'size' | 'mtime' | 'status';
export interface Point {x: number; y: number}
export interface FigureShape {tool: 'rect' | 'ellipse' | 'arrow' | 'point'; x1: number; y1: number; x2: number; y2: number}
/** Poignée d'une marque sélectionnée, en pixels de l'image. */
export interface FigureHandle {id: string; x: number; y: number}
/** `draft` : à envoyer ; `sent` : envoyée à l'agent ; `done` : réglée. */
export type FigureNoteStatus = 'draft' | 'sent' | 'done';
/** Une note gardée avec sa version, en fractions de l'image : le modèle des
 *  notes de figure du connecteur (`atelier-annots-mcp/src/figures.rs`). */
export interface FigureNote {
  id: string; n: number; kind: 'box' | 'ellipse' | 'arrow' | 'point';
  x: number; y: number; w: number; h: number; text: string;
  status: FigureNoteStatus; t: number; sentAt?: number; doneAt?: number;
}
export type FigureStroke = FigureShape & {
  id?: string; color?: string; n?: number; note?: string;
  status?: FigureNoteStatus; t?: number; sentAt?: number; doneAt?: number;
  /** Note d'une version précédente, montrée sur la version affichée. */
  ghost?: boolean;
};
export interface AnnotationSession {
  strokes: FigureStroke[]; undo: FigureStroke[][]; redo: FigureStroke[][];
  /** Version où vivent ces notes ; absente, elles ne sont pas gardées. */
  hash?: string; size?: {w: number; h: number};
  /** Empreinte des notes déjà confiées au serveur. */
  saved?: string;
  /** Texte et tracé de chaque note à son envoi : un écart la rend « à envoyer ». */
  base?: Record<string, string>;
}
/** Notes d'une version précédente auxquelles la version affichée répond. */
export interface FigureFollow {version: number; hash: string; notes: FigureNote[]}
export interface FigureVersion {version: number; hash: string; created: number; rel: string; bytes: number; notes?: FigureNote[]}
/** A copy of the figure in another folder, with the history version it holds. */
export interface FigureCopy {rel: string; version: number}
export interface FigureCompare {a: number; b: number; mode: 'slider' | 'side'; pos: number}
export interface FigureHistory {
  /** Opened file, then its copies: one history for all of them. */
  rel: string; rels: string[]; rows: FigureVersion[]; copies: FigureCopy[]; bytes: number;
  selected: number | null; display?: number;
  follow: boolean; epoch: number; busy: boolean;
  /** Band opened by hand while the figure has a single version. */
  manual: boolean; compare: FigureCompare | null;
}
