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
}
export interface GalleryFileTypeAdapter {
  getState(): GalleryFileTypeState;
  setActive(extensions: string[]): void; setPinned(extensions: string[]): void;
  applyPreset(id: string): void; savePreset(name: string): void; removePreset(id: string): void;
  resetFilters(): void;
}
export type GallerySelectionState = {rels: string[]; imageCount: number};
export interface GallerySelectionAdapter {
  getState(): GallerySelectionState;
  open(): void; compare(): void; collect(anchor: HTMLElement): void; export(anchor: HTMLElement): void;
  hide(): void; delete(): void; clear(): void;
}
export interface GalleryPresentation {mode: 'grid' | 'list'; size: number; rows: 'compact' | 'comfortable'}
export interface GalleryPresentationAdapter {getState(): GalleryPresentation; set(patch: Partial<GalleryPresentation>): void}
export type GalleryColumn = 'name' | 'type' | 'size' | 'mtime' | 'status';
export interface Point {x: number; y: number}
export interface FigureShape {tool: 'rect' | 'ellipse' | 'arrow'; x1: number; y1: number; x2: number; y2: number}
export type FigureStroke = FigureShape & {id?: string; color?: string; n?: number; note?: string};
export interface AnnotationSession {strokes: FigureStroke[]; undo: FigureStroke[][]; redo: FigureStroke[][]}
export interface FigureVersion {version: number; hash: string; created: number; [key: string]: unknown}
export interface FigureHistory {
  rel: string; rows: FigureVersion[]; selected: number | null; display?: number;
  follow: boolean; epoch: number; busy: boolean;
}
