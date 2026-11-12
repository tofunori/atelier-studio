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
}
export interface GalleryFileTypeAdapter {
  getState(): GalleryFileTypeState;
  setActive(extensions: string[]): void; setPinned(extensions: string[]): void;
  applyPreset(id: string): void; savePreset(name: string): void; removePreset(id: string): void;
  setArchives?(on: boolean): void;
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
export interface FigureShape {tool: 'rect' | 'ellipse' | 'arrow'; x1: number; y1: number; x2: number; y2: number}
export type FigureStroke = FigureShape & {id?: string; color?: string; n?: number; note?: string};
export interface AnnotationSession {strokes: FigureStroke[]; undo: FigureStroke[][]; redo: FigureStroke[][]}
export interface FigureVersion {version: number; hash: string; created: number; rel: string; bytes: number}
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
